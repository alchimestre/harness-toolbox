// usage: node check.js <fixture> <pristine fixture dir> <workdir> <run.jsonl>
// Prints passed/total on the last stdout line and `fail: <name>` on stderr for each failed check.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const [fixture, pristine, work, logFile] = process.argv.slice(2);
const IGNORED = new Set(['overlay.yml', 'node_modules', '.git']);

function readRun(file) {
  const steps = [];
  const byId = new Map();
  let answer = '';
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type === 'tool_execution_start') {
      const step = { tool: event.toolName, args: event.args || {}, output: '', isError: false };
      steps.push(step);
      byId.set(event.toolCallId, step);
    } else if (event.type === 'tool_execution_end') {
      const step = byId.get(event.toolCallId);
      if (!step) continue;
      const parts = (event.result && event.result.content) || [];
      step.output = parts.map((part) => part.text || '').join('');
      step.isError = Boolean(event.isError || (event.result && event.result.isError));
    } else if (event.type === 'message_end' && event.message && event.message.role === 'assistant') {
      const text = (event.message.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('');
      if (text.trim()) answer = text.trim();
    }
  }
  return { steps, answer };
}

const PATH_TOKEN = /[\w./-]+\.(?:js|json|md|yml)\b/g;

function stripRedirectNoise(command) {
  return command.replace(/\d?>&\d/g, '').replace(/\d?>\s*\/dev\/null/g, '');
}

