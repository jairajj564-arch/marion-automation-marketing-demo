// Small helpers used by tests/lane-6/build-lane-6.mjs and tests/lane-7/build-lane-7.mjs
// to write the lane JSON files. The generated files in lanes/ are the deliverable; these
// scripts only exist so the two lanes are built from the same, consistent pieces.
import crypto from 'node:crypto';

export const SHEET_ID = '__KAYA_SHEET_ID__';

export const COLUMNS = {
  PROSPECTS: ['prospect_id', 'type', 'business_name', 'contact_name', 'email', 'instagram_handle', 'city', 'followers', 'niche', 'notes', 'fit_score', 'email_allowed', 'sequence_id', 'status', 'seq_step', 'next_action_at', 'last_contacted_at', 'thread_ids', 'last_reply_at', 'reply_class', 'deal_notes', 'updated_at'],
  LEADS: ['lead_id', 'created_at', 'source', 'first_name', 'email', 'phone', 'city', 'instagram_handle', 'interest', 'budget', 'occasion', 'consent', 'email_allowed', 'score', 'segment', 'score_reason', 'status', 'sequence_id', 'seq_step', 'next_action_at', 'last_contacted_at', 'launch_step', 'last_newsletter_id', 'thread_ids', 'last_reply_at', 'reply_class', 'notes', 'updated_at'],
  EVENTS_LOG: ['event_id', 'ts', 'lane', 'event_type', 'entity_type', 'entity_id', 'status_from', 'status_to', 'channel', 'detail', 'meta_json', 'execution_id', 'demo_mode'],
};

