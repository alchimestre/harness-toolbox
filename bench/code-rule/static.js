'use strict';
// Static checks on the lines an agent changed. usage: node static.js <fixture dir> <result dir>
// stdout: "comments=<new comments>" then "<categories passed>/5"; stderr: "fail: <category> <file>:<line> <detail>".
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MAX_FUNCTION_LINES = 40;
const MAX_NESTING = 3;
const CATEGORIES = ['comments', 'function-length', 'nesting', 'literals', 'paths'];
const CODE_EXT = new Set(['.js', '.mjs', '.cjs']);
const CONFIG_EXT = new Set(['.ini', '.yaml', '.yml', '.toml', '.env', '.conf', '.cfg', '.properties', '.sh']);
const TEXT_EXT = new Set(['.md', '.txt', '.json']);
const TEST_FILE = /(^|\/)(tests?|__tests__)\/|(^|\/)test[^/]*\.js$|\.(test|spec)\./;
const HOME_PATH = /~[\\/]|['"`]~['"`]|\/Users\/|\/home\/\w|[A-Za-z]:\\+Users/;
const ALLOWED_NUMBERS = new Set([0, 1, -1]);
const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;
const LITERAL_WORDS = new Set(['true', 'false', 'null', 'undefined', 'Infinity']);
const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'await']);
const BLOCK_WORDS = new Set(['else', 'try', 'finally', 'do']);
const VALUE_PRECEDING_KEYWORDS = new Set(['return', 'case', 'typeof', 'in', 'of', 'else', 'yield', 'throw', 'delete', 'void', 'new']);
const OPEN = new Set(['(', '[', '{', '${']);
const CLOSE = new Set([')', ']', '}', '}$']);
const CONTINUING = new Set(['.', '?', ':', '&&', '||', '??', '+', '-', '*', '/', '%', '|', '&', '<', '>', '=', '=>', '?.', '===', '!==', '==', '!=']);
const LEGAL = /copyright|licen[sc]e|spdx/i;
const WHY = /\b(because|otherwise|breaks?|broke|never|must|mustn't|don't|do not|careful|beware|footgun|silently|unless|even though|without|workaround|in sync|ordering|order matters|NaN|float(ing)?|precision|overflow|lossy|off-by-one|race|stale|crash(es)?|wrong|would|required|requires)\b/i;
const BANNER = /([-=*#~_])\1{2,}|^\s*(step|part|section|phase)\s*\d/i;
const HISTORY = /\b(TODO|FIXME|HACK|XXX)\b|#\d+|\b[A-Z]{2,}-\d+\b|\b(previously|used to|formerly|no longer|changed from|old (value|setting|behaviou?r)|roll ?back|revert)\b/i;
const CODE_LIKE = /[;{}]\s*$|^\s*(const|let|var|function|return|if|for|while|import|require|module\.exports)\b|^[\w.$\[\]'"-]+\s*=\s*\S|^\w[\w.]*\(.*\)$/;
const CONFIG_CODE_LIKE = /^[\w.-]+\s*[=:]\s*\S+$|^\[[\w.]+\]$/;
const STOP_WORDS = new Set('the and for with this that from into when then here now are was its all any not but our out has can will per use used using also'.split(' '));
const KEYWORD_SYNONYMS = {
  for: ['loop', 'each', 'every', 'iterate'],
  while: ['loop', 'repeat'],
  if: ['check', 'whether', 'when'],
  return: ['return', 'returns', 'give'],
  throw: ['throw', 'error', 'fail', 'invalid', 'reject'],
  new: ['create', 'creates', 'build'],
};

const isP = (tok, text) => Boolean(tok) && tok.t === 'p' && tok.s === text;
const isId = (tok, ...names) => Boolean(tok) && tok.t === 'id' && names.includes(tok.s);

function tokenize(src) {
  const tokens = [];
  const braces = [];
  let i = 0;
  let line = 1;
  const emit = (t, s, startLine, extra) => tokens.push({ t, s, line: startLine, end: line, ...extra });
  const countLines = (text) => { line += (text.match(/\n/g) || []).length; };
  const sticky = (re) => { re.lastIndex = i; return re.exec(src); };
  const NUMBER = /0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?/y;
  const IDENT = /[A-Za-z_$][\w$]*/y;
  const PUNCT = /=>|\.\.\.|===|!==|\?\.(?!\d)|==|!=|<=|>=|&&|\|\||\?\?|\+\+|--|\*\*|[+\-*\/%&|^]=|[\s\S]/y;

  function scanTemplate() {
    const startLine = line;
    let text = '';
    while (i < src.length) {
      const ch = src[i];
      if (ch === '\\') { text += src.slice(i, i + 2); countLines(src.slice(i, i + 2)); i += 2; continue; }
      if (ch === '`') { i++; emit('str', text, startLine); return; }
      if (ch === '$' && src[i + 1] === '{') {
        i += 2;
        braces.push('tpl');
        emit('str', text, startLine);
        emit('p', '${', line);
        return;
      }
      if (ch === '\n') line++;
      text += ch;
      i++;
    }
  }

  function regexAllowed() {
    const prev = tokens.filter((t) => t.t !== 'c').at(-1);
    if (!prev) return true;
    if (prev.t === 'num' || prev.t === 'str' || prev.t === 're') return false;
    if (prev.t === 'id') return VALUE_PRECEDING_KEYWORDS.has(prev.s);
    return !(prev.s === ')' || prev.s === ']' || prev.s === '}');
  }

  while (i < src.length) {
    const ch = src[i];
    const startLine = line;
    if (ch === '\n') { line++; i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') {
      const stop = src.indexOf('\n', i);
      const end = stop < 0 ? src.length : stop;
      emit('c', src.slice(i + 2, end), startLine, { block: false });
      i = end;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const stop = src.indexOf('*/', i + 2);
      const end = stop < 0 ? src.length : stop + 2;
      const text = src.slice(i + 2, stop < 0 ? src.length : stop);
      countLines(text);
      emit('c', text, startLine, { block: true });
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      emit('str', src.slice(i + 1, j), startLine);
      i = j + 1;
      continue;
    }
    if (ch === '`') { i++; scanTemplate(); continue; }
    if (ch === '}' && braces.at(-1) === 'tpl') {
      braces.pop();
      emit('p', '}$', line);
      i++;
      scanTemplate();
      continue;
    }
    const number = /[\d]|\.\d/.test(ch + (src[i + 1] || '')) ? sticky(NUMBER) : null;
    if (number) { emit('num', number[0], line); i += number[0].length; continue; }
    const ident = sticky(IDENT);
    if (ident) { emit('id', ident[0], line); i += ident[0].length; continue; }
    if (ch === '/' && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n' && (src[j] !== '/' || inClass)) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      j++;
      while (/[a-z]/.test(src[j] || '')) j++;
      emit('re', src.slice(i, j), startLine);
      i = j;
      continue;
    }
    if (ch === '{') braces.push('{');
    if (ch === '}') braces.pop();
    const punct = sticky(PUNCT)[0];
    emit('p', punct, line);
    i += punct.length;
  }
  return tokens;
}

function statementEnd(sig, start) {
  let depth = 0;
  for (let k = start; k < sig.length; k++) {
    const tok = sig[k];
    const next = sig[k + 1];
    if (tok.t === 'p' && OPEN.has(tok.s)) depth++;
    else if (tok.t === 'p' && CLOSE.has(tok.s)) {
      if (depth === 0) return k;
      depth--;
    } else if (depth === 0 && tok.t === 'p' && (tok.s === ';' || tok.s === ',')) return k;
    const continues = tok.t === 'p' && CONTINUING.has(tok.s) || next && next.t === 'p' && CONTINUING.has(next.s);
    if (depth === 0 && next && next.line > tok.end && !continues) return k + 1;
  }
  return sig.length;
}

function openEntry(sig, i, closeToOpen) {
  const tok = sig[i];
  const prev = sig[i - 1];
  const entry = { kind: tok.s === '{' ? 'obj' : tok.s, index: i, start: tok.line };
  if (tok.s !== '{' || !prev) return entry;
  if (isP(prev, '=>')) return { ...entry, kind: 'fn' };
  if (isId(prev, ...BLOCK_WORDS)) return { ...entry, kind: 'ctl' };
  if (!isP(prev, ')')) return entry;
  const open = closeToOpen.get(i - 1);
  if (isId(sig[open - 1], ...CONTROL)) return { ...entry, kind: 'ctl' };
  return { ...entry, kind: 'fn', start: sig[open].line };
}

function structure(sig) {
  const stack = [];
  const closeToOpen = new Map();
  const ctx = [];
  const lineDepth = new Map();
  const fns = [];
  let lastLine = 0;
  const depthNow = () => {
    const firstFn = stack.findIndex((e) => e.kind === 'fn');
    const inner = firstFn < 0 ? stack : stack.slice(firstFn + 1);
    return inner.filter((e) => e.kind === 'ctl' || e.kind === 'fn').length;
  };
  sig.forEach((tok, i) => {
    if (tok.t === 'p' && CLOSE.has(tok.s)) {
      const top = stack.pop();
      if (top && tok.s === ')') closeToOpen.set(i, top.index);
      if (top && top.kind === 'fn') fns.push({ start: top.start, end: tok.line });
    }
    ctx[i] = stack.length ? stack[stack.length - 1].kind : '';
    if (tok.line !== lastLine) { lineDepth.set(tok.line, depthNow()); lastLine = tok.line; }
    if (tok.t === 'p' && OPEN.has(tok.s)) stack.push(openEntry(sig, i, closeToOpen));
  });
  return { ctx, lineDepth, fns };
}

function declarationInfo(sig) {
  const info = new Map();
  sig.forEach((tok, i) => {
    if (!isId(tok, 'const', 'let', 'var') || sig[i + 1]?.t !== 'id' || !isP(sig[i + 2], '=')) return;
    const end = statementEnd(sig, i + 3);
    const init = sig.slice(i + 3, end);
    const pure = init.every((t, k) => t.t !== 'id' || LITERAL_WORDS.has(t.s) || isP(init[k + 1], ':'));
    const named = { upper: UPPER_SNAKE.test(sig[i + 1].s), pure };
    for (let k = i + 3; k < end; k++) info.set(k, named);
  });
  return info;
}

function checkLiterals(sig, ctx, changed, out) {
  const declared = declarationInfo(sig);
  sig.forEach((tok, i) => {
    if (tok.t !== 'num' || !changed.has(tok.line)) return;
    const sign = sig[i - 1];
    const before = sig[i - 2];
    const endsValue = before && (before.t === 'num' || before.t === 'str' || isP(before, ')') || isP(before, ']') || before.t === 'id' && !VALUE_PRECEDING_KEYWORDS.has(before.s));
    const unary = isP(sign, '-') && !endsValue;
    const value = Number(tok.s.replace(/_/g, '').replace(/n$/, '')) * (unary ? -1 : 1);
    if (ALLOWED_NUMBERS.has(value)) return;
    const named = declared.get(i);
    if (named && (named.upper || named.pure)) return;
    const colon = unary ? before : sign;
    const after = sig[i + 1];
    if (ctx[i] === 'obj' && isP(colon, ':') && (isP(after, ',') || isP(after, '}'))) return;
    out.push({ category: 'literals', line: tok.line, detail: `unnamed ${unary ? '-' : ''}${tok.s}` });
  });
}

function words(text) {
  return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function sameWord(a, b) {
  const stem = (w) => w.replace(/(ing|ed|es|s|ion|er)$/, '');
  const x = stem(a);
  const y = stem(b);
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
}

function classifyComment(text, { config, codeWords, exempt }) {
  const lines = text.split('\n').map((l) => l.replace(/^\s*\*?\s?/, '')).filter((l) => l.trim());
  const flat = lines.join(' ').trim();
  if (exempt || LEGAL.test(flat)) return null;
  if (lines.length >= 2) return 'paragraph';
  if (BANNER.test(flat)) return 'banner';
  if ((config ? CONFIG_CODE_LIKE : CODE_LIKE).test(flat)) return 'commented-out code';
  if (HISTORY.test(flat)) return 'history or ticket';
  if (WHY.test(flat)) return null;
  const content = words(flat);
  const matched = content.filter((w) => codeWords.some((v) => sameWord(w, v)));
  return content.length && matched.length / content.length >= 0.5 ? 'restates code' : 'states no footgun';
}

function codeWordsOf(tokens) {
  return tokens.flatMap((tok) => {
    if (tok.t === 'id') return [...words(tok.s), ...(KEYWORD_SYNONYMS[tok.s] || [])];
    return tok.t === 'str' ? words(tok.s) : [];
  });
}

function exportedNames(sig) {
  const names = new Set();
  sig.forEach((tok, i) => {
    const moduleExports = isId(tok, 'module') && isP(sig[i + 1], '.') && isId(sig[i + 2], 'exports');
    const namedExport = isId(tok, 'exports') && isP(sig[i + 1], '.') && !isP(sig[i - 1], '.');
    if (!moduleExports && !namedExport) return;
    sig.slice(i, statementEnd(sig, i)).forEach((t) => { if (t.t === 'id') names.add(t.s); });
  });
  return names;
}

function groupComments(tokens) {
  const codeLines = new Set(tokens.filter((t) => t.t !== 'c').map((t) => t.line));
  const groups = [];
  for (const tok of tokens.filter((t) => t.t === 'c')) {
    const last = groups.at(-1);
    const trailing = codeLines.has(tok.line);
    if (!trailing && !tok.block && last && !last.trailing && !last.block && last.end + 1 === tok.line) {
      last.end = tok.line;
      last.text += `\n${tok.s}`;
      continue;
    }
    groups.push({ start: tok.line, end: tok.end, text: tok.s, block: tok.block, trailing, jsdoc: tok.block && tok.s.startsWith('*') });
  }
  return groups;
}

const isChanged = (changed, from, to) => { for (let l = from; l <= to; l++) if (changed.has(l)) return true; return false; };

function checkJsComments(tokens, sig, changed, out) {
  const exported = exportedNames(sig);
  let count = 0;
  for (const group of groupComments(tokens)) {
    if (!isChanged(changed, group.start, group.end)) continue;
    count++;
    const codeLine = group.trailing ? group.start : sig.find((t) => t.line > group.end)?.line;
    const nearby = sig.filter((t) => t.line === codeLine);
    const exempt = group.jsdoc && nearby.some((t) => t.t === 'id' && exported.has(t.s));
    const reason = classifyComment(group.text, { config: false, codeWords: codeWordsOf(nearby), exempt });
    if (reason) out.push({ category: 'comments', line: group.start, detail: reason });
  }
  return count;
}

function analyzeJs(src, changed, isTest = false) {
  const out = [];
  const tokens = tokenize(src);
  const sig = tokens.filter((t) => t.t !== 'c');
  const { ctx, lineDepth, fns } = structure(sig);
  const comments = checkJsComments(tokens, sig, changed, out);
  if (!isTest) checkLiterals(sig, ctx, changed, out);
  for (const fn of fns) {
    const length = fn.end - fn.start + 1;
    if (length > MAX_FUNCTION_LINES && isChanged(changed, fn.start, fn.end)) out.push({ category: 'function-length', line: fn.start, detail: `${length} lines` });
  }
  for (const [line, depth] of lineDepth) {
    if (depth > MAX_NESTING && changed.has(line)) out.push({ category: 'nesting', line, detail: `depth ${depth}` });
  }
  return { violations: out, comments };
}

function analyzeConfig(src, ext, changed) {
  const lines = src.split('\n');
  const marker = ext === '.ini' || ext === '.cfg' ? /^\s*[#;]/ : /^\s*#(?!!)/;
  const out = [];
  let count = 0;
  const nextCode = (from) => lines.slice(from).find((l) => l.trim() && !marker.test(l)) || '';
  for (let k = 0; k < lines.length; k++) {
    const trailing = !marker.test(lines[k]) && /\s#\s/.exec(lines[k]);
    if (!marker.test(lines[k]) && !trailing) continue;
    let end = k;
    const group = [trailing ? lines[k].slice(trailing.index + 2) : lines[k].replace(/^\s*[#;]+\s?/, '')];
    while (!trailing && marker.test(lines[end + 1] || '')) group.push(lines[++end].replace(/^\s*[#;]+\s?/, ''));
    if (isChanged(changed, k + 1, end + 1)) {
      count++;
      const codeWords = words(trailing ? lines[k].slice(0, trailing.index) : nextCode(end + 1));
      const reason = classifyComment(group.join('\n'), { config: true, codeWords, exempt: false });
      if (reason) out.push({ category: 'comments', line: k + 1, detail: reason });
    }
    k = end;
  }
  return { violations: out, comments: count };
}

function analyzeFile(rel, text, changed) {
  const ext = path.extname(rel) || (path.basename(rel).startsWith('.env') ? '.env' : '');
  let result = { violations: [], comments: 0 };
  if (CODE_EXT.has(ext)) result = analyzeJs(text, changed, TEST_FILE.test(rel));
  else if (CONFIG_EXT.has(ext)) result = analyzeConfig(text, ext, changed);
  else if (!TEXT_EXT.has(ext)) return result;
  const lines = text.split('\n');
  for (const line of changed) {
    if (HOME_PATH.test(lines[line - 1] || '')) result.violations.push({ category: 'paths', line, detail: 'home path' });
  }
  return result;
}

function listFiles(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(rel, entry.name);
    if (!entry.isDirectory()) return child === 'overlay.yml' ? [] : [child];
    return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : listFiles(dir, child);
  });
}

function changedLines(fixtureDir, resultDir, rel) {
  const after = path.join(resultDir, rel);
  const before = path.join(fixtureDir, rel);
  if (!fs.existsSync(before)) {
    const total = fs.readFileSync(after, 'utf8').split('\n').length;
    return new Set(Array.from({ length: total }, (_, k) => k + 1));
  }
  const diff = spawnSync('git', ['diff', '--no-index', '--no-color', '--unified=0', before, after], { encoding: 'utf8' }).stdout;
  const lines = new Set();
  for (const hunk of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let k = 0; k < count; k++) lines.add(Number(hunk[1]) + k);
  }
  return lines;
}

function main() {
  const [fixtureDir, resultDir] = process.argv.slice(2).map((p) => path.resolve(p));
  const failed = new Set();
  let comments = 0;
  for (const rel of listFiles(resultDir)) {
    const changed = changedLines(fixtureDir, resultDir, rel);
    if (!changed.size) continue;
    const text = fs.readFileSync(path.join(resultDir, rel), 'utf8');
    let result;
    try {
      result = analyzeFile(rel, text, changed);
    } catch (error) {
      console.error(`unparsed ${rel}: ${error.message}`);
      continue;
    }
    comments += result.comments;
    for (const v of result.violations) {
      failed.add(v.category);
      console.error(`fail: ${v.category} ${rel}:${v.line} ${v.detail}`);
    }
  }
  console.log(`comments=${comments}`);
  console.log(`${CATEGORIES.length - failed.size}/${CATEGORIES.length}`);
}

module.exports = { analyzeJs, analyzeConfig, analyzeFile };
if (require.main === module) main();
