// Test helpers shared by tests/lane-2 and tests/lane-3.
//  * toTestCopy(): turns the REAL lane JSON into a test copy (Sheets / Gmail / Telegram -> HTTP Request nodes that
//    talk to the local mock; optionally Schedule Trigger -> Webhook). Node names, ids, connections, Code nodes,
//    IF/Switch/Loop/Wait nodes and error settings stay exactly as committed.
//  * N8n: imports the copy into a scratch n8n 1.123.84, activates it and runs `n8n start` on a free port.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

export const SCRATCH = process.env.KAYA_SCRATCH;               // folder that holds node_modules/.bin/n8n (outside the repo)
if (!SCRATCH) throw new Error('Set KAYA_SCRATCH to the scratch folder that contains n8n/node_modules');
export const N8N_BIN = join(SCRATCH, 'n8n', 'node_modules', '.bin', 'n8n');

const httpNode = (node, { method, path, body, query }) => ({
  parameters: {
    method, url: `__MOCK__${path}${query ?? ''}`,
    ...(body ? { sendBody: true, contentType: 'raw', rawContentType: 'application/json', body } : {}),
    options: {},
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: node.position, id: node.id, name: node.name,
  ...pickSettings(node),
});
const pickSettings = (node) => Object.fromEntries(['retryOnFail', 'maxTries', 'waitBetweenTries', 'onError', 'alwaysOutputData', 'notes', 'notesInFlow'].filter((k) => node[k] !== undefined).map((k) => [k, node[k]]));

export function toTestCopy(lane, { mockUrl, name, webhookPath = null, fastRetries = true }) {
  const copy = JSON.parse(JSON.stringify(lane));
  copy.name = name;
  copy.nodes = copy.nodes.map((node) => {
    const p = node.parameters;
    switch (node.type) {
      case 'n8n-nodes-base.googleSheets': {
        const tab = p.sheetName.value;
        if (p.operation === 'read') return httpNode(node, { method: 'GET', path: `/sheets/${tab}` });
        const key = p.columns.matchingColumns?.[0];
        return httpNode(node, { method: 'POST', path: `/sheets/${tab}/${p.operation}`, query: key ? `?key=${key}` : '', body: '={{ JSON.stringify($json) }}' });
      }
      case 'n8n-nodes-base.gmail':
        return httpNode(node, { method: 'POST', path: '/gmail/send', body: '={{ JSON.stringify({ to: $json.safe_to, subject: $json.subject, html: $json.html, senderName: $json.sender_name }) }}' });
      case 'n8n-nodes-base.telegram': {
        const stub = httpNode(node, { method: 'POST', path: '/telegram/send', body: '={{ JSON.stringify({ chat_id: $json.chat_id, text: $json.text, parse_mode: "HTML" }) }}' });
        if (fastRetries && stub.waitBetweenTries) stub.waitBetweenTries = 200;       // only in the test copy
        return stub;
      }
      case 'n8n-nodes-base.scheduleTrigger':
        if (!webhookPath) return node;
        return { parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'lastNode', options: {} }, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: node.position, id: node.id, name: node.name, webhookId: node.id };
      default:
        return node;
    }
  });
  return JSON.parse(JSON.stringify(copy).replaceAll('__MOCK__', mockUrl));
}

const freePort = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

export class N8n {
  constructor({ engine = 'vm', label = 'run' } = {}) {
    this.engine = engine;
    this.folder = mkdtempSync(join(SCRATCH, `home-${label}-${engine}-`));
    this.logPath = join(this.folder, 'server.log');
    this.env = {
      ...process.env, N8N_USER_FOLDER: this.folder, N8N_LISTEN_ADDRESS: '127.0.0.1', N8N_RUNNERS_BROKER_LISTEN_ADDRESS: '127.0.0.1',
      N8N_SECURE_COOKIE: 'false', GENERIC_TIMEZONE: 'Asia/Kolkata', N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
      N8N_PERSONALIZATION_ENABLED: 'false', N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'false', DB_SQLITE_POOL_SIZE: '1',
      ...(engine === 'legacy' ? { N8N_EXPRESSION_ENGINE: 'legacy' } : {}),
    };
  }
  cli(...args) {
    const r = spawnSync(N8N_BIN, args, { env: this.env, encoding: 'utf8', timeout: 180000 });
    if (r.status !== 0) throw new Error(`n8n ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
    return r.stdout + r.stderr;
  }
  importWorkflow(workflow, file = 'workflow.json') {
    const path = join(this.folder, file);
    mkdirSync(this.folder, { recursive: true });
    writeFileSync(path, JSON.stringify(workflow));
    this.cli('import:workflow', `--input=${path}`);
    const list = this.cli('list:workflow').split('\n').filter((line) => /^[A-Za-z0-9]{10,}\|/.test(line));
    const found = list.find((line) => line.endsWith(`|${workflow.name}`));
    if (!found) throw new Error(`imported workflow not found in: ${list.join(' / ')}`);
    return found.split('|')[0];
  }
  activate(id) { this.cli('update:workflow', `--id=${id}`, '--active=true'); }
  async start() {
    this.port = await freePort();
    this.proc = spawn(N8N_BIN, ['start'], { env: { ...this.env, N8N_PORT: String(this.port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    this.proc.stdout.on('data', (d) => { log += d; });
    this.proc.stderr.on('data', (d) => { log += d; });
    this.log = () => log;
    const started = Date.now();
    while (!/Editor is now accessible/.test(log)) {
      if (Date.now() - started > 120000) throw new Error(`n8n did not start:\n${log.slice(-2000)}`);
      await new Promise((r) => setTimeout(r, 500));
    }
    await new Promise((r) => setTimeout(r, 1500));
    return this;
  }
  get base() { return `http://127.0.0.1:${this.port}`; }
  // Every execution n8n has stored: { id, status, data } (data = the raw run data text, searchable for error messages).
  executions() {
    const db = new DatabaseSync(join(this.folder, '.n8n', 'database.sqlite'), { readOnly: true });
    try {
      return db.prepare('SELECT e.id AS id, e.status AS status, d.data AS data FROM execution_entity e JOIN execution_data d ON d.executionId = e.id ORDER BY e.id').all();
    } finally { db.close(); }
  }
  async stop() {
    if (!this.proc) return;
    this.proc.kill('SIGTERM');
    await new Promise((resolve) => { this.proc.on('exit', resolve); setTimeout(resolve, 8000); });
  }
}

// ---------- tiny assertion collector
export class Results {
  constructor(title) { this.title = title; this.items = []; this.scenario = ''; }
  begin(name) { this.scenario = name; console.log(`\n▶ ${name}`); }
  check(ok, message) {
    this.items.push({ scenario: this.scenario, ok: Boolean(ok), message });
    console.log(`  ${ok ? '✔' : '✖'} ${message}`);
  }
  get failed() { return this.items.filter((i) => !i.ok); }
  summary() { return `${this.title}: ${this.items.length - this.failed.length}/${this.items.length} checks passed`; }
}
