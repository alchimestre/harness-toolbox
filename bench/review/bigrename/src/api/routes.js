import http from 'node:http';
import { validateTaskBody } from './validate.js';
import { createWebhookSender } from './webhooks.js';
import { emailHandler } from '../workers/email.js';
import { reportHandler } from '../workers/report.js';

const HANDLERS = { email: emailHandler, report: reportHandler };

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}

async function route(req, res, { scheduler, webhooks }) {
  if (req.method === 'POST' && req.url === '/jobs') {
    const body = await readJson(req);
    const problem = validateTaskBody(body);
    if (problem) return sendJson(res, 400, { error: problem });
    const handler = HANDLERS[body.kind];
    if (!handler) return sendJson(res, 400, { error: `unknown kind ${body.kind}` });
    const task = { id: body.id, kind: body.kind, payload: body.payload, handler };
    const id = scheduler.enqueue(task, body.opts?.delayMs);
    return sendJson(res, 202, { id });
  }
  if (req.method === 'GET' && req.url === '/jobs') {
    return sendJson(res, 200, scheduler.store.list());
  }
  if (req.method === 'DELETE' && req.url.startsWith('/jobs/')) {
    const taskId = req.url.slice('/jobs/'.length);
    scheduler.store.removeTask(taskId);
    return sendJson(res, 204, {});
  }
  if (req.method === 'POST' && req.url === '/hooks') {
    const body = await readJson(req);
    const problem = validateTaskBody(body);
    if (problem) return sendJson(res, 400, { error: problem });
    await webhooks.send(body.url, body.payload);
    return sendJson(res, 202, { ok: true });
  }
  return sendJson(res, 404, { error: 'not found' });
}

export async function startHttp({ scheduler, port }) {
  const webhooks = createWebhookSender();
  const server = http.createServer(async (req, res) => {
    try {
      await route(req, res, { scheduler, webhooks });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return server;
}
