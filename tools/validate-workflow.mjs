#!/usr/bin/env node
// Validates an n8n workflow export against SPEC.md (structure + project rules).
// Usage:
//   node tools/validate-workflow.mjs lanes/lane-3-lead-engine.json      (one lane file)
//   node tools/validate-workflow.mjs lanes/marion-marketing-engine.json  (the merged canvas)
// Exit code 0 = no errors (warnings allowed), 1 = errors found.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/validate-workflow.mjs <workflow.json>');
  process.exit(2);
}

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ---- SPEC section 1 + 9: allowed credentials and node versions
const CREDENTIALS = {
  googleSheetsOAuth2Api: ['Kaya Demo · Google Sheets'],
  gmailOAuth2: ['Kaya Demo · Gmail Sender', 'Kaya Demo · Gmail Demo Customers'],
  googlePalmApi: ['Kaya Demo · Gemini'],
  groqApi: ['Kaya Demo · Groq'],
  telegramApi: ['Kaya Demo · Telegram Bot'],
};
const NODE_VERSIONS = {
  'n8n-nodes-base.manualTrigger': [1],
  'n8n-nodes-base.scheduleTrigger': [1.2],
  'n8n-nodes-base.formTrigger': [2.2],
  'n8n-nodes-base.gmailTrigger': [1.2],
  'n8n-nodes-base.code': [2],
  'n8n-nodes-base.if': [2.2],
  'n8n-nodes-base.switch': [3.2],
  'n8n-nodes-base.set': [3.4],
  'n8n-nodes-base.filter': [2.2],
  'n8n-nodes-base.merge': [3],
  'n8n-nodes-base.splitInBatches': [3],
  'n8n-nodes-base.wait': [1.1],
  'n8n-nodes-base.httpRequest': [4.2],
  'n8n-nodes-base.googleSheets': [4.5],
  'n8n-nodes-base.gmail': [2.1],
  'n8n-nodes-base.telegram': [1.2],
  'n8n-nodes-base.noOp': [1],
  'n8n-nodes-base.stopAndError': [1],
  'n8n-nodes-base.stickyNote': [1],
};
const TRIGGERS = ['manualTrigger', 'scheduleTrigger', 'formTrigger', 'gmailTrigger'].map((t) => `n8n-nodes-base.${t}`);
const TABS = ['SETTINGS', 'BRIEF', 'CONTENT', 'LEADS', 'PROSPECTS', 'SEQUENCES', 'EVENTS_LOG', 'DASHBOARD'];
const SHEET_PLACEHOLDER = '__KAYA_SHEET_ID__';
const NAME_RE = /^Lane ([1-8]) · \S.*$/;
const CANVAS_RE = /^Canvas · \S.*$/;   // canvas-level sticky notes (the overview above Lane 1 in the merged file)
const LANE_TITLES = { 1: 'Content engine', 2: 'Publisher', 3: 'Lead engine', 4: 'Sequence sender', 5: 'Launch engine', 6: 'Outreach', 7: 'Inbox', 8: 'Report' };
const NODE_SIZE = 100; // n8n draws a node as a 100 x 100 box at its position
const LANE_HEIGHT = 1200; // SPEC section 5.8: lane N lives in y = (N-1)*1200 ... (N-1)*1200 + 1000

let wf;
try {
  wf = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`✖ ${file} is not valid JSON: ${e.message}`);
  process.exit(1);
}

// ---- structure
if (!Array.isArray(wf.nodes)) err('Top-level "nodes" must be an array');
if (!wf.connections || typeof wf.connections !== 'object' || Array.isArray(wf.connections)) err('Top-level "connections" must be an object');
const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
const connections = wf.connections || {};
if (wf.settings?.executionOrder !== 'v1') err('settings.executionOrder must be "v1"');
if (wf.settings?.timezone !== 'Asia/Kolkata') err('settings.timezone must be "Asia/Kolkata"');

