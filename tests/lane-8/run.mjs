// Lane 8 end-to-end tests inside a real n8n server. Usage: node tests/lane-8/run.mjs [vm|legacy]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Mock } from '../lib/mock.mjs';
import { makeTestCopy } from '../lib/testcopy.mjs';
import { startN8n } from '../lib/n8n.mjs';
import { Suite } from '../lib/runner.mjs';
import { loadTemplate } from '../lib/csv.mjs';
import { ist } from '../lib/helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const engine = process.argv[2] || 'vm';
const mock = new Mock(); const port = await mock.listen();
const wf = makeTestCopy(join(here, '..', '..', 'lanes', 'lane-8-report.json'), { mockPort: port, webhookPath: 'run-lane8' });
const n8n = await startN8n({ workflows: [wf], engine, log: console.log });
const T = new Suite('Lane 8');

const KEYS = loadTemplate('DASHBOARD').map((r) => r.metric_key);
const run = () => n8n.run('run-lane8');
const evs = (t) => mock.events(t);
const dash = (key) => mock.find('DASHBOARD', key)?.value;
const ev = (o) => ({ event_id: `EV-X-${Math.random().toString(36).slice(2, 8)}`, ts: ist(0), lane: '1', event_type: 'error', entity_type: 'system', entity_id: '', status_from: '', status_to: '', channel: 'sheet', detail: '', meta_json: '{}', execution_id: 'sample', demo_mode: 'TRUE', ...o });   // 'sample' = fixture, not counted as something this run logged

const geminiReply = (obj) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }, finishReason: 'STOP' }] } });
const groqReply = (obj) => ({ status: 200, body: { choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) }, finish_reason: 'stop' }] } });
const FAIL = { status: 500, body: { error: { message: 'AI is down (mock)' } } };
const GOOD = { insights: ['Content is moving: 1 item waits for approval.', 'Waitlist leads keep arriving.', 'Approve the pending content so it can be published.'] };
const fresh = (settings = {}) => {
  mock.reset();
  mock.setting('DEMO_MODE', 'TRUE');
  for (const [k, v] of Object.entries(settings)) mock.setting(k, v);
  mock.aiScript = () => FAIL;
};
const lastReport = (min) => mock.tabs.EVENTS_LOG.push(ev({ event_type: 'report_sent', entity_type: 'report', lane: '8', channel: 'telegram_owner', ts: ist(-min) }));