// Stable UUIDs: the same node name always gets the same id, so rebuilding does not churn the diff.
export const uuid = (seed) => {
  const h = crypto.createHash('sha1').update(`marion-kaya-demo:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export class Lane {
  constructor(lane, title) {
    this.lane = lane;
    this.title = title;
    this.nodes = [];
    this.connections = {};
    this.top = (lane - 1) * 1200;
  }

  name(short) { return `Lane ${this.lane} · ${short}`; }

  add(node) {
    const full = { id: uuid(`${this.lane}:${node.name}`), ...node };
    if (this.nodes.some((n) => n.name === full.name)) throw new Error(`duplicate node name ${full.name}`);
    this.nodes.push(full);
    return full.name;
  }

  // connect(from, to, output = 0)
  link(from, to, output = 0) {
    this.connections[from] ??= { main: [] };
    const outputs = this.connections[from].main;
    while (outputs.length <= output) outputs.push([]);
    outputs[output].push({ node: to, type: 'main', index: 0 });
  }

  chain(...names) {
    for (let i = 0; i < names.length - 1; i++) this.link(names[i], names[i + 1]);
  }

  sticky(short, x, y, width, height, content, color = 7) {
    return this.add({
      name: this.name(short),
      type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [x, y],
      parameters: { content, height, width, color },
    });
  }

  code(short, x, y, jsCode, notes, extra = {}) {
    const { mode, ...rest } = extra;
    return this.add({
      name: this.name(short),
      type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y],
      parameters: { ...(mode ? { mode } : {}), jsCode },
      ...(notes ? { notes, notesInFlow: true } : {}),
      ...rest,
    });
  }

  ifBool(short, x, y, field, notes) {
    return this.add({
      name: this.name(short),
      type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [x, y],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: uuid(`${this.lane}:${short}:cond`), leftValue: `={{ $json.${field} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and',
        },
        options: {},
      },
      ...(notes ? { notes, notesInFlow: true } : {}),
    });
  }

  ifString(short, x, y, field, equalsValue, notes) {
    return this.add({
      name: this.name(short),
      type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [x, y],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: uuid(`${this.lane}:${short}:cond`), leftValue: `={{ $json.${field} }}`, rightValue: equalsValue, operator: { type: 'string', operation: 'equals' } }],
          combinator: 'and',
        },
        options: {},
      },
      ...(notes ? { notes, notesInFlow: true } : {}),
    });
  }

  sheetsRead(short, tab, x, y, notes, extra = {}) {
    return this.add({
      name: this.name(short),
      type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: [x, y],
      parameters: {
        operation: 'read',
        documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
        sheetName: { __rl: true, value: tab, mode: 'name' },
        options: {},
      },
      credentials: { googleSheetsOAuth2Api: { id: null, name: 'Kaya Demo · Google Sheets' } },
      retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
      ...(notes ? { notes, notesInFlow: true } : {}),
      ...extra,
    });
  }

  sheetsWrite(short, tab, operation, x, y, notes, extra = {}) {
    const schema = COLUMNS[tab].map((id) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }));
    const key = { PROSPECTS: 'prospect_id', LEADS: 'lead_id' }[tab];
    const columns = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: operation === 'update' ? [key] : [], schema, attemptToConvertTypes: false, convertFieldsToString: false };
    return this.add({
      name: this.name(short),
      type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: [x, y],
      parameters: {
        operation,
        documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
        sheetName: { __rl: true, value: tab, mode: 'name' },
        columns,
        // 'ignoreIt' = never create new sheet columns from stray fields (SPEC 5.4: only known columns are written).
        options: { cellFormat: 'RAW', handlingExtraData: 'ignoreIt' },
      },
      credentials: { googleSheetsOAuth2Api: { id: null, name: 'Kaya Demo · Google Sheets' } },
      retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
      ...(notes ? { notes, notesInFlow: true } : {}),
      ...extra,
    });
  }

  loop(short, x, y, notes) {
    return this.add({
      name: this.name(short),
      type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: [x, y],
      parameters: { batchSize: 1, options: {} },
      ...(notes ? { notes, notesInFlow: true } : {}),
    });
  }

  wait(short, x, y, notes) {
    return this.add({
      name: this.name(short),
      type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [x, y],
      parameters: { amount: '={{ $json.pause_seconds }}', unit: 'seconds' },
      webhookId: uuid(`${this.lane}:${short}:webhook`),
      ...(notes ? { notes, notesInFlow: true } : {}),
    });
  }

  telegram(short, x, y, notes, extra = {}) {
    return this.add({
      name: this.name(short),
      type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [x, y],
      parameters: { chatId: '={{ $json.chat_id }}', text: '={{ $json.text }}', additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
      credentials: { telegramApi: { id: null, name: 'Kaya Demo · Telegram Bot' } },
      webhookId: uuid(`${this.lane}:${short}:webhook`),
      retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
      ...(notes ? { notes, notesInFlow: true } : {}),
      ...extra,
    });
  }

  // The SPEC 5.10 AI block. Returns the names so the caller can wire the entry and the exit.
  aiBlock(x, y, { buildCode, readGeminiCode, checkCode, readGroqCode }) {
    const names = {};
    names.build = this.code('Build AI request', x, y, buildCode, 'Prompt + Gemini/Groq bodies');
    names.gemini = this.add({
      name: this.name('Ask Gemini'),
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 220, y],
      parameters: { method: 'POST', url: '=https://generativelanguage.googleapis.com/v1beta/models/{{ $json.gemini_model }}:generateContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.gemini_body) }}', options: { timeout: 120000 } },
      credentials: { googlePalmApi: { id: null, name: 'Kaya Demo · Gemini' } },
      retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput',
      notes: 'Main AI · 3 tries', notesInFlow: true,
    });
    names.readGemini = this.code('Read Gemini reply', x + 440, y, readGeminiCode, 'Answer text or error');
    names.check = this.code('Check AI answer', x + 660, y, checkCode, 'Valid JSON? Usable?');
    names.needGroq = this.ifBool('Need Groq fallback?', x + 880, y, 'try_groq', 'true = Gemini failed');
    names.groq = this.add({
      name: this.name('Ask Groq (fallback)'),
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 1100, y - 120],
      parameters: { method: 'POST', url: 'https://api.groq.com/openai/v1/chat/completions', authentication: 'predefinedCredentialType', nodeCredentialType: 'groqApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.groq_body) }}', options: { timeout: 120000 } },
      credentials: { groqApi: { id: null, name: 'Kaya Demo · Groq' } },
      retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput',
      notes: 'Fallback AI · 3 tries', notesInFlow: true,
    });
    names.readGroq = this.code('Read Groq reply', x + 1320, y - 120, readGroqCode, 'Answer text or error');
    this.chain(names.build, names.gemini, names.readGemini, names.check, names.needGroq);
    this.link(names.needGroq, names.groq, 0);
    this.chain(names.groq, names.readGroq, names.check);
    return names; // exit: names.needGroq output 1 (false)
  }

  toJSON(name) {
    return {
      name,
      nodes: this.nodes,
      connections: this.connections,
      active: false,
      settings: { executionOrder: 'v1', timezone: 'Asia/Kolkata', saveManualExecutions: true },
      pinData: {},
      meta: { templateCredsSetupCompleted: false },
      tags: [],
    };
  }
}

