// Test harness: turns a lane file into a TEST COPY (triggers -> webhooks, Sheets/Gmail/Telegram -> HTTP
// stubs that talk to the local mock, Gemini/Groq -> pointed at the mock), then runs it in a real n8n server.
// The lane JSON committed in lanes/ is never modified; only this in-memory copy is.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { uuid } from './build-lib.mjs';

export const N8N_BIN = process.env.N8N_BIN || 'n8n';

export function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

const expr = (value) => String(value).replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '');
const httpNode = (orig, name, params) => ({
  id: orig.id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: orig.position,
  parameters: { options: {}, ...params },
  ...(orig.alwaysOutputData ? { alwaysOutputData: true } : {}),
  ...(orig.executeOnce ? { executeOnce: true } : {}),
  ...(orig.onError ? { onError: orig.onError } : {}),
  ...(orig.retryOnFail ? { retryOnFail: true, maxTries: orig.maxTries ?? 3, waitBetweenTries: 100 } : {}),
});
const expectParam = (node, key, value) => {
  const actual = JSON.stringify(node.parameters[key]);
  if (actual !== JSON.stringify(value)) throw new Error(`Test copy: "${node.name}" parameter ${key} is ${actual}, the stub expects ${JSON.stringify(value)}. Update the harness if this change is intended.`);
};

export function buildTestWorkflow(lane, wf, { mockUrl, id, webhookPaths }) {
  const copy = JSON.parse(JSON.stringify(wf));
  copy.id = id;
  copy.name = `TEST COPY · ${wf.name}`;
  copy.active = false;
  const nodes = [];
  const extraConnections = {};
  for (const node of copy.nodes) {
    const p = node.parameters;
    switch (node.type) {
      case 'n8n-nodes-base.stickyNote':
        break;                                                  // dropped from the test copy
      case 'n8n-nodes-base.scheduleTrigger':
        nodes.push({ id: node.id, name: node.name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: node.position, webhookId: uuid(`test:${node.name}`), parameters: { httpMethod: 'POST', path: webhookPaths.main, responseMode: 'lastNode', options: {} } });
        break;
      case 'n8n-nodes-base.gmailTrigger': {
        const hook = `${node.name} (test webhook)`;
        nodes.push({ id: uuid(`test:hook:${node.name}`), name: hook, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [node.position[0] - 120, node.position[1] - 60], webhookId: uuid(`test:${hook}`), parameters: { httpMethod: 'POST', path: webhookPaths.inbox, responseMode: 'lastNode', options: {} } });
        nodes.push({ id: node.id, name: node.name, type: 'n8n-nodes-base.code', typeVersion: 2, position: node.position, parameters: { jsCode: 'return ($input.first().json.body.messages || []).map((message) => ({ json: message }));' } });
        extraConnections[hook] = { main: [[{ node: node.name, type: 'main', index: 0 }]] };
        break;
      }
      case 'n8n-nodes-base.formTrigger': {
        const hook = `${node.name} (test webhook)`;
        nodes.push({ id: uuid(`test:hook:${node.name}`), name: hook, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [node.position[0] - 120, node.position[1] - 60], webhookId: uuid(`test:${hook}`), parameters: { httpMethod: 'POST', path: webhookPaths.form, responseMode: 'lastNode', options: {} } });
        nodes.push({ id: node.id, name: node.name, type: 'n8n-nodes-base.code', typeVersion: 2, position: node.position, parameters: { jsCode: 'return [{ json: $input.first().json.body }];' } });
        extraConnections[hook] = { main: [[{ node: node.name, type: 'main', index: 0 }]] };
        break;
      }
      case 'n8n-nodes-base.googleSheets': {
        const tab = p.sheetName.value;
        if (p.operation === 'read') nodes.push(httpNode(node, node.name, { method: 'GET', url: `${mockUrl}/sheet/${tab}` }));
        else nodes.push(httpNode(node, node.name, { method: 'POST', url: `${mockUrl}/sheet/${tab}/${p.operation}`, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}' }));
        break;
      }
      case 'n8n-nodes-base.gmail': {
        const op = p.operation;
        if (op === 'send') {
          expectParam(node, 'sendTo', '={{ $json.safe_to }}'); expectParam(node, 'subject', '={{ $json.subject }}'); expectParam(node, 'message', '={{ $json.html }}');
          nodes.push(httpNode(node, node.name, { method: 'POST', url: `${mockUrl}/gmail/send`, sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ to: ${expr(p.sendTo)}, subject: ${expr(p.subject)}, html: ${expr(p.message)}, sender_name: ${expr(p.options.senderName)} }) }}` }));
        } else if (op === 'reply') {
          expectParam(node, 'messageId', '={{ $json.message_id }}');
          nodes.push(httpNode(node, node.name, { method: 'POST', url: `${mockUrl}/gmail/reply`, sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ message_id: ${expr(p.messageId)}, html: ${expr(p.message)}, thread_id: $json.thread_id, to: $json.safe_to }) }}` }));
        } else if (op === 'markAsRead') {
          expectParam(node, 'messageId', '={{ $json.message_id }}');
          nodes.push(httpNode(node, node.name, { method: 'POST', url: `${mockUrl}/gmail/markread`, sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ message_id: ${expr(p.messageId)} }) }}` }));
        } else if (op === 'getAll') {
          nodes.push(httpNode(node, node.name, { method: 'POST', url: `${mockUrl}/gmail/getall`, sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ q: ${expr(p.filters.q)} }) }}` }));
        } else throw new Error(`No stub for Gmail ${op}`);
        break;
      }
      case 'n8n-nodes-base.telegram':
        expectParam(node, 'chatId', '={{ $json.chat_id }}'); expectParam(node, 'text', '={{ $json.text }}');
        nodes.push(httpNode(node, node.name, { method: 'POST', url: `${mockUrl}/telegram/send`, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ chat_id: $json.chat_id, text: $json.text, parse_mode: "HTML" }) }}' }));
        break;
      case 'n8n-nodes-base.httpRequest': {
        const isGemini = String(p.url).includes('generativelanguage');
        const params = { ...p, authentication: 'none', url: isGemini ? `=${mockUrl}/gemini/{{ $json.gemini_model }}:generateContent` : `${mockUrl}/groq/chat/completions` };
        delete params.nodeCredentialType;
        const stub = { ...node, parameters: params, waitBetweenTries: 100 };
        delete stub.credentials; delete stub.notes; delete stub.notesInFlow;
        nodes.push(stub);
        break;
      }
      default: {
        const kept = { ...node };
        delete kept.notes; delete kept.notesInFlow;
        if (kept.type === 'n8n-nodes-base.wait') kept.webhookId = kept.webhookId || uuid(`test:${kept.name}`);
        delete kept.credentials;
        nodes.push(kept);
      }
    }
  }
  copy.nodes = nodes;
  copy.connections = { ...copy.connections, ...extraConnections };
  return copy;
}