try {
await T.scenario('Not due (demo mode, last report 3 min ago, every 10): quiet end, nothing written', async () => {
  fresh(); lastReport(3);
  const r = await run();
  T.eq('run finishes OK', r.status, 200);
  T.eq('no Telegram, no AI, no DASHBOARD write, no log row', [mock.posts.length, mock.ai.length, mock.writes.filter((w) => w.tab === 'DASHBOARD').length, evs().length], [0, 0, 0, 0]);
  T.check('CONTENT/LEADS/PROSPECTS were not even read', !mock.reads.some((t) => ['CONTENT', 'LEADS', 'PROSPECTS'].includes(t)), mock.reads.join(','));
});

await T.scenario('First ever report (no report_sent), demo mode: every metric_key gets a value and the Telegram report arrives', async () => {
  fresh(); mock.aiScript = (p) => (p === 'gemini' ? geminiReply(GOOD) : FAIL);
  const r = await run();
  T.eq('run OK', r.status, 200);
  T.eq('all 30 metric keys have a value', KEYS.filter((k) => String(dash(k) ?? '') === '' ), []);
  T.check('updated_at set on every row', KEYS.every((k) => mock.find('DASHBOARD', k).updated_at !== ''));
  T.check('only metric_key, value, updated_at were written', mock.writes.filter((w) => w.tab === 'DASHBOARD').every((w) => Object.keys(w.row).sort().join() === 'metric_key,updated_at,value'));
  T.eq('label/unit/section/notes untouched', [mock.find('DASHBOARD', 'leads_total').label, mock.find('DASHBOARD', 'leads_total').unit, mock.find('DASHBOARD', 'leads_total').section], ['Waitlist leads', 'count', 'leads']);
  T.eq('one Telegram message to the owner', [mock.posts.length, mock.posts[0]?.chat_id], [1, '000000000']);
  const t = mock.posts[0].text;
  T.check('report title', t.startsWith('📊 <b>Kaya Jewels · campaign report</b>'), t.slice(0, 80));
  T.check('period says all time (first report)', /all time \(first report\)/.test(t));
  T.check('sections present', /Content<\/b>/.test(t) && /Leads<\/b>/.test(t) && /Emails<\/b>/.test(t) && /Outreach<\/b>/.test(t) && /reply rate/.test(t) && /fallbacks/.test(t) && /Errors<\/b>/.test(t));
  T.check('insights present', t.includes('• Content is moving: 1 item waits for approval.'));
  T.check('sheet link present', /docs\.google\.com\/spreadsheets\/d\/__KAYA_SHEET_ID__\/edit/.test(t));
  T.eq('events: dashboard_updated + ai_call + report_sent', evs().map((e) => e.event_type), ['dashboard_updated', 'ai_call', 'report_sent']);
  T.eq('dashboard_updated meta.metrics = 30', JSON.parse(evs('dashboard_updated')[0].meta_json).metrics, 30);
  T.eq('report_sent meta.period_start blank on first report', JSON.parse(evs('report_sent')[0].meta_json).period_start, '');
  T.check('last_report_at is a timestamp', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+05:30$/.test(dash('last_report_at')), dash('last_report_at'));
  const r2 = await run();
  T.eq('second run right away: not due (no 2nd report)', [mock.posts.length, evs('report_sent').length], [1, 1]);
});

await T.scenario('Full sample data: metrics match an independent hand count of the CSVs', async () => {
  fresh();
  await run();
  const leads = loadTemplate('LEADS'); const prospects = loadTemplate('PROSPECTS'); const content = loadTemplate('CONTENT'); const events = loadTemplate('EVENTS_LOG');
  const cnt = (rows, f) => rows.filter(f).length;
  const avg = (rows, f) => Math.round(rows.reduce((s, r) => s + Number(r[f]), 0) / rows.length);
  const contacted = cnt(prospects, (p) => Number(p.seq_step) >= 1);
  const replied = cnt(prospects, (p) => ['replied', 'interested', 'not_interested', 'do_not_contact', 'won', 'lost'].includes(p.status));
  const expected = {
    content_total: content.length, content_published: cnt(content, (c) => c.status === 'published'), content_avg_seo_score: avg(content, 'seo_score'),
    leads_total: leads.length, leads_hot: cnt(leads, (l) => l.segment === 'hot' || l.status === 'hot'), leads_warm: cnt(leads, (l) => l.segment === 'warm'), leads_cold: cnt(leads, (l) => l.segment === 'cold'),
    leads_avg_score: avg(leads, 'score'), leads_unsubscribed: cnt(leads, (l) => l.status === 'unsubscribed'), leads_blocked: cnt(leads, (l) => l.status === 'blocked'),
    leads_new_period: cnt(events, (e) => e.event_type === 'lead_captured'),
    emails_sent_total: cnt(events, (e) => e.event_type === 'email_sent'), emails_blocked_total: cnt(events, (e) => e.event_type === 'email_blocked'),
    launch_emails_sent: cnt(events, (e) => e.event_type === 'email_sent' && e.lane === '5'),
    prospects_total: prospects.length, prospects_contacted: contacted, prospects_replied: replied,
    prospects_interested: cnt(prospects, (p) => ['interested', 'won'].includes(p.status)),
    outreach_reply_rate_pct: contacted ? Math.round(replied / contacted * 1000) / 10 : 0,
    replies_total: cnt(events, (e) => e.event_type === 'reply_received'), hot_alerts_total: cnt(events, (e) => e.event_type === 'hot_alert_sent'),
    channel_posts_total: cnt(events, (e) => e.event_type === 'content_published' && e.channel === 'telegram_channel') + cnt(events, (e) => e.event_type === 'launch_post_published'),
    ai_calls_total: cnt(events, (e) => e.event_type === 'ai_call'), ai_fallbacks_total: cnt(events, (e) => e.event_type === 'ai_fallback'), ai_failures_total: cnt(events, (e) => e.event_type === 'ai_failed'),
    errors_period: cnt(events, (e) => e.event_type === 'error'),
  };
  for (const [k, v] of Object.entries(expected)) T.eq(`${k} = ${v}`, Number(dash(k)), v);
  console.log('    (sample: leads', leads.length, 'prospects', prospects.length, 'contacted', contacted, 'replied', replied, ')');
  // a few by hand, written out literally so a wrong CSV reading cannot hide a wrong lane
  T.eq('hand check: 15 sample leads', Number(dash('leads_total')), 15);
  T.eq('hand check: 12 sample prospects', Number(dash('prospects_total')), 12);
  T.eq('hand check: 2 sample content rows', Number(dash('content_total')), 2);
});

await T.scenario('Period handling: with an earlier report, "period" metrics only count events after it', async () => {
  fresh();
  mock.tabs.EVENTS_LOG = [];
  lastReport(30);
  mock.tabs.EVENTS_LOG.push(ev({ event_type: 'lead_captured', ts: ist(-40) }), ev({ event_type: 'email_sent', ts: ist(-40) }), ev({ event_type: 'error', ts: ist(-40) }));
  mock.tabs.EVENTS_LOG.push(ev({ event_type: 'lead_captured', ts: ist(-5) }), ev({ event_type: 'lead_captured', ts: ist(-4) }), ev({ event_type: 'email_sent', ts: ist(-5), lane: '5' }), ev({ event_type: 'error', ts: ist(-3) }), ev({ event_type: 'error', ts: ist(-2) }), ev({ event_type: 'error', ts: ist(-1) }));
  await run();
  T.eq('leads_new_period 2 (all-time would be 3)', Number(dash('leads_new_period')), 2);
  T.eq('emails_sent_period 1, total 2', [Number(dash('emails_sent_period')), Number(dash('emails_sent_total'))], [1, 2]);
  T.eq('errors_period 3', Number(dash('errors_period')), 3);
  T.eq('launch_emails_sent 1', Number(dash('launch_emails_sent')), 1);
  T.check('period text says "since"', /Period: since /.test(mock.posts[0]?.text || ''), mock.posts[0]?.text?.slice(0, 120));
  T.check('report_sent meta.period_start = previous report', JSON.parse(evs('report_sent')[0].meta_json).period_start.length === 25);
});

await T.scenario('Due in demo mode: last report older than DEMO_REPORT_EVERY_MINUTES (12 > 10)', async () => {
  fresh(); lastReport(12);
  await run();
  T.eq('report sent', mock.posts.length, 1);
  fresh({ DEMO_REPORT_EVERY_MINUTES: 20 }); lastReport(12);
  await run();
  T.eq('setting changes apply without editing the workflow: 12 < 20 -> not due', mock.posts.length, 0);
});

await T.scenario('Real mode: due after REPORT_TIME when none sent today; not due before REPORT_TIME; not due twice a day', async () => {
  fresh({ DEMO_MODE: 'FALSE', REPORT_TIME: '00:00' });
  await run();
  T.eq('due (no report yet, REPORT_TIME already passed today)', mock.posts.length, 1);
  await run();
  T.eq('a second run the same day does not send again', mock.posts.length, 1);
  fresh({ DEMO_MODE: 'FALSE', REPORT_TIME: '23:59' });
  await run();
  T.eq('before REPORT_TIME: quiet end', [mock.posts.length, evs().length], [0, 0]);
  fresh({ DEMO_MODE: 'FALSE', REPORT_TIME: '00:00' }); mock.tabs.EVENTS_LOG.push(ev({ event_type: 'report_sent', ts: ist(-24 * 60) }));
  await run();
  T.eq('yesterday’s report -> a new one is due today', mock.posts.length, 1);
  T.eq('real mode logged demo_mode FALSE', evs('report_sent')[0].demo_mode, 'FALSE');
});

await T.scenario('Empty tabs: all zeros, no division by zero, outreach_reply_rate_pct = 0', async () => {
  fresh();
  mock.tabs.CONTENT = []; mock.tabs.LEADS = []; mock.tabs.PROSPECTS = []; mock.tabs.EVENTS_LOG = [];
  const r = await run();
  T.eq('run OK', r.status, 200);
  const nonZero = KEYS.filter((k) => k !== 'last_report_at' && !(['content_total'].includes(k) && false) && Number(dash(k)) !== 0 && !['dashboard_updated'].includes(k));
  T.eq('every numeric metric is 0', nonZero, []);
  T.eq('reply rate is 0 (not NaN)', dash('outreach_reply_rate_pct'), '0');
  T.eq('report still sent', mock.posts.length, 1);
  T.check('no NaN/Infinity in the message', !/NaN|Infinity|undefined/.test(mock.posts[0].text), mock.posts[0].text);
});

await T.scenario('Both AI providers fail: dashboard + numbers are still sent (no insights), ai_failed logged', async () => {
  fresh(); // aiScript default = both fail
  await run();
  T.eq('report sent', mock.posts.length, 1);
  T.check('no insights block', !/Insights/.test(mock.posts[0].text));
  T.check('numbers are there', /Leads<\/b>: 15 total/.test(mock.posts[0].text), mock.posts[0].text);
  T.eq('events', evs().map((e) => e.event_type), ['dashboard_updated', 'ai_call', 'ai_fallback', 'ai_failed', 'report_sent']);
  T.eq('AI was tried on both providers', [...new Set(mock.ai.map((a) => a.provider))].sort(), ['gemini', 'groq']);
});

await T.scenario('Gemini fails, Groq answers: insights used, ai_fallback logged with the reason', async () => {
  fresh(); mock.aiScript = (p) => (p === 'groq' ? groqReply(GOOD) : FAIL);
  await run();
  T.check('insights from Groq present', /• Waitlist leads keep arriving\./.test(mock.posts[0].text));
  const fb = evs('ai_fallback');
  T.eq('fallback logged once with reason', [fb.length, /Gemini call failed/.test(JSON.parse(fb[0].meta_json).reason)], [1, true]);
  T.eq('ai_call provider groq', JSON.parse(evs('ai_call')[0].meta_json).provider, 'groq');
  T.eq('no ai_failed', evs('ai_failed').length, 0);
});

await T.scenario('AI answer containing an invented number is rejected (Gemini -> Groq); if Groq invents too, report goes out without insights', async () => {
  fresh();
  mock.aiScript = (p) => (p === 'gemini' ? geminiReply({ insights: ['Leads grew 250% this week.', 'Emails are working.', 'Send more.'] }) : groqReply(GOOD));
  await run();
  T.check('Gemini’s invented 250% is not in the report', !/250/.test(mock.posts[0].text));
  T.check('Groq’s clean answer was used', /Waitlist leads keep arriving/.test(mock.posts[0].text));
  T.check('fallback reason mentions the number', /not in the metrics: 250/.test(JSON.parse(evs('ai_fallback')[0].meta_json).reason), evs('ai_fallback')[0]?.detail);
  fresh();
  mock.aiScript = () => geminiReply({ insights: ['You have 999 leads.', 'ok', 'ok'] });
  mock.aiScript = (p) => (p === 'gemini' ? geminiReply({ insights: ['You have 999 leads.', 'a', 'b'] }) : groqReply({ insights: ['Revenue is up 40 percent.', 'a', 'b'] }));
  await run();
  T.check('no invented number reaches the owner', !/999|40 percent/.test(mock.posts[0].text));
  T.check('no insights block', !/Insights/.test(mock.posts[0].text));
  T.eq('ai_failed logged', evs('ai_failed').length, 1);
  // numbers that ARE in the metrics are fine, including decimals
  fresh(); mock.aiScript = (p) => (p === 'gemini' ? geminiReply({ insights: ['There are 15 leads and 12 prospects.', `Reply rate is ${dash('outreach_reply_rate_pct')} percent.`, 'Follow up.'] }) : FAIL);
  await run();
  T.check('numbers taken from the metrics are accepted', /15 leads and 12 prospects/.test(mock.posts[0].text) && evs('ai_fallback').length === 0, mock.posts[0]?.text);
});

await T.scenario('AI answers that are not valid JSON / have too few insights count as failures; markdown fences are tolerated', async () => {
  fresh(); mock.aiScript = (p) => (p === 'gemini' ? geminiReply('here are some insights!') : groqReply({ insights: ['only one'] }));
  await run();
  T.check('report sent without insights', mock.posts.length === 1 && !/Insights/.test(mock.posts[0].text));
  T.eq('ai_failed', evs('ai_failed').length, 1);
  fresh(); mock.aiScript = (p) => (p === 'gemini' ? geminiReply('```json\n' + JSON.stringify(GOOD) + '\n```') : FAIL);
  await run();
  T.check('fenced JSON accepted', /Content is moving/.test(mock.posts[0].text));
});

await T.scenario('AI request carries ONLY the metrics (no leads, no emails, no sheet text) and the right provider settings', async () => {
  fresh(); mock.aiScript = (p) => (p === 'gemini' ? geminiReply(GOOD) : FAIL);
  await run();
  const g = mock.ai.find((a) => a.provider === 'gemini').body;
  const prompt = g.contents[0].parts[0].text;
  T.check('prompt is the metrics JSON', /^METRICS \(JSON, all time \(first report\)\):\n\{/.test(prompt), prompt.slice(0, 80));
  const json = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
  T.eq('29 metrics (everything except the timestamp)', Object.keys(json).length, 29);
  T.check('no email addresses or names leak into the prompt', !/@|Ananya|Priya|Kaya Jewels\.|kayademo/.test(prompt), prompt.slice(0, 200));
  T.check('JSON mode + schema + thinking budget', g.generationConfig.responseMimeType === 'application/json' && g.generationConfig.responseSchema.required[0] === 'insights' && g.generationConfig.thinkingConfig.thinkingBudget === 1024);
  T.check('brand voice and number rule in the system prompt', /Warm, festive/.test(g.systemInstruction.parts[0].text) && /Mention only numbers/.test(g.systemInstruction.parts[0].text));
});

await T.scenario('Telegram failing: DASHBOARD is still written, error logged, no report_sent, so the next run tries again', async () => {
  fresh(); mock.aiScript = (p) => (p === 'gemini' ? geminiReply(GOOD) : FAIL);
  mock.failNext('telegram', 3);
  const r = await run();
  T.eq('run finished', r.status, 200);
  T.eq('dashboard written', KEYS.filter((k) => String(dash(k) ?? '') === ''), []);
  T.eq('no message delivered', mock.posts.length, 0);
  T.eq('error logged, no report_sent', [evs('error').length, evs('report_sent').length], [1, 0]);
  T.check('error detail says the dashboard was still updated', /dashboard was still updated/.test(evs('error')[0].detail), evs('error')[0].detail);
  T.eq('dashboard_updated logged', evs('dashboard_updated').length, 1);
  await run();
  T.eq('next run (still due) delivers the report', [mock.posts.length, evs('report_sent').length], [1, 1]);
});

await T.scenario('A node failing mid-run (DASHBOARD write fails): run errors, nothing sent, next run recovers', async () => {
  fresh(); mock.aiScript = (p) => (p === 'gemini' ? geminiReply(GOOD) : FAIL);
  mock.failNext('sheets:DASHBOARD:appendOrUpdate', 500);   // the 30 rows are sent in parallel, so fail them all
  const r = await run();
  T.check('run reports an error', r.status === 500, `status ${r.status}`);
  T.eq('nothing sent, no AI spent', [mock.posts.length, mock.ai.length, evs().length], [0, 0, 0]);
  mock.fail = {};
  await run();
  T.eq('recovered', [mock.posts.length, evs('report_sent').length], [1, 1]);
});

await T.scenario('SETTINGS missing a key: clear error, nothing happens', async () => {
  fresh(); mock.tabs.SETTINGS = mock.tabs.SETTINGS.filter((r) => r.key !== 'TELEGRAM_OWNER_CHAT_ID');
  const r = await run();
  T.check('run errors', r.status === 500, `status ${r.status}`);
  T.eq('nothing sent', mock.posts.length, 0);
  T.check('stored error names the key', /missing a value for: TELEGRAM_OWNER_CHAT_ID/.test(await n8n.lastExecutionText()));
});

await T.scenario('Text from sheets/AI is HTML-escaped in the Telegram message', async () => {
  fresh(); mock.aiScript = (p) => (p === 'gemini' ? geminiReply({ insights: ['Use <b>bold</b> & more', 'fine', 'fine'] }) : FAIL);
  await run();
  T.check('escaped', mock.posts[0].text.includes('• Use &lt;b&gt;bold&lt;/b&gt; &amp; more'), mock.posts[0].text);
});

await T.scenario('Sheets returning numbers/booleans instead of text still works', async () => {
  fresh(); mock.typed = true;
  await run();
  T.eq('report sent, leads_total 15', [mock.posts.length, Number(dash('leads_total'))], [1, 15]);
  mock.typed = false;
});
} finally {
  const md = T.markdown(engine);
  writeFileSync(join(here, `results-${engine}.md`), md + '\n');
  console.log(`\n${md}`);
  await n8n.stop(); await mock.close();
}
process.exit(T.failed ? 1 : 0);