// ---- Code snippets shared by the lanes (kept as strings so every Code node is self-contained) ----

export const TIME_HELPERS = `const TZ = 'Asia/Kolkata';
const STAMP = "yyyy-MM-dd'T'HH:mm:ssZZ";
function parseTs(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const text = String(value).trim();
  const tries = [
    () => DateTime.fromISO(text, { zone: TZ }),
    () => DateTime.fromFormat(text, 'yyyy-MM-dd HH:mm:ss', { zone: TZ }),
    () => DateTime.fromFormat(text, 'yyyy-MM-dd HH:mm', { zone: TZ }),
    () => DateTime.fromFormat(text, 'dd/MM/yyyy HH:mm:ss', { zone: TZ }),
    () => DateTime.fromFormat(text, 'dd/MM/yyyy', { zone: TZ }),
  ];
  for (const attempt of tries) { const d = attempt(); if (d.isValid) return d.setZone(TZ); }
  return null;
}
const parseDate = (value) => parseTs(value)?.startOf('day') ?? null;`;

export const SETTINGS_TO_OBJECT = (lane, required) => `// SETTINGS arrives as one item per row (key | value | type | description).
// Turn it into ONE item, e.g. { DEMO_MODE: 'TRUE', GEMINI_MODEL: 'gemini-2.5-flash', ... },
// so every later node can read settings with $('Lane ${lane} · Settings to object').first().json.KEY
const settings = {};
for (const item of $input.all()) {
  const key = String(item.json.key ?? '').trim();
  if (!key) continue;
  const value = item.json.value;
  settings[key] = typeof value === 'string' ? value.trim() : (value ?? '');
}

// Stop early with a clear message if the sheet is missing something Lane ${lane} needs.
const required = ${JSON.stringify(required)};
const missing = required.filter((key) => settings[key] === undefined || settings[key] === '');
if (missing.length) {
  throw new Error(\`The SETTINGS tab is missing a value for: \${missing.join(', ')}\`);
}

// Derived values (SPEC section 5.3). Sheet booleans may come back as true or "TRUE".
settings.IS_DEMO = String(settings.DEMO_MODE).trim().toUpperCase() === 'TRUE';
const demoMinutes = Number(settings.DEMO_MINUTES_PER_DAY);
if (settings.IS_DEMO && !(demoMinutes > 0)) {
  throw new Error('DEMO_MINUTES_PER_DAY must be a number above 0 when DEMO_MODE is TRUE');
}
settings.DAY_MS = settings.IS_DEMO ? demoMinutes * 60 * 1000 : 24 * 60 * 60 * 1000;

return [{ json: settings }];
`;

