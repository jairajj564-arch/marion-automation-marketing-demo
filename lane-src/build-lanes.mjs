#!/usr/bin/env node
// Builds lanes/lane-2-publisher.json and lanes/lane-3-lead-engine.json from the readable sources in
// lane-src/ (one .js file per Code node + this file for the node graph).
//   node lane-src/build-lanes.mjs
// The JSON files in lanes/ are what you import into n8n; this script only exists so the Code nodes
// can be read, diffed and reviewed as normal JavaScript instead of one long escaped string.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// ---------- helpers
const uuid = (seed) => {
  const h = createHash('sha1').update(`kaya-session2|${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const columns = (tab) => read(`sheets-template/${tab}.csv`).split('\n')[0].trim().split(',');

function code(lane, file) {
  let src = file.startsWith('shared/') ? read(`lane-src/${file}`).replace(/__N__/g, String(lane)) : read(`lane-src/lane-${lane}/${file}`);
  src = src.replace(/\/\*@include (\w+)\*\//g, (_, name) => read(`lane-src/shared/${name}.js`).replace(/__N__/g, String(lane)).trimEnd());
  return src.trimEnd() + '\n';
}

class Lane {
  constructor(n, title, slug) {
    this.n = n; this.title = title; this.slug = slug;
    this.nodes = []; this.connections = {}; this.top = (n - 1) * 1200;
  }
  name(short) { return `Lane ${this.n} · ${short}`; }
  add(short, type, typeVersion, x, y, parameters, extra = {}) {
    const name = this.name(short);
    const node = { parameters, type, typeVersion, position: [x, this.top + y], id: uuid(`${this.n}|${name}`), name, ...extra };
    this.nodes.push(node);
    return name;
  }
  sticky(short, x, y, width, height, color, content) {
    return this.add(short, 'n8n-nodes-base.stickyNote', 1, x, y, { content, height, width, color });
  }
  connect(from, to, output = 0) {
    const outs = (this.connections[from] ??= { main: [] }).main;
    while (outs.length <= output) outs.push([]);
    outs[output].push({ node: to, type: 'main', index: 0 });
  }
  chain(...names) { for (let i = 0; i < names.length - 1; i++) this.connect(names[i], names[i + 1]); }
  // ---- node kinds
  codeNode(short, x, y, file, note, extra = {}) {
    return this.add(short, 'n8n-nodes-base.code', 2, x, y, { jsCode: code(this.n, file) }, { notes: note, notesInFlow: true, ...extra });
  }
  sheet(short, x, y, tab, operation, note, opts = {}) {
    const doc = { __rl: true, value: '__KAYA_SHEET_ID__', mode: 'id' };
    const sheetName = { __rl: true, value: tab, mode: 'name' };
    const parameters = { operation, documentId: doc, sheetName };
    if (operation === 'read') parameters.options = {};
    else {
      const key = tab === 'CONTENT' ? 'content_id' : tab === 'LEADS' ? 'lead_id' : null;
      parameters.columns = {
        mappingMode: 'autoMapInputData', value: {}, matchingColumns: operation === 'update' ? [key] : [],
        schema: columns(tab).map((id) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true })),
        attemptToConvertTypes: false, convertFieldsToString: false,
      };
      parameters.options = operation === 'append' ? { cellFormat: 'RAW', handlingExtraData: 'ignoreIt' } : { cellFormat: 'RAW' };
    }
    return this.add(short, 'n8n-nodes-base.googleSheets', 4.5, x, y, parameters, {
      credentials: { googleSheetsOAuth2Api: { id: null, name: 'Kaya Demo · Google Sheets' } },
      retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, notes: note, notesInFlow: true, ...(opts.alwaysOutputData ? { alwaysOutputData: true } : {}),
    });
  }
  saveLog(short, x, y, note = 'Append to EVENTS_LOG') { return this.sheet(short, x, y, 'EVENTS_LOG', 'append', note); }
  ifNode(short, x, y, condition, note) {
    return this.add(short, 'n8n-nodes-base.if', 2.2, x, y, {
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: uuid(`${this.n}|${short}|cond`), ...condition }], combinator: 'and' },
      options: {},
    }, { notes: note, notesInFlow: true });
  }
  isTrue(field) { return { leftValue: `={{ $json.${field} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }; }
  telegram(short, x, y, note, onError) {
    return this.add(short, 'n8n-nodes-base.telegram', 1.2, x, y, {
      chatId: '={{ $json.chat_id }}', text: '={{ $json.text }}',
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
    }, {
      webhookId: uuid(`${this.n}|${short}|webhook`), credentials: { telegramApi: { id: null, name: 'Kaya Demo · Telegram Bot' } },
      retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError, notes: note, notesInFlow: true,
    });
  }
  loop(short, x, y, note) { return this.add(short, 'n8n-nodes-base.splitInBatches', 3, x, y, { batchSize: 1, options: {} }, { notes: note, notesInFlow: true }); }
  export(workflowName) {
    return {
      name: workflowName, nodes: this.nodes, connections: this.connections, active: false,
      settings: { executionOrder: 'v1', timezone: 'Asia/Kolkata', saveManualExecutions: true },
      pinData: {}, meta: { templateCredsSetupCompleted: false }, tags: [],
    };
  }
}

// =====================================================================================
// LANE 2 · PUBLISHER
// =====================================================================================
function buildLane2() {
  const L = new Lane(2, 'Publisher', 'publisher');
  const frame = `## 📣 Lane 2 · Publisher  ·  trigger: every minute (cron \`0 * * * * *\`)\n**What it does:** looks in **CONTENT** for rows with status \`approved\` / \`publishing\` whose \`scheduled_for\` has passed. Captions, short posts and blog teasers go to the **Telegram channel** (stand-in for Instagram), reel ideas go to **your private chat** as shoot briefs, and an approved **newsletter** is emailed to active leads (a few per minute) until everyone has it.\n**Reads:** SETTINGS, CONTENT, LEADS (only when a newsletter is due). **Writes:** CONTENT \`status, published_at, publish_ref, last_error, updated_at\` · LEADS \`last_newsletter_id, last_contacted_at, thread_ids, updated_at\` (+ \`status, email_allowed\` when an address is blocked) · EVENTS_LOG.\n**Credentials:** Kaya Demo · Google Sheets / Gmail Sender / Telegram Bot.  **Docs:** SPEC.md §7.2 · docs/lane-2.md explains every node.`;
  L.sticky('Publisher', -240, 0, 5900, 1000, 2, frame);
  L.sticky('How the newsletter loop works', -200, 560, 1400, 400, 7,
    `### How the newsletter loop works\n1. A newsletter is just a CONTENT row with \`asset_type = newsletter\`.\n2. Each minute Lane 2 picks up to **MAX_SENDS_PER_RUN** active leads who do not have it yet (\`last_newsletter_id\` ≠ this newsletter) and who passed the gap rule.\n3. For each lead: **safety gate → Gmail → update the lead row → log → pause**. The lead row is updated *before* the next lead, so nobody is emailed twice.\n4. When nobody is left waiting, the CONTENT row becomes \`published\`. If the PC was off, the next run just carries on.`);

  // spine (y = 300 is the band's first node row)
  const trigger = L.add('Every minute', 'n8n-nodes-base.scheduleTrigger', 1.2, 0, 300, { rule: { interval: [{ field: 'cronExpression', expression: '0 * * * * *' }] } }, { notes: 'Cron: every minute', notesInFlow: true });
  const readSettings = L.sheet('Read SETTINGS', 220, 300, 'SETTINGS', 'read', 'Reads every setting');
  const settings = L.codeNode('Settings to object', 440, 300, 'settings-to-object.js', 'Rows → one settings item');
  const readContent = L.sheet('Read CONTENT', 660, 300, 'CONTENT', 'read', 'Reads all content rows', { alwaysOutputData: true });
  const pick = L.codeNode('Pick due content', 880, 300, 'pick-due-content.js', 'Approved + due only');
  const route = L.add('Route by kind', 'n8n-nodes-base.switch', 3.2, 1100, 300, {
    rules: { values: ['post', 'newsletter', 'problem'].map((key) => ({
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: uuid(`2|route|${key}`), leftValue: '={{ $json.kind }}', rightValue: key, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' },
      renamedOutput: true, outputKey: key,
    })) },
    options: {},
  }, { notes: 'post / newsletter / problem', notesInFlow: true });
  L.chain(trigger, readSettings, settings, readContent, pick, route);

  // ---- problem branch (output 2)
  const pbuild = L.codeNode('Build problem update', 1340, 280, 'build-problem-update.js', 'Key + owned columns');
  const pupdate = L.sheet('Update CONTENT with problem', 1560, 280, 'CONTENT', 'update', 'Sets last_error only');
  const plog = L.codeNode('Build problem log', 1780, 280, 'build-problem-log.js', 'error event');
  const psave = L.saveLog('Save problem to EVENTS_LOG', 2000, 280);
  L.connect(route, pbuild, 2); L.chain(pbuild, pupdate, plog, psave);

  // ---- posts branch (output 0)
  const ploop = L.loop('Loop over posts', 1340, 460, 'One post at a time');
  const pmsg = L.codeNode('Build Telegram message', 1560, 420, 'build-telegram-message.js', 'chat_id + text');
  const psend = L.telegram('Send to Telegram', 1780, 420, 'Retries 3×, errors continue', 'continueErrorOutput');
  const pres = L.codeNode('Build publish result', 2000, 420, 'build-publish-result.js', 'Success or failure');
  const pupd = L.sheet('Update CONTENT after post', 2220, 420, 'CONTENT', 'update', 'Right after sending');
  const plg = L.codeNode('Build post log', 2440, 420, 'build-post-log.js', 'content_published / publish_failed');
  const psv = L.saveLog('Save post to EVENTS_LOG', 2660, 420);
  L.connect(route, ploop, 0);
  L.connect(ploop, pmsg, 1);
  L.chain(pmsg, psend);
  L.connect(psend, pres, 0); L.connect(psend, pres, 1);
  L.chain(pres, pupd, plg, psv, ploop);

  // ---- newsletter branch (output 1)
  const needs = L.ifNode('Newsletter needs publishing?', 1340, 700, L.isTrue('needs_publishing'), 'approved → publishing');
  const bpub = L.codeNode('Build publishing update', 1560, 640, 'build-publishing-update.js', 'status = publishing');
  const upub = L.sheet('Mark newsletter publishing', 1780, 640, 'CONTENT', 'update', 'First touch only');
  const readLeads = L.sheet('Read LEADS', 2000, 720, 'LEADS', 'read', 'Only when a newsletter is due', { alwaysOutputData: true });
  const recips = L.codeNode('Pick newsletter recipients', 2220, 720, 'pick-newsletter-recipients.js', 'Up to MAX_SENDS_PER_RUN');
  const any = L.ifNode('Any recipient to send?', 2440, 720, { leftValue: '={{ $json.recipient_count }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }, 'recipient_count > 0');
  L.connect(route, needs, 1);
  L.connect(needs, bpub, 0); L.connect(needs, readLeads, 1);
  L.chain(bpub, upub, readLeads, recips, any);

  const nloop = L.loop('Loop over recipients', 2660, 640, 'One lead at a time');
  const gate = L.add('Demo safety gate', 'n8n-nodes-base.code', 2, 2880, 640, { jsCode: code(2, 'shared/gate.js') }, { notes: 'Demo inboxes only', notesInFlow: true });
  const allowed = L.ifNode('Recipient allowed?', 3100, 640, L.isTrue('gate_ok'), 'true = may send');
  const gsend = L.add('Send newsletter email', 'n8n-nodes-base.gmail', 2.1, 3320, 560, {
    resource: 'message', operation: 'send', sendTo: '={{ $json.safe_to }}', subject: '={{ $json.subject }}',
    emailType: 'html', message: '={{ $json.html }}', options: { appendAttribution: false, senderName: '={{ $json.sender_name }}' },
  }, { credentials: { gmailOAuth2: { id: null, name: 'Kaya Demo · Gmail Sender' } }, retryOnFail: false, onError: 'continueErrorOutput', notes: 'No retry (could double-send)', notesInFlow: true });
  const blead = L.codeNode('Build lead update', 3540, 540, 'build-lead-update.js', 'Owned LEADS columns');
  const ulead = L.sheet('Update LEAD after send', 3760, 540, 'LEADS', 'update', 'Before the next lead');
  const bblock = L.codeNode('Build blocked update', 3320, 760, 'build-blocked-update.js', 'blocked + FALSE');
  const ublock = L.sheet('Update LEAD as blocked', 3540, 760, 'LEADS', 'update', 'Never emailed again');
  const slog = L.codeNode('Build send log', 3980, 640, 'build-send-log.js', 'sent / blocked / failed');
  const ssave = L.saveLog('Save send to EVENTS_LOG', 4200, 640);
  const pause = L.add('Pause between emails', 'n8n-nodes-base.wait', 1.1, 4420, 640, { amount: '={{ $json.pause_seconds }}', unit: 'seconds' }, { webhookId: uuid('2|Pause between emails|webhook'), notes: 'SEND_DELAY_SECONDS', notesInFlow: true });
  L.connect(any, nloop, 0);
  L.connect(nloop, gate, 1);
  L.chain(gate, allowed);
  L.connect(allowed, gsend, 0); L.connect(allowed, bblock, 1);
  L.connect(gsend, blead, 0); L.connect(gsend, slog, 1);
  L.chain(blead, ulead, slog);
  L.chain(bblock, ublock, slog);
  L.chain(slog, ssave, pause, nloop);

  const finished = L.codeNode('Check newsletter finished', 2660, 860, 'check-newsletter-finished.js', 'Anyone left waiting?');
  const ufin = L.sheet('Update CONTENT after newsletter', 2880, 860, 'CONTENT', 'update', 'status = published');
  const fdone = L.codeNode('Build newsletter done log', 3100, 860, 'build-newsletter-done-log.js', 'content_published');
  const fsave = L.saveLog('Save newsletter done to EVENTS_LOG', 3320, 860);
  L.connect(any, finished, 1);
  L.connect(nloop, finished, 0);
  L.chain(finished, ufin, fdone, fsave);
  return L.export('Kaya Jewels demo · Lane 2 · Publisher');
}

// =====================================================================================
// LANE 3 · LEAD ENGINE
// =====================================================================================
function buildLane3() {
  const L = new Lane(3, 'Lead engine', 'lead-engine');
  const frame = `## 🪔 Lane 3 · Lead engine  ·  trigger: the waitlist form (URL \`<n8n>/form/kaya-waitlist\`, works while the workflow is active)\n**What it does:** a visitor fills in the form → the answers are cleaned and checked → a duplicate email is ignored → the lead is scored (rules in docs/lane-3.md) → the email goes through the demo safety gate → one row is added to **LEADS** → events are logged → hot leads (score ≥ HOT_LEAD_SCORE) ping you on Telegram.\n**Sends no email:** Lane 4 sends the welcome email within a minute.\n**Reads:** SETTINGS, LEADS. **Writes:** LEADS (a full new row), EVENTS_LOG.  **Credentials:** Kaya Demo · Google Sheets / Telegram Bot.  **Docs:** SPEC.md §7.3 · docs/lane-3.md.`;
  L.sticky('Lead engine', -240, 0, 5600, 1000, 3, frame);
  L.sticky('How scoring works', -200, 560, 1500, 400, 7,
    `### How a lead is scored (max 100)\n**Budget:** above_5000 +30 · 3000_5000 +25 · 1500_3000 +15 · under_1500 +5\n**Occasion:** diwali_outfit +25 · gifting +20 · wedding_season +20 · self_treat +15 · just_browsing +0\n**Interest:** full_set +15 · necklaces +12 · earrings +10 · bangles +10 · gifting +10 · maang_tikka +8\n**Extras:** Instagram handle +10 · WhatsApp number +10 · email consent +10\n**Segment:** score ≥ HOT_LEAD_SCORE → hot · ≥ WARM_LEAD_SCORE → warm · else cold.`);

  const fields = [
    ['First name', 'text', true], ['Email', 'email', true], ['City', 'text', true], ['Instagram handle', 'text', false],
    ['WhatsApp number', 'text', false],
    ["I'm shopping for", 'dropdown', true, ['Earrings', 'Necklaces', 'Maang tikka', 'Bangles', 'Gifting', 'A full festive set']],
    ['My budget', 'dropdown', true, ['Under ₹1,500', '₹1,500–₹3,000', '₹3,000–₹5,000', 'Above ₹5,000']],
    ['Occasion', 'dropdown', true, ['My Diwali outfit', 'Gifting', 'Wedding season', 'Treating myself', 'Just browsing']],
    ['Email consent', 'dropdown', true, ['Yes, email me about early access and offers', 'No thanks']],
  ];
  const trigger = L.add('Waitlist form', 'n8n-nodes-base.formTrigger', 2.2, 0, 300, {
    formTitle: 'Join the Roshni Edit waitlist',
    formDescription: 'Early access + 10% off for waitlist members. Handmade in Jaipur by Kaya Jewels.',
    formFields: { values: fields.map(([label, type, required, options]) => ({
      fieldLabel: label, fieldType: type, ...(options ? { fieldOptions: { values: options.map((option) => ({ option })) } } : {}), requiredField: required,
    })) },
    responseMode: 'onReceived',
    options: { path: 'kaya-waitlist', appendAttribution: false, respondWithOptions: { values: { respondWith: 'text', formSubmittedText: "You're on the list! Check your inbox soon for early-access details." } } },
  }, { webhookId: uuid('3|form|webhook'), notes: 'Public waitlist form', notesInFlow: true });
  const readSettings = L.sheet('Read SETTINGS', 220, 300, 'SETTINGS', 'read', 'Reads every setting');
  const settings = L.codeNode('Settings to object', 440, 300, 'settings-to-object.js', 'Rows → one settings item');
  const validate = L.codeNode('Validate and normalise', 660, 300, 'validate-normalise.js', 'Trim, map, check');
  const valid = L.ifNode('Valid submission?', 880, 300, L.isTrue('ok'), 'ok = true');
  L.chain(trigger, readSettings, settings, validate, valid);

  const errlog = L.codeNode('Build error log', 1100, 160, 'build-error-log.js', 'error event');
  const errsave = L.saveLog('Save error to EVENTS_LOG', 1320, 160);
  L.connect(valid, errlog, 1); L.chain(errlog, errsave);

  const readLeads = L.sheet('Read LEADS', 1100, 340, 'LEADS', 'read', 'For the duplicate check', { alwaysOutputData: true });
  const dup = L.codeNode('Check duplicate', 1320, 340, 'check-duplicate.js', 'Same email, any case');
  const isDup = L.ifNode('Is duplicate?', 1540, 340, L.isTrue('is_duplicate'), 'true = already on list');
  L.connect(valid, readLeads, 0); L.chain(readLeads, dup, isDup);

  const duplog = L.codeNode('Build duplicate log', 1760, 220, 'build-duplicate-log.js', 'lead_duplicate event');
  const dupsave = L.saveLog('Save duplicate to EVENTS_LOG', 1980, 220);
  L.connect(isDup, duplog, 0); L.chain(duplog, dupsave);

  const score = L.codeNode('Score lead', 1760, 400, 'score-lead.js', 'Rules of SPEC 7.3');
  const gate = L.add('Demo safety gate', 'n8n-nodes-base.code', 2, 1980, 400, { jsCode: code(3, 'shared/gate.js') }, { notes: 'Sets email_allowed', notesInFlow: true });
  const row = L.codeNode('Build lead row', 2200, 400, 'build-lead-row.js', 'Exactly the 28 columns');
  const saveLead = L.sheet('Save to LEADS', 2420, 400, 'LEADS', 'append', 'Appends one row');
  const logs = L.codeNode('Build log events', 2640, 400, 'build-log-events.js', 'lead_captured (+ blocked)');
  const saveLog = L.saveLog('Save to EVENTS_LOG', 2860, 400);
  const alert = L.codeNode('Build hot alert', 3080, 400, 'build-hot-alert.js', 'Hot leads only');
  const tg = L.telegram('Alert owner on Telegram', 3300, 400, 'To TELEGRAM_OWNER_CHAT_ID', 'continueRegularOutput');
  const alog = L.codeNode('Build hot alert log', 3520, 400, 'build-hot-alert-log.js', 'hot_alert_sent or error');
  const asave = L.saveLog('Save alert to EVENTS_LOG', 3740, 400);
  L.connect(isDup, score, 1);
  L.chain(score, gate, row, saveLead, logs, saveLog, alert, tg, alog, asave);
  return L.export('Kaya Jewels demo · Lane 3 · Lead engine');
}

writeFileSync(join(ROOT, 'lanes/lane-2-publisher.json'), JSON.stringify(buildLane2(), null, 2) + '\n');
writeFileSync(join(ROOT, 'lanes/lane-3-lead-engine.json'), JSON.stringify(buildLane3(), null, 2) + '\n');
console.log('wrote lanes/lane-2-publisher.json and lanes/lane-3-lead-engine.json');
