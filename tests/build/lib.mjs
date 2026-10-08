// Helpers for generating the lane workflow files (lanes/lane-4-*.json, lane-5-*, lane-8-*).
// The generated JSON is what gets committed; this script is only the "source" it was made from.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, '..', '..');

// Deterministic UUID from the node name: stable between rebuilds, unique across lanes (names carry the lane prefix).
export function uuid(seed) {
  const h = createHash('sha1').update(`kaya-demo|${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function headers(tab) {
  const csv = readFileSync(join(root, 'sheets-template', `${tab}.csv`), 'utf8');
  return csv.split('\n')[0].trim().split(',');
}

const sheetRef = (tab) => ({
  documentId: { __rl: true, value: '__KAYA_SHEET_ID__', mode: 'id' },
  sheetName: { __rl: true, value: tab, mode: 'name' },
});
const sheetsCred = { googleSheetsOAuth2Api: { id: '', name: 'Kaya Demo · Google Sheets' } };
const retry = { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 };

export class Lane {
  constructor(n, title, slug, color) {
    this.n = n; this.title = title; this.slug = slug; this.color = color;
    this.nodes = []; this.connections = {};
    this.baseY = (n - 1) * 1200;
  }
  name(short) { return `Lane ${this.n} · ${short}`; }
  add(node) {
    const full = { ...node };
    full.id = uuid(full.name);
    full.position = [node.x, this.baseY + node.y];
    delete full.x; delete full.y;
    this.nodes.push(full);
    return full.name;
  }
  // connect(from, to, output = 0)
  link(from, to, output = 0) {
    this.connections[from] ??= { main: [] };
    const outs = this.connections[from].main;
    while (outs.length <= output) outs.push([]);
    outs[output].push({ node: to, type: 'main', index: 0 });
  }
  chain(...names) { for (let i = 0; i < names.length - 1; i++) this.link(names[i], names[i + 1]); }

  sticky(short, content, x, y, width, height, color) {
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
      parameters: { content, height, width, color }, x, y,
    });
  }
  frame(content, width) {
    return this.add({
      name: this.name(this.title), type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
      parameters: { content, height: 1000, width, color: ((this.n - 1) % 7) + 1 }, x: -240, y: 0,
    });
  }
  schedule(short, cron, x, y) {
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2,
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: cron }] } }, x, y,
      notes: cron, notesInFlow: true,
    });
  }
  read(tab, x, y, { once = true, note, short } = {}) {
    return this.add({
      name: this.name(short ?? `Read ${tab}`), type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5,
      parameters: { operation: 'read', ...sheetRef(tab), options: {} }, x, y,
      credentials: sheetsCred, ...retry, ...(once ? { executeOnce: true } : {}), alwaysOutputData: true,
      notes: note ?? `Reads every row of ${tab}`, notesInFlow: true,
    });
  }
  columnsParam(tab, matching) {
    return {
      mappingMode: 'autoMapInputData', value: {}, matchingColumns: matching,
      schema: headers(tab).map((id) => ({
        id, displayName: id, required: false, defaultMatch: matching.includes(id), display: true, type: 'string', canBeUsedToMatch: true,
      })),
      attemptToConvertTypes: false, convertFieldsToString: false,
    };
  }
  append(tab, short, x, y, note) {
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5,
      parameters: { operation: 'append', ...sheetRef(tab), columns: this.columnsParam(tab, []), options: { cellFormat: 'RAW', handlingExtraData: 'ignoreIt' } },
      x, y, credentials: sheetsCred, ...retry, notes: note ?? `Append to ${tab}`, notesInFlow: true,
    });
  }
  update(tab, key, short, x, y, note) {
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5,
      parameters: { operation: 'update', ...sheetRef(tab), columns: this.columnsParam(tab, [key]), options: { cellFormat: 'RAW', handlingExtraData: 'ignoreIt' } },
      x, y, credentials: sheetsCred, ...retry, notes: note ?? `Update ${tab} by ${key}`, notesInFlow: true,
    });
  }
  appendOrUpdate(tab, key, short, x, y, note) {
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5,
      parameters: { operation: 'appendOrUpdate', ...sheetRef(tab), columns: this.columnsParam(tab, [key]), options: { cellFormat: 'RAW' } },
      x, y, credentials: sheetsCred, ...retry, notes: note ?? `Append or update ${tab}`, notesInFlow: true,
    });
  }
  code(short, file, x, y, { note, mode, subst = {} } = {}) {
    let js = readFileSync(join(here, 'code', file), 'utf8');
    // `//@include name` pulls in code/_name.js (shared snippets copied from SPEC section 5).
    js = js.replace(/^\/\/@include (\w+)\s*$/gm, (_, part) => readFileSync(join(here, 'code', `_${part}.js`), 'utf8').trimEnd());
    js = js.replaceAll('LANE_N', String(this.n));
    for (const [k, v] of Object.entries(subst)) js = js.replaceAll(k, v);
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.code', typeVersion: 2,
      parameters: { ...(mode ? { mode } : {}), jsCode: js }, x, y, notes: note, notesInFlow: Boolean(note),
    });
  }
  ifBool(short, field, x, y, note) {
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.if', typeVersion: 2.2,
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: uuid(`${this.n}|${short}|cond`), leftValue: `={{ $json.${field} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and',
        },
        options: {},
      },
      x, y, notes: note, notesInFlow: Boolean(note),
    });
  }
  loop(short, x, y, note) {
    return this.add({ name: this.name(short), type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, parameters: { batchSize: 1, options: {} }, x, y, notes: note, notesInFlow: Boolean(note) });
  }
  wait(short, x, y, note) {
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.wait', typeVersion: 1.1,
      parameters: { amount: '={{ $json.pause_seconds }}', unit: 'seconds' }, x, y,
      webhookId: uuid(`${this.n}|${short}|wh`), notes: note, notesInFlow: Boolean(note),
    });
  }
  gmail(short, x, y, note) {
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.gmail', typeVersion: 2.1,
      parameters: {
        resource: 'message', operation: 'send', sendTo: '={{ $json.safe_to }}', subject: '={{ $json.subject }}',
        emailType: 'html', message: '={{ $json.html }}',
        options: { appendAttribution: false, senderName: '={{ $json.sender_name }}' },
      },
      x, y, webhookId: uuid(`${this.n}|${short}|wh`), credentials: { gmailOAuth2: { id: '', name: 'Kaya Demo · Gmail Sender' } },
      retryOnFail: false, onError: 'continueErrorOutput', notes: note ?? 'Sends one email', notesInFlow: true,
    });
  }
  telegram(short, x, y, { note, failureOutput = false } = {}) {
    return this.add({
      name: this.name(short), type: 'n8n-nodes-base.telegram', typeVersion: 1.2,
      parameters: { chatId: '={{ $json.chat_id }}', text: '={{ $json.text }}', additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
      x, y, webhookId: uuid(`${this.n}|${short}|wh`), credentials: { telegramApi: { id: '', name: 'Kaya Demo · Telegram Bot' } },
      ...retry, onError: failureOutput ? 'continueErrorOutput' : 'continueRegularOutput', notes: note, notesInFlow: Boolean(note),
    });
  }
  http(short, kind, x, y, note) {
    const gem = kind === 'gemini';
    return this.add({
      name: this.name(gem ? 'Ask Gemini' : 'Ask Groq (fallback)'), type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      parameters: {
        method: 'POST',
        url: gem ? '=https://generativelanguage.googleapis.com/v1beta/models/{{ $json.gemini_model }}:generateContent' : 'https://api.groq.com/openai/v1/chat/completions',
        authentication: 'predefinedCredentialType', nodeCredentialType: gem ? 'googlePalmApi' : 'groqApi',
        sendBody: true, specifyBody: 'json', jsonBody: gem ? '={{ JSON.stringify($json.gemini_body) }}' : '={{ JSON.stringify($json.groq_body) }}',
        options: { timeout: 120000 },
      },
      x, y, credentials: gem ? { googlePalmApi: { id: '', name: 'Kaya Demo · Gemini' } } : { groqApi: { id: '', name: 'Kaya Demo · Groq' } },
      retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput',
      notes: note ?? (gem ? 'Main AI · 3 tries' : 'Fallback AI · 3 tries'), notesInFlow: true,
    });
  }
  build(workflowName) {
    return {
      name: workflowName, nodes: this.nodes, connections: this.connections, active: false,
      settings: { executionOrder: 'v1', timezone: 'Asia/Kolkata', saveManualExecutions: true }, pinData: {}, meta: { templateCredsSetupCompleted: false }, tags: [],
    };
  }
}