export const SAFETY_GATE = (lane) => `// Lane ${lane} · Demo safety gate: input items carry the recipient in \`to_email\`.
const S = $('Lane ${lane} · Settings to object').first().json;
const PUBLIC = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'rediffmail.com', 'proton.me', 'protonmail.com'];
const list = (value) => String(value ?? '').toLowerCase().split(',').map((part) => part.trim()).filter(Boolean);
function checkRecipient(email) {
  const match = /^([a-z0-9._%-]+)(\\+[a-z0-9._%-]*)?@([a-z0-9.-]+\\.[a-z]{2,})$/.exec(email);
  if (!match) return { ok: false, reason: 'not a single valid email address' };
  const base = \`\${match[1]}@\${match[3]}\`;                      // plus-tag removed
  const inboxes = [...list(S.ALLOWED_DEMO_INBOXES), ...list(S.SENDER_EMAIL)];
  const domains = list(S.ALLOWED_EMAIL_DOMAINS).map((d) => d.replace(/^@/, '')).filter((d) => !PUBLIC.includes(d));
  if (inboxes.includes(base)) return { ok: true, reason: 'demo inbox' };
  if (domains.includes(match[3])) return { ok: true, reason: 'demo domain' };
  return { ok: false, reason: 'not in ALLOWED_DEMO_INBOXES or ALLOWED_EMAIL_DOMAINS' };
}
return $input.all().map((item) => {
  const to = String(item.json.to_email ?? '').trim().toLowerCase();
  const check = checkRecipient(to);
  return { json: { ...item.json, safe_to: check.ok ? to : '', gate_ok: check.ok, gate_reason: check.reason } };
});
`;

// Event builder used by "Build log events" (SPEC 5.6). \`specs\` = array of plain event descriptions.
export const EVENT_BUILDER = (lane) => `const TZ = 'Asia/Kolkata';
const LANE = ${lane};
const now = $now.setZone(TZ);
const stamp = now.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
const usedIds = new Set();
function eventId() {
  let id;
  do {
    id = \`EV-\${now.toFormat('yyyyMMddHHmmssSSS')}-\${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')}\`;
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}
function event({ event_type, entity_type, entity_id = '', status_from = '', status_to = '', channel = '', detail = '', meta = {} }) {
  return {
    event_id: eventId(), ts: stamp, lane: LANE,
    event_type, entity_type, entity_id, status_from, status_to, channel,
    detail: String(detail).slice(0, 200), meta_json: JSON.stringify(meta),
    execution_id: String($execution.id), demo_mode: S.IS_DEMO ? 'TRUE' : 'FALSE',
  };
}`;

export const READ_GEMINI_REPLY = (lane) => `// Pull the answer text out of Gemini's response. If the HTTP call failed (after its retries),
// the item only has an "error" field; we pass that on so the check can switch to Groq.
const request = $('Lane ${lane} · Build AI request').first().json;
const response = $input.first().json;

let text = '';
let error = '';
if (response.error) {
  const { message, description } = response.error;
  const detail = [message, description].filter(Boolean).join(' - ') || JSON.stringify(response.error);
  error = \`Gemini call failed: \${String(detail).slice(0, 300)}\`;
} else {
  const candidate = (response.candidates || [])[0];
  const parts = candidate?.content?.parts || [];
  // Skip "thought" parts that thinking models may add; keep only the answer text.
  text = parts.filter((part) => !part.thought && typeof part.text === 'string').map((part) => part.text).join('');
  const finish = candidate?.finishReason || response.promptFeedback?.blockReason || 'unknown';
  if (!text) error = \`Gemini returned no text (reason: \${finish})\`;
  else if (finish !== 'STOP') error = \`Gemini stopped early (reason: \${finish})\`;
}

return [{ json: { provider: 'gemini', model: request.gemini_model, text, error, fallback_reason: '' } }];
`;

export const READ_GROQ_REPLY = (lane) => `// Pull the answer text out of Groq's (OpenAI-style) response, and remember why we fell back.
const request = $('Lane ${lane} · Build AI request').first().json;
const response = $input.first().json;
// The item that the IF node sent down its "true" branch carries Gemini's error.
const fallbackReason = $('Lane ${lane} · Need Groq fallback?').first(0)?.json?.ai_error || '';

let text = '';
let error = '';
if (response.error) {
  const { message, description } = response.error;
  const detail = [message, description].filter(Boolean).join(' - ') || JSON.stringify(response.error);
  error = \`Groq call failed: \${String(detail).slice(0, 300)}\`;
} else {
  const choice = (response.choices || [])[0];
  text = choice?.message?.content || '';
  if (!text) error = \`Groq returned no text (reason: \${choice?.finish_reason || 'unknown'})\`;
}

return [{ json: { provider: 'groq', model: request.groq_model, text, error, fallback_reason: fallbackReason } }];
`;
