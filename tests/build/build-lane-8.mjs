import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lane, root } from './lib.mjs';

const L = new Lane(8, 'Report', 'report', 7);
const REQUIRED = ['DEMO_MODE', 'DEMO_MINUTES_PER_DAY', 'REPORT_TIME', 'DEMO_REPORT_EVERY_MINUTES', 'TELEGRAM_OWNER_CHAT_ID', 'SHEET_URL', 'BRAND_VOICE', 'GEMINI_MODEL', 'GROQ_MODEL', 'AI_TEMPERATURE'];

L.frame(
  '## 📊 Lane 8 · Report  ·  trigger: every 5 minutes (cron `50 */5 * * * *`)\n' +
  '**What it does:** wakes up every 5 minutes, reads the EVENTS_LOG and decides in code whether a report is DUE (demo mode: every `DEMO_REPORT_EVERY_MINUTES`; real mode: once a day after `REPORT_TIME`). If not due it ends quietly. If due it reads CONTENT, LEADS and PROSPECTS, computes every metric of SPEC 2.8, writes them to **DASHBOARD**, asks Gemini (fallback Groq) for 3 insights based ONLY on those numbers, and sends the owner a Telegram report.\n' +
  '**Tabs:** reads SETTINGS, EVENTS_LOG, CONTENT, LEADS, PROSPECTS · writes DASHBOARD (`metric_key, value, updated_at` only) and EVENTS_LOG.\n' +
  '**Credentials:** Kaya Demo · Google Sheets, Gemini, Groq, Telegram Bot.  **Docs:** SPEC.md §7.8 and §2.8 · docs/lane-8.md explains every node.', 5200);
L.sticky('How the AI step works', '### Optional AI insights\nOnly the computed metrics are sent. A reply is accepted only if it has 3 insights and **every number in it is one of the metrics**; otherwise Gemini → Groq fallback, and if both fail the report goes out without insights (logged as `ai_failed`).', 1900, 900, 1500, 90, 7);

const trigger = L.schedule('Every 5 minutes', '50 */5 * * * *', 0, 400);
const readSettings = L.read('SETTINGS', 220, 400);
const settings = L.code('Settings to object', 'settings.js', 440, 400, { note: 'Rows → one settings item', subst: { REQUIRED_LIST: JSON.stringify(REQUIRED) } });
const readEvents = L.read('EVENTS_LOG', 660, 400, { note: 'To find the last report' });
const dueCheck = L.code('Check if report is due', 'l8-due.js', 880, 400, { note: 'Is a report due now?' });
const isDue = L.ifBool('Report due?', 'due', 1100, 400, 'false = quiet end');
const readContent = L.read('CONTENT', 1320, 400);
const readLeads = L.read('LEADS', 1540, 400);
const readProspects = L.read('PROSPECTS', 1760, 400);
const metrics = L.code('Compute metrics', 'l8-metrics.js', 1980, 400, { note: 'All metrics of SPEC 2.8' });
const rows = L.code('Prepare dashboard rows', 'l8-dashboard-rows.js', 2200, 400, { note: 'Key, value, updated_at' });
const dash = L.appendOrUpdate('DASHBOARD', 'metric_key', 'Save to DASHBOARD', 2420, 400, 'Append or update by metric_key');
const one = L.code('Back to one item', 'l8-one-item.js', 2640, 400, { note: 'Many rows → one item' });
const buildAi = L.code('Build AI request', 'l8-build-ai.js', 2860, 400, { note: 'Metrics only' });
const gemini = L.http('Ask Gemini', 'gemini', 3080, 400);
const readGemini = L.code('Read Gemini reply', 'l8-read-gemini.js', 3300, 400);
const check = L.code('Check AI answer', 'l8-check-ai.js', 3520, 400, { note: 'JSON + no invented numbers' });
const needGroq = L.ifBool('Need Groq fallback?', 'try_groq', 3740, 400, 'true = Gemini failed');
const groq = L.http('Ask Groq (fallback)', 'groq', 3960, 560);
const readGroq = L.code('Read Groq reply', 'l8-read-groq.js', 4180, 560);
const message = L.code('Build report message', 'l8-message.js', 3960, 260 + 140, { note: 'Numbers + insights' });
const send = L.telegram('Send report', 4180, 400, { note: 'To TELEGRAM_OWNER_CHAT_ID', failureOutput: true });
const logs = L.code('Build log events', 'l8-logs.js', 4400, 400, { note: 'One row per action' });
const save = L.append('EVENTS_LOG', 'Save to EVENTS_LOG', 4620, 400);

L.chain(trigger, readSettings, settings, readEvents, dueCheck, isDue);
L.link(isDue, readContent, 0);
L.chain(readContent, readLeads, readProspects, metrics, rows, dash, one, buildAi, gemini, readGemini, check, needGroq);
L.link(needGroq, groq, 0); L.link(needGroq, message, 1);
L.chain(groq, readGroq, check);
L.link(message, send);
L.link(send, logs, 0); L.link(send, logs, 1);
L.chain(logs, save);

writeFileSync(join(root, 'lanes', 'lane-8-report.json'), JSON.stringify(L.build('Kaya Jewels demo · Lane 8 · Report'), null, 2) + '\n');
console.log('wrote lane 8:', L.nodes.length, 'nodes');