export async function startN8n({ engine, workflows, label }) {
  const root = mkdtempSync(path.join(tmpdir(), `n8n-${label}-`));
  const home = path.join(root, 'home');
  mkdirSync(home, { recursive: true });
  const port = await freePort();
  const brokerPort = await freePort();
  const env = {
    ...process.env,
    N8N_USER_FOLDER: home, N8N_LISTEN_ADDRESS: '127.0.0.1', N8N_RUNNERS_BROKER_LISTEN_ADDRESS: '127.0.0.1', N8N_RUNNERS_BROKER_PORT: String(brokerPort),
    N8N_PORT: String(port), N8N_SECURE_COOKIE: 'false', GENERIC_TIMEZONE: 'Asia/Kolkata', TZ: 'Asia/Kolkata',
    N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false',
    N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'false', N8N_HIRING_BANNER_ENABLED: 'false', NODE_ENV: 'production',
    N8N_LOG_LEVEL: 'info', N8N_LOG_SCOPES: 'workflow-activation',
    ...(engine === 'legacy' ? { N8N_EXPRESSION_ENGINE: 'legacy' } : {}),
  };
  if (engine === 'vm') delete env.N8N_EXPRESSION_ENGINE;
  for (const wf of workflows) {
    const file = path.join(root, `${wf.id}.json`);
    writeFileSync(file, JSON.stringify(wf));
    const imp = spawnSync(N8N_BIN, ['import:workflow', `--input=${file}`], { env, encoding: 'utf8' });
    if (!/Successfully imported/.test(imp.stdout + imp.stderr)) throw new Error(`import failed: ${imp.stdout}${imp.stderr}`);
    const act = spawnSync(N8N_BIN, ['update:workflow', `--id=${wf.id}`, '--active=true'], { env, encoding: 'utf8' });
    if (act.status !== 0) throw new Error(`activate failed: ${act.stdout}${act.stderr}`);
  }
  const child = spawn(N8N_BIN, ['start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${base}/healthz`); if (r.ok) break; } catch { /* not up yet */ }
    if (child.exitCode !== null) throw new Error(`n8n exited early:\n${log.slice(-2000)}`);
    if (Date.now() - started > 120000) throw new Error(`n8n did not start:\n${log.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  // healthz answers before active workflows (and their webhooks) are registered: wait for the log line.
  while (workflows.some((wf) => !log.includes(`Activated workflow "${wf.name}"`))) {
    if (Date.now() - started > 120000) throw new Error(`workflows were not activated:\n${log.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  const nodeRequire = createRequire(path.join(path.dirname(N8N_BIN), '..', 'n8n', 'package.json'));
  const flatted = nodeRequire('flatted');
  // Reads n8n's own execution records, so tests can see WHICH node failed and with what message.
  async function executions() {
    let db;
    for (let attempt = 0; attempt < 25; attempt++) {
      try { db = new DatabaseSync(path.join(home, '.n8n', 'database.sqlite'), { readOnly: true }); db.prepare('SELECT 1 FROM execution_entity LIMIT 1').all(); break; }
      catch (error) { try { db?.close(); } catch { /* ignore */ } db = undefined; await new Promise((r) => setTimeout(r, 200)); }
    }
    if (!db) throw new Error('could not read the n8n database');
    try {
      const rows = db.prepare('SELECT e.id, e.status, d.data FROM execution_entity e JOIN execution_data d ON d.executionId = e.id ORDER BY e.id').all();
      return rows.map((row) => {
        const data = flatted.parse(row.data);
        const error = data?.resultData?.error;
        return { id: row.id, status: row.status, runData: data?.resultData?.runData, error: error ? { message: error.message, node: error.node?.name ?? data.resultData.lastNodeExecuted } : null, lastNode: data?.resultData?.lastNodeExecuted };
      });
    } finally { db.close(); }
  }
  return {
    base, getLog: () => log, executions,
    async fire(webhookPath, body = {}) {
      const t0 = Date.now();
      const res = await fetch(`${base}/webhook/${webhookPath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      // With responseMode "lastNode" n8n answers 500 "No item to return was found" when the last node produced
      // nothing (e.g. a quiet run). That is a normal, successful run, so report it as 200 + empty.
      if (res.status === 500 && json && /No item to return was found/.test(json.message || '')) return { status: 200, body: [], empty: true, ms: Date.now() - t0 };
      return { status: res.status, body: json, ms: Date.now() - t0 };
    },
    async stop() { child.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 1000)); if (child.exitCode === null) child.kill('SIGKILL'); },
  };
}

// ---- tiny test framework
export class Tester {
  constructor(label) { this.label = label; this.results = []; this.current = null; }
  async scenario(name, fn) {
    this.current = { name, checks: [] };
    const t0 = Date.now();
    try { await fn(); } catch (error) { this.current.checks.push({ ok: false, what: `scenario threw: ${error.stack || error}` }); }
    this.current.ms = Date.now() - t0;
    this.results.push(this.current);
    const failed = this.current.checks.filter((c) => !c.ok);
    console.log(`${failed.length ? '✖' : '✔'} ${this.label} · ${name} (${this.current.checks.length} checks, ${(this.current.ms / 1000).toFixed(1)}s)`);
    for (const f of failed) console.log(`     ✖ ${f.what}`);
  }
  check(ok, what) { this.current.checks.push({ ok: !!ok, what }); }
  eq(actual, expected, what) { this.check(JSON.stringify(actual) === JSON.stringify(expected), `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
  summary() {
    const checks = this.results.flatMap((r) => r.checks);
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${this.label}: ${this.results.length} scenarios, ${checks.length} checks, ${failed} failed`);
    return failed;
  }
}

export const mockApi = (mockUrl) => ({
  reset: (body = {}) => fetch(`${mockUrl}/__reset`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json()),
  config: (body) => fetch(`${mockUrl}/__config`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json()),
  sheet: (tab) => fetch(`${mockUrl}/__sheet/${tab}`).then((r) => r.json()),
  setSheet: (tab, rows) => fetch(`${mockUrl}/__sheet/${tab}`, { method: 'PUT', body: JSON.stringify(rows) }).then((r) => r.json()),
  calls: (kind) => fetch(`${mockUrl}/__calls${kind ? `?kind=${kind}` : ''}`).then((r) => r.json()),
  violations: () => fetch(`${mockUrl}/__violations`).then((r) => r.json()),
});