const byName = new Map();
const ids = new Set();
for (const [i, n] of nodes.entries()) {
  const label = n?.name ?? `#${i}`;
  for (const key of ['name', 'type', 'id']) if (typeof n?.[key] !== 'string' || !n[key]) err(`Node ${label}: "${key}" must be a non-empty string`);
  if (typeof n?.typeVersion !== 'number') err(`Node ${label}: "typeVersion" must be a number`);
  if (!Array.isArray(n?.position) || n.position.length !== 2 || !n.position.every(Number.isFinite)) err(`Node ${label}: "position" must be [x, y]`);
  if (!n?.parameters || typeof n.parameters !== 'object') err(`Node ${label}: "parameters" must be an object`);
  if (byName.has(n?.name)) err(`Duplicate node name: "${n.name}"`);
  byName.set(n?.name, n);
  if (ids.has(n?.id)) err(`Duplicate node id: "${n.id}" (${label})`);
  ids.add(n?.id);
}

// ---- connections
const parents = new Map(); // target -> [{ from, output }]
for (const [source, byType] of Object.entries(connections)) {
  if (!byName.has(source)) err(`Connection from unknown node "${source}"`);
  for (const [type, outputs] of Object.entries(byType || {})) {
    if (!Array.isArray(outputs)) { err(`Connections of "${source}" (${type}) must be an array`); continue; }
    outputs.forEach((targets, output) => {
      for (const t of targets || []) {
        if (!byName.has(t.node)) err(`Connection "${source}" → unknown node "${t.node}"`);
        if (t.type !== type) err(`Connection "${source}" → "${t.node}": type "${t.type}" should be "${type}"`);
        if (!Number.isInteger(t.index)) err(`Connection "${source}" → "${t.node}": index must be an integer`);
        if (!parents.has(t.node)) parents.set(t.node, []);
        parents.get(t.node).push({ from: source, output });
      }
    });
  }
}

// ---- reachability from triggers (sticky notes excluded)
const reachable = new Set();
const queue = nodes.filter((n) => TRIGGERS.includes(n.type)).map((n) => n.name);
while (queue.length) {
  const name = queue.shift();
  if (reachable.has(name)) continue;
  reachable.add(name);
  for (const outputs of Object.values(connections[name] || {})) for (const targets of outputs || []) for (const t of targets || []) queue.push(t.node);
}

// ---- project rules
const secretPatterns = [/AIza[0-9A-Za-z_-]{30,}/, /gsk_[0-9A-Za-z]{20,}/, /\b\d{8,10}:[0-9A-Za-z_-]{30,}\b/, /\bsk-[0-9A-Za-z]{20,}/, /ya29\.[0-9A-Za-z_-]{20,}/];
const raw = JSON.stringify(wf);
for (const p of secretPatterns) if (p.test(raw)) err(`Looks like a real API key or token is in the file (pattern ${p})`);

