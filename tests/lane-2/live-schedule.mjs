// Keeps the REAL Schedule Trigger (cron "0 * * * * *") and checks, in a live n8n server, that an approved + due row is
// published within a minute and exactly once while the schedule keeps firing. Sheets/Telegram/Gmail are the usual mock.
import { readFileSync, writeFileSync } from 'node:fs';
import { Mock } from '../common/mock-server.mjs';
import { toTestCopy, N8n, Results } from '../common/harness.mjs';

const engine = process.argv[2] === 'legacy' ? 'legacy' : 'vm';
const lane = JSON.parse(readFileSync(new URL('../../lanes/lane-2-publisher.json', import.meta.url), 'utf8'));
const mock = await new Mock().start();
const results = new Results(`Lane 2 live schedule (${engine})`);
const n8n = new N8n({ engine, label: 'lane2live' });
n8n.activate(n8n.importWorkflow(toTestCopy(lane, { mockUrl: mock.url, name: 'Lane 2 live schedule' })));      // no webhookPath: the Schedule Trigger stays
mock.settings();
const stamp = (ms) => new Date(ms + 5.5 * 3600000).toISOString().replace(/\.\d+Z$/, '+05:30');
mock.setRows('CONTENT', [{ content_id: 'CNT-LIVE-01', asset_type: 'ig_caption', channel: 'instagram', title: 't', body: 'Live schedule caption', hashtags: '#KayaJewels', scheduled_for: stamp(Date.now() - 60000), status: 'approved' }]);
await n8n.start();
const startedAt = Date.now();
results.begin('Real cron trigger every minute');
while (mock.messages.length === 0 && Date.now() - startedAt < 90000) await new Promise((r) => setTimeout(r, 500));
const secondsToPost = Math.round((Date.now() - startedAt) / 1000);
results.check(mock.messages.length === 1, `the row appeared in the channel ${secondsToPost} s after the server started (within the first minute)`);
await new Promise((r) => setTimeout(r, 135000));                               // let two more scheduled runs go by
const executions = n8n.executions();
results.check(executions.length >= 3 && executions.every((e) => e.status === 'success'), `${executions.length} scheduled executions, all successful`);
results.check(mock.messages.length === 1 && mock.rows('EVENTS_LOG').filter((e) => e.event_type === 'content_published').length === 1, 'still exactly ONE message and ONE content_published event');
results.check(mock.rows('CONTENT')[0].status === 'published', 'row is published');
await n8n.stop(); await mock.stop();
writeFileSync(new URL(`./live-${engine}.json`, import.meta.url), JSON.stringify(results.items, null, 2));
console.log(`\n${results.summary()}`);
process.exit(results.failed.length ? 1 : 0);