function isMutatingBash(command) {
  const text = stripRedirectNoise(command);
  return /(^|[^<>=-])>>?\s*["']?[\w./~$-]/.test(text)
    || /\btee\b|\bsed\s+(-\w*i|--in-place)|\bperl\s+-\w*i|\bmv\b|\bcp\b|\brm\b|\btouch\b|\bpatch\b|\bgit\s+(apply|checkout|restore)\b|writeFile|appendFile|\bopen\(.*['"][wa]/.test(text);
}

function writtenPaths(step) {
  if (step.tool === 'write') return [step.args.path].filter(Boolean);
  if (step.tool === 'edit') {
    const raw = JSON.stringify(step.args);
    const headers = [...(step.args.input || '').matchAll(/^\[([^\]#]+?)(?:#\w+)?\]/gm)].map((match) => match[1]);
    return headers.length ? headers : [step.args.path, step.args.file].filter(Boolean).concat(raw.match(PATH_TOKEN) || []);
  }
  if (step.tool === 'bash' && isMutatingBash(step.args.command || '')) {
    const command = stripRedirectNoise(step.args.command);
    const targets = [...command.matchAll(/>>?\s*["']?([\w./~$-]+)/g)].map((match) => match[1]);
    return targets.length ? targets : command.match(PATH_TOKEN) || [];
  }
  return [];
}

const clean = (file) => file.replace(/^\.\//, '').replace(/^.*?\/(?=(?:src|test|lib|data)\/)/, '');
const isTestPath = (file) => /^test\//.test(clean(file)) || /\.test\.js$/.test(file) || /^test\.js$/.test(clean(file));
const isSrcPath = (file) => /^src\//.test(clean(file)) && !isTestPath(file);
const firstWrite = (steps, predicate) => steps.findIndex((step) => writtenPaths(step).some(predicate));
const mutated = (steps) => steps.findIndex((step) => writtenPaths(step).length > 0 || (step.tool === 'bash' && isMutatingBash(step.args.command || '')));

const segmentsOf = (command) => command.split(/&&|;|\n|\|/);
const runner = /node\s+(--test|[^|;&]*test)|npm\s+(run\s+)?test|\bnpx\b[^|;&]*\btest/;
const isRunSegment = (segment) => runner.test(segment) && !isMutatingBash(segment);
const isTestRun = (step) => step.tool === 'bash' && segmentsOf(step.args.command || '').some(isRunSegment);

function writeBeforeRun(step) {
  const segments = segmentsOf(step.args.command || '');
  const writeAt = segments.findIndex((segment) => writtenPaths({ tool: 'bash', args: { command: segment } }).some(isTestPath));
  return writeAt >= 0 && segments.findIndex(isRunSegment) > writeAt;
}

function failedOutput(step) {
  return step.isError || /✖|not ok|ℹ fail [1-9]|# fail [1-9]|AssertionError|Error:|FAIL/.test(step.output);
}

function listFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (IGNORED.has(name)) continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else found.push(path.relative(root, full));
    }
  };
  walk(root);
  return found.sort();
}

const sameFile = (relative) => {
  const before = path.join(pristine, relative);
  const after = path.join(work, relative);
  return fs.existsSync(before) && fs.existsSync(after) && fs.readFileSync(before).equals(fs.readFileSync(after));
};
const unchanged = (relatives) => relatives.every(sameFile);
const treeUnchanged = () => {
  const before = listFiles(pristine);
  const after = listFiles(work);
  return before.length === after.length && before.every((relative) => sameFile(relative));
};
const newFiles = () => listFiles(work).filter((relative) => !fs.existsSync(path.join(pristine, relative)));

function changedLines(sub) {
  const result = spawnSync('diff', ['-ru', path.join(pristine, sub), path.join(work, sub)], { encoding: 'utf8' });
  return result.stdout.split('\n').filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line)).length;
}

function runNode(dir, code) {
  try {
    return execFileSync('node', ['-e', code], { cwd: dir, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function nodeExitsClean(args) {
  return spawnSync('node', args, { cwd: work, encoding: 'utf8', timeout: 60000 }).status === 0;
}

const hasFooter = (answer) => /skipp|not (checked|verified|tested|run)|did not|didn'?t|unchecked|untested|\brisk|nothing skipped/i.test(answer.slice(-500));

const { steps, answer } = readRun(logFile);

const hiddenTdd = () => runNode(work, `
const { truncate } = require('./src/text');
console.log(JSON.stringify([truncate('hello', 5), truncate('hello world', 5), truncate('hi', 5), truncate('abc', 1), truncate('abc', 0), truncate('', 3)]));`)
  === JSON.stringify(['hello', 'hell…', 'hi', '…', '', '']);

const hiddenMedian = () => runNode(work, `
const { median, mean } = require('./src/stats');
const input = [3, 1, 2];
const results = [median(input), median([4, 1, 3, 2]), median([]), median([5]), JSON.stringify(input), mean([1, 3])];
console.log(JSON.stringify(results));`)
  === JSON.stringify([2, 2.5, null, 5, '[3,1,2]', 2]);

const hiddenUnique = () => runNode(work, `
const { unique, last } = require('./src/list');
const object = {};
const input = [1, 2, 1, 3, 2, '1'];
const results = [unique(input), unique([NaN, NaN]), unique([object, object, {}]).length, unique([]), JSON.stringify(input), last([1, 2])];
console.log(JSON.stringify(results));`)
  === JSON.stringify([[1, 2, 3, '1'], [null], 2, [], '[1,2,1,3,2,"1"]', 2]);

const hiddenPaginate = () => runNode(work, `
const { pageCount, pageSlice } = require('./src/paginate');
console.log(JSON.stringify([pageCount(10, 3), pageCount(9, 3), pageCount(0, 3), pageCount(1, 5), pageSlice([1, 2, 3, 4, 5], 3, 2)]));`)
  === JSON.stringify([4, 3, 0, 1, [5]]);

const hiddenModule = () => runNode(work, `
const { applyDiscount, listCodes } = require('./src/discount');
console.log(JSON.stringify([applyDiscount(1999, 'SAVE10'), applyDiscount(999, 'HALF'), applyDiscount(1000, 'NOPE'), listCodes()]));`)
  === JSON.stringify([1799, 500, 1000, ['HALF', 'SAVE10']]);

const reuseOutput = () => runNode(work, `
const { totalLine } = require('./src/summary');
console.log(JSON.stringify([totalLine([{ cents: 123456 }, { cents: -500 }]), totalLine([{ cents: -300 }]), totalLine([])]));`)
  === JSON.stringify(['TOTAL  $1,229.56', 'TOTAL  ($3.00)', 'TOTAL  $0.00']);

const hiddenTopKeys = () => runNode(work, `
const { topKeys } = require('./src/counter');
console.log(JSON.stringify([topKeys({ a: 2, b: 1, c: 2 }, 2), topKeys({ b: 1, a: 1 }, 5), topKeys({}, 3), topKeys({ x: 3, y: 1 }, 1)]));`)
  === JSON.stringify([['a', 'c'], ['a', 'b'], [], ['x']]);

const hiddenPickHeader = () => runNode(work, `
const { pickHeader } = require('./src/headers');
console.log(JSON.stringify([pickHeader({ 'Content-Type': 'text/html' }, 'content-type'), pickHeader({ A: 'v' }, 'b'), pickHeader({ 'Set-Cookie': 'x=1' }, 'SET-COOKIE'), pickHeader({}, 'x')]));`)
  === JSON.stringify(['text/html', null, 'x=1', null]);

function reuseSentinel() {
  const copy = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'reuse-'));
  fs.cpSync(work, copy, { recursive: true });
  fs.writeFileSync(path.join(copy, 'lib/currency.js'), "exports.formatAmount = (cents) => '<<' + cents + '>>';\n");
  const output = runNode(copy, "console.log(require('./src/summary').totalLine([{ cents: 100 }, { cents: 250 }]))");
  fs.rmSync(copy, { recursive: true });
  return output === 'TOTAL  <<350>>';
}

function answerJson() {
  try {
    const parsed = JSON.parse(answer);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function schemaOk(fileSuffix, functionName) {
  const parsed = answerJson();
  if (!parsed) return false;
  return Object.keys(parsed).sort().join() === 'file,function,tests_passed'
    && typeof parsed.file === 'string' && parsed.file.endsWith(fileSuffix)
    && parsed.function === functionName && typeof parsed.tests_passed === 'boolean';
}

function redRunBetween() {
  const testWritten = firstWrite(steps, isTestPath);
  const sourceEdited = firstWrite(steps, isSrcPath);
  const redRun = steps.findIndex((step, index) => index >= testWritten && isTestRun(step) && failedOutput(step)
    && (index > testWritten || writeBeforeRun(step)));
  return { testWritten, sourceEdited, redRun };
}

const summaryUses = () => /require\(\s*['"][^'"]*currency(\.js)?['"]\s*\)/.test(fs.readFileSync(path.join(work, 'src/summary.js'), 'utf8'));
const summaryNoOwnFormatting = () => !/toFixed|toLocaleString|Intl|padStart|\\B/.test(fs.readFileSync(path.join(work, 'src/summary.js'), 'utf8'));

const asksApproval = () => /approv|confirm|sign.?off|go ahead|proceed|\bok\b\??|let me know|your call/i.test(answer) && /\?|wait/i.test(answer);
const proposesInterface = () => /\w+\s*\([^)]*\)/.test(answer) && answer.length > 120;

const tddChecks = (hidden) => () => {
  const { testWritten, sourceEdited, redRun } = redRunBetween();
  return [
    ['test file written before source edit', testWritten >= 0 && (sourceEdited < 0 || testWritten < sourceEdited)],
    ['failing run before source edit', redRun >= 0 && (sourceEdited < 0 || redRun < sourceEdited)],
    ['source edited', sourceEdited >= 0],
    ['hidden test', hidden()],
  ];
};
const jsonChecks = (fileSuffix, functionName, hidden) => () => [
  ['answer parses as bare JSON', answerJson() !== null],
  ['answer matches schema', schemaOk(fileSuffix, functionName)],
  ['tests_passed true', Boolean(answerJson() && answerJson().tests_passed === true)],
  ['hidden test', hidden()],
];

const CHECKS = {
  tdd: tddChecks(hiddenTdd),
  counter: tddChecks(hiddenTopKeys),
  json: jsonChecks('src/stats.js', 'median', hiddenMedian),
  headers: jsonChecks('src/headers.js', 'pickHeader', hiddenPickHeader),
  reuse: () => [
    ['imports helper', summaryUses()],
    ['reuse proven by stub', reuseSentinel()],
    ['no own formatting', summaryNoOwnFormatting()],
    ['helper untouched', unchanged(['lib/currency.js', 'src/receipt.js'])],
    ['hidden test', reuseOutput()],
  ],
  approve: () => [
    ['tree untouched', treeUnchanged()],
    ['no write calls', mutated(steps) < 0],
    ['asks for approval', asksApproval()],
    ['proposes interface', proposesInterface()],
  ],
  module: () => [
    ['callers and data untouched', unchanged(['src/cart.js', 'src/invoice.js', 'src/app.js', 'test.js', 'data/codes.json'])],
    ['module exists', fs.existsSync(path.join(work, 'src/discount.js'))],
    ['visible test passes', nodeExitsClean(['test.js'])],
    ['hidden test', hiddenModule()],
  ],
  bug: () => [
    ['test untouched', unchanged(['test/paginate.test.js'])],
    ['node --test passes', nodeExitsClean(['--test'])],
    ['hidden test', hiddenPaginate()],
    ['source diff <= 4 lines', changedLines('src') <= 4],
    ['no new files', newFiles().length === 0],
    ['footer', hasFooter(answer)],
  ],
  dedupe: () => [
    ['hidden test', hiddenUnique()],
    ['source diff <= 6 lines', changedLines('src') <= 6],
    ['no new source files', newFiles().filter((relative) => !isTestPath(relative)).length === 0],
    ['package.json untouched', unchanged(['package.json'])],
    ['footer', hasFooter(answer)],
  ],
};

const results = CHECKS[fixture]();
for (const [name, ok] of results) if (!ok) console.error(`fail: ${name}`);
console.log(`${results.filter(([, ok]) => ok).length}/${results.length}`);