const lanesSeen = new Set();
let manualTriggers = 0;
for (const n of nodes) {
  if (n.type === 'n8n-nodes-base.stickyNote' && CANVAS_RE.test(n.name || '')) {
    const bottom = (n.position?.[1] ?? 0) + Number(n.parameters?.height ?? 0);
    if (bottom > 0) err(`"${n.name}": a canvas-level sticky note must sit above Lane 1 (bottom edge y <= 0, found ${bottom})`);
    continue;
  }
  const m = NAME_RE.exec(n.name || '');
  if (!m) err(`Node name "${n.name}" must look like "Lane N · Short action" (SPEC 5.1)`);
  const lane = m ? Number(m[1]) : null;
  if (lane) lanesSeen.add(lane);

  const versions = NODE_VERSIONS[n.type];
  if (!versions) warn(`"${n.name}": node type ${n.type} is not in the SPEC version table; check it with the team`);
  else if (!versions.includes(n.typeVersion)) err(`"${n.name}": ${n.type} must use typeVersion ${versions.join(' or ')}, found ${n.typeVersion}`);

  const [, y] = n.position || [0, 0];
  const top = ((lane || 1) - 1) * LANE_HEIGHT;
  if (lane && (y < top || y > top + 1000)) err(`"${n.name}": y=${y} is outside lane ${lane}'s band (${top}..${top + 1000}) (SPEC 5.8)`);

  if (n.type === 'n8n-nodes-base.stickyNote') continue;
  if (n.type === 'n8n-nodes-base.manualTrigger') manualTriggers++;
  if (!reachable.has(n.name)) warn(`"${n.name}" is not connected to any trigger`);

  for (const [credType, cred] of Object.entries(n.credentials || {})) {
    const allowed = CREDENTIALS[credType];
    if (!allowed) err(`"${n.name}": credential type ${credType} is not in SPEC section 1`);
    else if (!allowed.includes(cred?.name)) err(`"${n.name}": credential name "${cred?.name}" must be one of: ${allowed.join(', ')}`);
    // null, not "": n8n's editor import drops references whose id is "" (SPEC 1, session 5).
    if (cred?.id !== null) err(`"${n.name}": credential id must be null in repo files ("" is dropped by the editor's Import from File), found ${JSON.stringify(cred?.id)}`);
  }

  const p = n.parameters || {};
  if (n.type === 'n8n-nodes-base.googleSheets') {
    if (p.documentId?.value !== SHEET_PLACEHOLDER || p.documentId?.mode !== 'id') err(`"${n.name}": documentId must be { mode: "id", value: "${SHEET_PLACEHOLDER}" }`);
    if (p.sheetName?.mode !== 'name' || !TABS.includes(p.sheetName?.value)) err(`"${n.name}": sheetName must be { mode: "name", value: <one of ${TABS.join(', ')}> }`);
    if (['append', 'update', 'appendOrUpdate'].includes(p.operation) && p.options?.cellFormat !== 'RAW') err(`"${n.name}": writes must set options.cellFormat = "RAW" (SPEC 5.4)`);
  }
  if (n.type === 'n8n-nodes-base.gmail') {
    const resource = p.resource ?? 'message';
    const operation = p.operation ?? 'send';
    if (resource === 'message' && ['send', 'reply'].includes(operation)) {
      if (operation === 'send' && p.sendTo !== '={{ $json.safe_to }}') err(`"${n.name}": sendTo must be exactly ={{ $json.safe_to }} (SPEC 5.7)`);
      if (p.options?.appendAttribution !== false) err(`"${n.name}": options.appendAttribution must be false`);
      const gate = (parents.get(n.name) || []).filter((pp) => /^Lane [1-8] · Recipient allowed\?$/.test(pp.from) && pp.output === 0);
      const others = (parents.get(n.name) || []).filter((pp) => !/^Lane [1-8] · Recipient allowed\?$/.test(pp.from));
      if (!gate.length || others.length) err(`"${n.name}": must be fed ONLY by the "true" output of "Lane N · Recipient allowed?" (SPEC 5.7)`);
    }
  }
  if (n.type === 'n8n-nodes-base.telegram') {
    if ((p.operation ?? 'sendMessage') === 'sendMessage') {
      if (p.chatId !== '={{ $json.chat_id }}') err(`"${n.name}": chatId must be ={{ $json.chat_id }} (built from SETTINGS, SPEC 5.7)`);
      if (p.additionalFields?.appendAttribution !== false) err(`"${n.name}": additionalFields.appendAttribution must be false`);
    }
  }
  if (n.type === 'n8n-nodes-base.wait') {
    const unit = p.unit ?? 'seconds';
    const resume = p.resume ?? 'timeInterval';
    if (resume !== 'timeInterval') err(`"${n.name}": Wait nodes may only pause for a time interval (SPEC 5.5)`);
    if (unit !== 'seconds') err(`"${n.name}": Wait nodes must use seconds (max 60) (SPEC 5.5)`);
    if (typeof p.amount === 'number' && p.amount > 60) err(`"${n.name}": Wait of ${p.amount}s is longer than 60s (SPEC 5.5)`);
  }
}
// ---- uniqueness that matters once lanes share one canvas (SPEC 8.3)
const seenWebhooks = new Map();
const seenPaths = new Map();
for (const n of nodes) {
  if (n.webhookId) {
    if (seenWebhooks.has(n.webhookId)) err(`Duplicate webhookId ${n.webhookId}: "${seenWebhooks.get(n.webhookId)}" and "${n.name}"`);
    seenWebhooks.set(n.webhookId, n.name);
  }
  if (n.type === 'n8n-nodes-base.formTrigger') {
    const path = n.parameters?.options?.path;
    if (!path) err(`"${n.name}": Form Trigger needs options.path (SPEC 7.3 / 7.7)`);
    else if (seenPaths.has(path)) err(`Duplicate form path "${path}": "${seenPaths.get(path)}" and "${n.name}"`);
    else seenPaths.set(path, n.name);
  }
}

// ---- layout: nothing overlaps (SPEC 5.8 / 8.5)
const boxOf = (n) => {
  const [x, y] = n.position || [0, 0];
  if (n.type !== 'n8n-nodes-base.stickyNote') return { x1: x, y1: y, x2: x + NODE_SIZE, y2: y + NODE_SIZE };
  return { x1: x, y1: y, x2: x + Number(n.parameters?.width ?? 240), y2: y + Number(n.parameters?.height ?? 160) };
};
const intersects = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
const inside = (a, b) => a.x1 >= b.x1 && a.x2 <= b.x2 && a.y1 >= b.y1 && a.y2 <= b.y2;
const isFrame = (n) => n.type === 'n8n-nodes-base.stickyNote' && Object.entries(LANE_TITLES).some(([lane, title]) => n.name === `Lane ${lane} · ${title}`);
const working = nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
const notes = nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote' && !isFrame(n));
const frames = nodes.filter(isFrame);
for (let i = 0; i < working.length; i++) {
  for (let j = i + 1; j < working.length; j++) {
    if (intersects(boxOf(working[i]), boxOf(working[j]))) err(`"${working[i].name}" and "${working[j].name}" overlap on the canvas`);
  }
}
for (const note of notes) {
  // An explanatory note may sit in empty space or fully behind a group of nodes (as a sub-frame), never half over a node.
  for (const n of working) if (intersects(boxOf(note), boxOf(n)) && !inside(boxOf(n), boxOf(note))) err(`Sticky note "${note.name}" partly covers "${n.name}"`);
  for (const other of notes) if (other !== note && intersects(boxOf(note), boxOf(other))) err(`Sticky notes "${note.name}" and "${other.name}" overlap`);
}
for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) if (intersects(boxOf(frames[i]), boxOf(frames[j]))) err(`Lane frames "${frames[i].name}" and "${frames[j].name}" overlap`);
for (const frame of frames) {
  const lane = NAME_RE.exec(frame.name)[1];
  for (const n of nodes) {
    if (n === frame || NAME_RE.exec(n.name || '')?.[1] !== lane) continue;
    if (!inside(boxOf(n), boxOf(frame))) warn(`"${n.name}" sticks out of its lane frame "${frame.name}"`);
  }
}

if (manualTriggers > 1) err(`Found ${manualTriggers} Manual Trigger nodes; n8n allows one per workflow (reserved for Lane 1)`);
for (const lane of lanesSeen) {
  const laneNodes = nodes.filter((n) => NAME_RE.exec(n.name || '')?.[1] === String(lane));
  if (!laneNodes.some((n) => n.type === 'n8n-nodes-base.stickyNote')) err(`Lane ${lane} has no sticky note label (SPEC 5.8)`);
  if (!laneNodes.some((n) => TRIGGERS.includes(n.type))) err(`Lane ${lane} has no trigger node`);
}

// ---- report
const lanes = [...lanesSeen].sort().join(', ');
console.log(`${file}: ${nodes.length} nodes, lanes [${lanes}], ${Object.keys(connections).length} connection sources`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✖ ${e}`);
console.log(errors.length ? `✖ ${errors.length} error(s), ${warnings.length} warning(s)` : `✔ valid (${warnings.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
