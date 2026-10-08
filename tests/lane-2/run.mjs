// Lane 2 end-to-end test inside a real n8n 1.123.84 server.
//   KAYA_SCRATCH=<scratch folder with n8n installed> node tests/lane-2/run.mjs [vm|legacy]
// The Schedule Trigger is swapped for a Webhook (so a test can start a run on demand and wait for it to finish);
// Google Sheets, Gmail and Telegram are replaced by HTTP Request nodes talking to tests/common/mock-server.mjs.
// Everything else (Code, Switch, IF, Loop, Wait nodes, their settings and connections) is the committed lane.
import { readFileSync, writeFileSync } from 'node:fs';
import { Mock } from '../common/mock-server.mjs';
import { toTestCopy, N8n, Results } from '../common/harness.mjs';

const engine = process.argv[2] === 'legacy' ? 'legacy' : 'vm';
const lane = JSON.parse(readFileSync(new URL('../../lanes/lane-2-publisher.json', import.meta.url), 'utf8'));
const mock = await new Mock().start();
const n8n = new N8n({ engine, label: 'lane2' });
const results = new Results(`Lane 2 (${engine} expression engine)`);
const id = n8n.importWorkflow(toTestCopy(lane, { mockUrl: mock.url, name: 'Lane 2 test copy', webhookPath: 'lane2-test' }));
n8n.activate(id);
await n8n.start();

// ---------- helpers
const stamp = (ms) => new Date(ms + 5.5 * 3600000).toISOString().replace(/\.\d+Z$/, '+05:30');
const T = (minutes) => stamp(Date.now() + minutes * 60000);
const CHANNEL = '@kayajewels_demo', OWNER = '555000111';
const WAITLIST = '👉 Join the waitlist: http://localhost:5678/form/kaya-waitlist';
let seq = 0;
const content = (o = {}) => {
  seq++;
  return {
    content_id: `CNT-20261008-143205-${String(seq).padStart(2, '0')}`, batch_id: 'B-20261008-143205', created_at: T(-600), asset_type: 'ig_caption', channel: 'instagram',
    title: 'Something is glowing', body: 'Our artisans are finishing the Roshni Edit.', hashtags: '#KayaJewels #RoshniEdit', cta: 'Join the waitlist', media_notes: 'Close-up of hands',
    seo_score: 100, issues: '', scheduled_for: T(-5), status: 'approved', ai_provider: 'gemini', updated_at: T(-600), ...o,
  };
};
const lead = (n, o = {}) => ({
  lead_id: `LD-20261001-L${String(n).padStart(3, '0')}`, created_at: T(-5000), source: 'sample_data', first_name: `Lead${n}`, email: `kayademo.customers+l${n}@gmail.com`, city: 'Pune',
  consent: 'TRUE', email_allowed: 'TRUE', score: 50, segment: 'warm', status: 'nurturing', sequence_id: 'WAITLIST_NURTURE', seq_step: 2, launch_step: 0, updated_at: T(-5000), ...o,
});
const NEWSLETTER = { asset_type: 'newsletter', channel: 'email', title: 'A first look, {{first_name}}', body: '<p>Hi {{first_name}},</p><p>The Roshni Edit is almost here.</p><p>{{unsubscribe_line}}</p>', hashtags: '', meta_description: 'Preview text' };

function fresh(settingsOverrides = {}, contentRows = [], leadRows = []) {
  mock.reset(); mock.settings(settingsOverrides); mock.setRows('CONTENT', contentRows); mock.setRows('LEADS', leadRows);
}
async function run(times = 1) {
  for (let i = 0; i < times; i++) {
    const res = await fetch(`${n8n.base}/webhook/lane2-test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    await res.text();
    await mock.idle(400);
  }
}
const C = (cid) => mock.rows('CONTENT').find((r) => r.content_id === cid) ?? {};
const L = (lid) => mock.rows('LEADS').find((r) => r.lead_id === lid) ?? {};
const events = (type) => mock.rows('EVENTS_LOG').filter((e) => !type || e.event_type === type);
const meta = (e) => JSON.parse(e.meta_json);
const isStamp = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/.test(String(v));
const recent = (v) => Math.abs(Date.now() - new Date(String(v)).getTime()) < 90000;
const allowedCols = {
  CONTENT: ['content_id', 'status', 'published_at', 'publish_ref', 'last_error', 'updated_at'],
  LEADS: ['lead_id', 'last_newsletter_id', 'last_contacted_at', 'thread_ids', 'updated_at', 'status', 'email_allowed'],
};
function sheetRulesRespected() {
  const bad = mock.writes.filter((w) => w.op === 'update' && !w.columns.every((c) => allowedCols[w.tab]?.includes(c)));
  results.check(mock.violations.length === 0 && bad.length === 0 && mock.writes.every((w) => w.tab === 'EVENTS_LOG' || w.op === 'update'),
    `Sheets rules: only owned columns are written, no new columns, CONTENT/LEADS only updated${mock.violations.length ? ` | ${mock.violations.join(' | ')}` : ''}${bad.length ? ` | ${JSON.stringify(bad[0])}` : ''}`);
}
const lastExecution = () => n8n.executions().at(-1);

try {
  // ------------------------------------------------------------------ 1
  results.begin('Done-when: an approved row whose scheduled_for has passed appears in the channel within a minute, exactly once');
  let cap = content({ body: 'Our artisans & friends <love> this.' });
  fresh({}, [cap]);
  await run();
  results.check(mock.messages.length === 1 && mock.messages[0].chat_id === CHANNEL, `one message, to the channel (${mock.messages.length})`);
  results.check(mock.messages[0]?.text === `Our artisans &amp; friends &lt;love&gt; this.\n\n#KayaJewels #RoshniEdit\n\n${WAITLIST}`, `text = escaped body + blank line + hashtags + blank line + waitlist link`);
  results.check(mock.messages[0]?.parse_mode === 'HTML', 'sent with parse_mode HTML');
  let row = C(cap.content_id);
  results.check(row.status === 'published' && isStamp(row.published_at) && recent(row.published_at) && row.publish_ref === `tg:${mock.messages[0].message_id}` && row.last_error === '' && isStamp(row.updated_at), `row published: ${row.status} ${row.publish_ref} ${row.published_at}`);
  results.check(events().length === 1 && events('content_published').length === 1, `exactly one event: content_published (${events().map((e) => e.event_type)})`);
  let ev = events('content_published')[0] ?? {};
  results.check(ev.entity_type === 'content' && ev.entity_id === cap.content_id && ev.channel === 'telegram_channel' && ev.status_from === 'approved' && ev.status_to === 'published' && ev.lane === '2' || ev.lane === 2, 'event fields: entity, channel telegram_channel, approved → published, lane 2');
  results.check(meta(ev).publish_ref === row.publish_ref && ev.demo_mode === 'TRUE' && /^EV-\d{17}-[A-Z0-9]{4}$/.test(ev.event_id), 'meta_json.publish_ref, demo_mode TRUE, event id format');
  results.check(mock.requests.filter((q) => q === 'GET /sheets/LEADS').length === 0, 'LEADS not even read when no newsletter is due');
  sheetRulesRespected();
  await run();
  await run();
  results.check(mock.messages.length === 1 && events().length === 1, `two more runs: still ONE message and ONE event (${mock.messages.length}/${events().length})`);
  results.check(lastExecution()?.status === 'success', 'run status success');

  // ------------------------------------------------------------------ 2
  results.begin('Rows that must be left alone: not yet due, pending_approval, needs_changes, rejected, published, failed');
  fresh({}, [
    content({ scheduled_for: T(30) }), content({ status: 'pending_approval' }), content({ status: 'needs_changes' }),
    content({ status: 'rejected' }), content({ status: 'published', published_at: T(-60), publish_ref: 'tg:1' }), content({ status: 'failed', last_error: 'old' }),
  ]);
  const before = JSON.stringify(mock.rows('CONTENT'));
  await run(2);
  results.check(mock.messages.length === 0 && mock.sent.length === 0, 'nothing sent');
  results.check(JSON.stringify(mock.rows('CONTENT')) === before && mock.writes.length === 0, 'CONTENT untouched, no write at all');
  results.check(events().length === 0, 'no log row (a run that finds nothing ends quietly)');

  // ------------------------------------------------------------------ 3
  results.begin('Each asset type: ig_caption, short_post, blog_article, reel_idea');
  const blog = content({ asset_type: 'blog_article', channel: 'blog', title: 'Handmade & Heritage', body: '# Long Markdown body\n\nNever sent in full.', hashtags: '', meta_description: 'How we make jewellery <by hand> in Jaipur.', slug: 'handmade-jewellery-jaipur', scheduled_for: T(-40) });
  const shortp = content({ asset_type: 'short_post', title: '6 artisans', body: '6 women artisans. 1 Jaipur studio. 🪔', hashtags: '#KayaJewels #RoshniEdit', scheduled_for: T(-30) });
  const reel = content({ asset_type: 'reel_idea', channel: 'reels', title: 'Diya to jhumka', body: 'Watch a jhumka come alive', hashtags: '#KayaJewels #Reels', media_notes: 'Hook: a lit diya\nShots:\n1. Hands\n2. Stones\nAudio: soft flute\nLength: 25 seconds', scheduled_for: T(-20) });
  const cap2 = content({ title: 'cap', body: 'Second caption', scheduled_for: T(-10) });
  fresh({ MAX_POSTS_PER_RUN: 10 }, [cap2, reel, shortp, blog]);
  await run();
  const byText = (needle) => mock.messages.find((m) => m.text.includes(needle));
  results.check(mock.messages.length === 4, `four messages (${mock.messages.length})`);
  const mBlog = byText('New on the Kaya Jewels blog');
  results.check(mBlog?.chat_id === CHANNEL && mBlog.text === `📝 <b>New on the Kaya Jewels blog</b>\n\n<b>Handmade &amp; Heritage</b>\n\nHow we make jewellery &lt;by hand&gt; in Jaipur.\n\nRead: /blog/handmade-jewellery-jaipur (demo)\n\n${WAITLIST}`, `blog teaser to the channel: ${JSON.stringify(mBlog?.text)}`);
  results.check(!mBlog?.text.includes('Long Markdown body'), 'blog teaser does not contain the article body');
  const mReel = byText('Reel brief');
  results.check(mReel?.chat_id === OWNER && mReel.text === '🎬 <b>Reel brief</b>: Diya to jhumka\n\nHook: a lit diya\nShots:\n1. Hands\n2. Stones\nAudio: soft flute\nLength: 25 seconds\n\n<b>Caption</b>\nWatch a jhumka come alive\n\n#KayaJewels #Reels', `reel brief to the OWNER chat: ${JSON.stringify(mReel?.text)}`);
  const mShort = byText('6 women artisans');
  results.check(mShort?.chat_id === CHANNEL && mShort.text === `6 women artisans. 1 Jaipur studio. 🪔\n\n#KayaJewels #RoshniEdit\n\n${WAITLIST}`, 'short post to the channel');
  results.check(byText('Second caption')?.chat_id === CHANNEL, 'caption to the channel');
  results.check([blog, shortp, reel, cap2].every((r) => C(r.content_id).status === 'published' && /^tg:\d+$/.test(C(r.content_id).publish_ref)), 'all four rows published with tg:<id>');
  results.check(events('content_published').length === 4 && events('content_published').find((e) => e.entity_id === reel.content_id).channel === 'telegram_owner' && events('content_published').filter((e) => e.channel === 'telegram_channel').length === 3, 'four content_published events; the reel one says telegram_owner');
  results.check(JSON.stringify(mock.messages.map((m) => m.message_id)) === JSON.stringify(mock.messages.map((m) => m.message_id).slice().sort((a, b) => a - b)) && mock.messages[0].text.includes('New on the Kaya Jewels blog') && mock.messages[3].text.includes('Second caption'), 'posted oldest scheduled_for first');
  sheetRulesRespected();

  // ------------------------------------------------------------------ 4
  results.begin('Rows with missing or invalid fields are skipped and logged (once), other rows still go out');
  const good = content({ body: 'The good one', scheduled_for: T(-3) });
  const emptyBody = content({ body: '   ', scheduled_for: T(-4) });
  const noDate = content({ scheduled_for: '' });
  const badDate = content({ scheduled_for: 'next tuesday-ish' });
  const noSlug = content({ asset_type: 'blog_article', title: 'No slug', slug: '' });
  const weirdType = content({ asset_type: 'story' });
  const badNews = content({ ...NEWSLETTER, body: '<p>Hi {{first_name}} {{brand_name}}</p>' });
  const futureEmpty = content({ body: '', scheduled_for: T(60) });
  fresh({}, [emptyBody, noDate, badDate, noSlug, weirdType, badNews, futureEmpty, good], [lead(1)]);
  await run();
  results.check(mock.messages.length === 1 && mock.messages[0].text.startsWith('The good one'), 'the good row was still published');
  results.check(C(good.content_id).status === 'published', 'good row published');
  for (const [r, expected] of [[emptyBody, 'body is empty'], [noDate, 'scheduled_for is missing'], [badDate, 'scheduled_for "next tuesday-ish" is not a valid timestamp'], [noSlug, 'slug is empty'], [weirdType, 'asset_type "story" is not supported'], [badNews, 'unknown placeholder {{brand_name}}']]) {
    const got = C(r.content_id);
    results.check(got.status === 'approved' && got.last_error === `Lane 2 skipped: ${expected}`.slice(0, 300) || (got.status === 'approved' && got.last_error.includes(expected)), `${r.asset_type} row skipped, status unchanged, last_error: "${got.last_error}"`);
  }
  results.check(C(futureEmpty.content_id).last_error === '' && C(futureEmpty.content_id).status === 'approved', 'a future row with an empty body is not touched yet');
  const errs = events('error');
  results.check(errs.length === 6 && errs.every((e) => e.entity_type === 'content' && e.channel === 'sheet' && meta(e).node === 'Lane 2 · Pick due content' && meta(e).message.startsWith('Lane 2 skipped:')), `six error events with node + message in meta_json (${errs.length})`);
  results.check(errs.some((e) => e.entity_id === noDate.content_id && e.detail.includes('scheduled_for')) && errs.some((e) => e.entity_id === emptyBody.content_id && e.detail.includes('body')), 'each detail names the field');
  results.check(mock.sent.length === 0 && mock.requests.filter((q) => q === 'GET /sheets/LEADS').length === 0, 'the invalid newsletter sent nothing and LEADS was not read');
  const writesBefore = mock.writes.length;
  await run(2);
  results.check(mock.messages.length === 1 && events('error').length === 6 && mock.writes.length === writesBefore, `two more runs: no repeat posts, no repeat error rows, no new writes (errors ${events('error').length})`);
  // a human fixes the body: the next run publishes it and clears last_error
  mock.rows('CONTENT').find((r) => r.content_id === emptyBody.content_id).body = 'Fixed now';
  await run();
  results.check(C(emptyBody.content_id).status === 'published' && C(emptyBody.content_id).last_error === '', 'after a human fixes the row it publishes and last_error is cleared');
  sheetRulesRespected();
  results.check(lastExecution()?.status === 'success', 'runs finished successfully (a bad row never crashes the run)');

  // ------------------------------------------------------------------ 5
  results.begin('Telegram failing: that row is failed with last_error, other rows still processed');
  const f1 = content({ body: 'FAILME please', scheduled_for: T(-20) });
  const f2 = content({ body: 'works fine', scheduled_for: T(-10) });
  fresh({}, [f1, f2]);
  mock.fail.telegram = (b) => String(b.text).includes('FAILME');
  await run();
  results.check(C(f1.content_id).status === 'failed' && /^Telegram: .*Forbidden/.test(C(f1.content_id).last_error) && C(f1.content_id).published_at === '' && C(f1.content_id).publish_ref === '', `row failed with last_error: ${C(f1.content_id).last_error}`);
  results.check(C(f2.content_id).status === 'published', 'the other row was published');
  results.check(mock.messages.length === 1, 'one message delivered');
  const pf = events('publish_failed')[0] ?? {};
  results.check(events('publish_failed').length === 1 && pf.entity_id === f1.content_id && pf.status_from === 'approved' && pf.status_to === 'failed' && pf.channel === 'telegram_channel' && meta(pf).error.includes('Forbidden'), 'one publish_failed event with the error in meta_json');
  const msgCount = mock.messages.length;
  await run(2);
  results.check(mock.messages.length === msgCount && C(f1.content_id).status === 'failed', 'a failed row is not retried by itself (human sets it back to approved)');
  mock.fail.telegram = () => false;
  mock.rows('CONTENT').find((r) => r.content_id === f1.content_id).status = 'approved';
  await run();
  results.check(C(f1.content_id).status === 'published' && C(f1.content_id).last_error === '', 'after a human sets it back to approved it publishes and last_error is cleared');
  sheetRulesRespected();

  // ------------------------------------------------------------------ 6
  results.begin('More due rows than MAX_POSTS_PER_RUN (2)');
  const five = [-50, -40, -30, -20, -10].map((m, i) => content({ body: `Post ${i + 1}`, scheduled_for: T(m) }));
  fresh({}, [five[3], five[0], five[4], five[2], five[1]]);
  await run();
  results.check(mock.messages.length === 2 && mock.messages[0].text.startsWith('Post 1') && mock.messages[1].text.startsWith('Post 2'), `run 1 posts the two oldest: ${mock.messages.map((m) => m.text.slice(0, 6))}`);
  await run();
  results.check(mock.messages.length === 4 && mock.messages[2].text.startsWith('Post 3') && mock.messages[3].text.startsWith('Post 4'), 'run 2 posts the next two');
  await run();
  await run();
  results.check(mock.messages.length === 5 && mock.messages[4].text.startsWith('Post 5') && five.every((r) => C(r.content_id).status === 'published'), 'run 3 posts the last one; run 4 does nothing');
  results.check(new Set(mock.messages.map((m) => m.text)).size === 5, 'no post twice');

  results.begin('A very long caption stays under the Telegram limit');
  const long = content({ body: ('Roshni & light <3 ' + 'x'.repeat(60) + ' ').repeat(120), hashtags: '#KayaJewels #RoshniEdit' });
  fresh({}, [long]);
  await run();
  const lt = mock.messages[0]?.text ?? '';
  results.check(lt.length > 0 && lt.length <= 4000 && lt.includes('#KayaJewels #RoshniEdit') && lt.endsWith(WAITLIST) && /…\n\n#KayaJewels/.test(lt), `message is ${lt.length} characters, body cut with …, hashtags and link kept`);
  results.check(!/&[a-z]*$/m.test(lt.split('\n\n')[0].replace(/…$/, '')) || /&(amp|lt|gt);…?$/m.test(lt.split('\n\n')[0]), 'no HTML entity cut in half');
  results.check(C(long.content_id).status === 'published', 'long caption published');

  // ------------------------------------------------------------------ 7
  results.begin('Newsletter over several runs (7 leads, 3 per run) resumes through last_newsletter_id and finishes as published');
  const news = content({ ...NEWSLETTER, scheduled_for: T(-8) });
  const leads7 = [1, 2, 3, 4, 5, 6, 7].map((n) => lead(n, n === 1 ? { first_name: 'Zoë <b>', thread_ids: 'old1,old2' } : n === 2 ? { thread_ids: 'a1,a2,a3,a4,a5,a6,a7,a8,a9,a10' } : n === 7 ? { status: 'hot' } : {}));
  const skip = [
    lead(20, { consent: 'FALSE' }), lead(21, { status: 'unsubscribed' }), lead(22, { email_allowed: 'FALSE' }), lead(23, { status: 'blocked' }),
    lead(24, { status: 'customer' }), lead(25, { consent: 'false' }),
  ];
  fresh({}, [news], [...leads7, ...skip]);
  const t0 = Date.now();
  await run();
  results.check(mock.sent.length === 3 && C(news.content_id).status === 'publishing', `run 1: 3 emails sent, newsletter now publishing (${mock.sent.length} / ${C(news.content_id).status})`);
  results.check(mock.sent.every((m, i) => i === 0 || m.at - mock.sent[i - 1].at >= 900), `SEND_DELAY_SECONDS respected between emails (${mock.sent.map((m, i) => i ? m.at - mock.sent[i - 1].at : 0).join(',')} ms)`);
  results.check(Date.now() - t0 < 45000, `run took ${Math.round((Date.now() - t0) / 1000)} s (budget 45 s)`);
  await run();
  results.check(mock.sent.length === 6 && C(news.content_id).status === 'publishing', 'run 2: 3 more');
  await run();
  results.check(mock.sent.length === 7 && C(news.content_id).status === 'published', `run 3: the last one, newsletter published (${C(news.content_id).status})`);
  results.check(C(news.content_id).publish_ref === 'newsletter:7 sent' && isStamp(C(news.content_id).published_at) && C(news.content_id).last_error === '', `publish_ref ${C(news.content_id).publish_ref}`);
  await run();
  results.check(mock.sent.length === 7, 'run 4: nothing more');
  const to = mock.sent.map((m) => m.to);
  results.check(new Set(to).size === 7 && leads7.every((l) => to.includes(l.email)) && skip.every((l) => !to.includes(l.email)), 'each active lead got it exactly once; consent FALSE / unsubscribed / email_allowed FALSE / blocked / customer got nothing');
  const m1 = mock.sent.find((m) => m.to === leads7[0].email);
  results.check(m1.subject === 'A first look, Zoë <b>' && m1.html.includes('<p>Hi Zoë &lt;b&gt;,</p>') && m1.html.includes('Not for you? Just reply &quot;unsubscribe&quot; and we will not email you again.') && !m1.html.includes('{{') && m1.senderName === 'Kaya Jewels (Demo)', `subject plain, body HTML-escaped, placeholders filled, sender name (${m1.subject})`);
  results.check(leads7.every((l) => L(l.lead_id).last_newsletter_id === news.content_id && isStamp(L(l.lead_id).last_contacted_at) && recent(L(l.lead_id).last_contacted_at) && isStamp(L(l.lead_id).updated_at)), 'every lead row: last_newsletter_id, last_contacted_at, updated_at');
  const thr1 = mock.sent.find((m) => m.to === leads7[0].email).threadId, thr2 = mock.sent.find((m) => m.to === leads7[1].email).threadId;
  results.check(L(leads7[0].lead_id).thread_ids === `old1,old2,${thr1}`, `thread id appended (${L(leads7[0].lead_id).thread_ids})`);
  results.check(L(leads7[1].lead_id).thread_ids === `a2,a3,a4,a5,a6,a7,a8,a9,a10,${thr2}`, 'only the last 10 thread ids are kept');
  results.check(skip.every((l) => JSON.stringify(L(l.lead_id)) === JSON.stringify(mock.rows('LEADS').find((r) => r.lead_id === l.lead_id)) && L(l.lead_id).last_newsletter_id === ''), 'skipped leads untouched');
  const sentEv = events('email_sent');
  results.check(sentEv.length === 7 && sentEv.every((e) => e.entity_type === 'lead' && e.channel === 'email' && meta(e).content_id === news.content_id && meta(e).thread_id.startsWith('thr')), 'seven email_sent events with content_id + thread_id');
  const pubEv = events('content_published');
  results.check(pubEv.length === 1 && pubEv[0].channel === 'email' && pubEv[0].entity_id === news.content_id && pubEv[0].status_from === 'publishing' && meta(pubEv[0]).publish_ref === 'newsletter:7 sent', 'one content_published event (channel email) when finished');
  results.check(leads7.every((l) => !['status', 'email_allowed', 'consent'].some((c) => L(l.lead_id)[c] !== (c === 'status' ? (l.status ?? 'nurturing') : 'TRUE'))), 'lead status / consent / email_allowed unchanged');
  sheetRulesRespected();

  // ------------------------------------------------------------------ 8
  results.begin('A lead behind the gap rule (MIN_EMAIL_GAP_DAYS) waits; the newsletter stays publishing until they are mailed');
  const news2 = content({ ...NEWSLETTER, scheduled_for: T(-8), status: 'approved' });
  const justMailed = lead(1, { last_contacted_at: T(0) });                     // gap = 0.5 day = 1 real minute in demo mode
  fresh({}, [news2], [justMailed, lead(2)]);
  await run();
  results.check(mock.sent.length === 1 && mock.sent[0].to === lead(2).email, 'only the lead outside the gap got it');
  results.check(C(news2.content_id).status === 'publishing' && L(justMailed.lead_id).last_newsletter_id === '', 'newsletter keeps publishing; the gapped lead is untouched');
  await run();
  results.check(mock.sent.length === 1 && events('content_published').length === 0, 'next run (still inside the gap): nothing sent, nothing logged');
  mock.rows('LEADS').find((r) => r.lead_id === justMailed.lead_id).last_contacted_at = T(-3);   // time passes
  await run();
  results.check(mock.sent.length === 2 && C(news2.content_id).status === 'published' && C(news2.content_id).publish_ref === 'newsletter:2 sent', `after the gap: sent and published (${C(news2.content_id).publish_ref})`);
  const gapSetting = (await (async () => { fresh({ MIN_EMAIL_GAP_DAYS: 0 }, [content({ ...NEWSLETTER, scheduled_for: T(-8) })], [lead(1, { last_contacted_at: T(0) })]); await run(); return mock.sent.length; })());
  results.check(gapSetting === 1, 'MIN_EMAIL_GAP_DAYS = 0 (SETTINGS) switches the gap rule off');
  fresh({ DEMO_MODE: 'FALSE', MIN_EMAIL_GAP_DAYS: 0.5 }, [content({ ...NEWSLETTER, scheduled_for: T(-8) })], [lead(1, { last_contacted_at: T(-60 * 11) }), lead(2, { last_contacted_at: T(-60 * 13) })]);
  await run();
  results.check(mock.sent.length === 1 && mock.sent[0].to === lead(2).email, 'DEMO_MODE FALSE: a real half day (12 h) applies — 11 h ago waits, 13 h ago is mailed');

  // ------------------------------------------------------------------ 9
  results.begin('Safety gate: blocked and invalid addresses never get mail, the lead is marked blocked');
  const news3 = content({ ...NEWSLETTER, scheduled_for: T(-8) });
  const gateLeads = [
    lead(1, { email: 'someone@example.com' }), lead(2, { email: 'random.person@gmail.com' }), lead(3, { email: 'not-an-email' }),
    lead(4, { email: '' }), lead(5, { email: 'Kayademo.Customers+Upper@Gmail.com ' }), lead(6),
  ];
  fresh({ MAX_SENDS_PER_RUN: 10 }, [news3], gateLeads);
  await run();
  results.check(mock.sent.length === 2 && mock.sent.map((m) => m.to).sort().join() === ['kayademo.customers+l6@gmail.com', 'kayademo.customers+upper@gmail.com'].join(), `only demo-inbox plus-addresses were emailed (${mock.sent.map((m) => m.to)})`);
  results.check([1, 2, 3, 4].every((n) => L(gateLeads[n - 1].lead_id).status === 'blocked' && L(gateLeads[n - 1].lead_id).email_allowed === 'FALSE'), 'the four refused leads are now status blocked, email_allowed FALSE');
  results.check(L(gateLeads[0].lead_id).last_newsletter_id === '' && L(gateLeads[0].lead_id).last_contacted_at === '', 'a blocked lead is not marked as having received the newsletter');
  const bl = events('email_blocked');
  results.check(bl.length === 4 && bl.every((e) => e.entity_type === 'lead' && e.status_to === 'blocked' && e.status_from === 'nurturing' && e.channel === 'email' && meta(e).content_id === news3.content_id && meta(e).reason.length > 3), `four email_blocked events with a reason (${bl.map((e) => meta(e).reason).join(' | ')})`);
  results.check(C(news3.content_id).status === 'published' && C(news3.content_id).publish_ref === 'newsletter:2 sent', `blocked leads are no longer waiting: newsletter published after the 2 real sends (${C(news3.content_id).publish_ref})`);
  const blockedWrites = mock.writes.filter((w) => w.tab === 'LEADS' && w.columns.includes('status'));
  results.check(blockedWrites.every((w) => JSON.stringify(w.columns) === JSON.stringify(['lead_id', 'status', 'email_allowed', 'updated_at'])), 'a blocked lead update writes only lead_id, status, email_allowed, updated_at');
  const sentBefore = mock.sent.length;
  await run();
  results.check(mock.sent.length === sentBefore, 'blocked addresses are not tried again');
  sheetRulesRespected();

  // ------------------------------------------------------------------ 10
  results.begin('Gmail failing: email_failed logged, lead not advanced, retried on a later run, no duplicates');
  const news4 = content({ ...NEWSLETTER, scheduled_for: T(-8) });
  fresh({}, [news4], [lead(1), lead(2), lead(3)]);
  mock.fail.gmail = (b) => b.to === lead(2).email;
  await run();
  results.check(mock.sent.length === 2 && !mock.sent.some((m) => m.to === lead(2).email), 'the other two leads were emailed');
  results.check(L(lead(2).lead_id).last_newsletter_id === '' && L(lead(2).lead_id).last_contacted_at === '' && L(lead(2).lead_id).status === 'nurturing', 'the failed lead row is unchanged (not advanced)');
  const ef = events('email_failed');
  results.check(ef.length === 1 && ef[0].entity_id === lead(2).lead_id && ef[0].channel === 'email' && meta(ef[0]).error.length > 0 && meta(ef[0]).content_id === news4.content_id, `one email_failed event (${ef[0]?.detail})`);
  results.check(C(news4.content_id).status === 'publishing' && events('content_published').length === 0, 'newsletter is NOT published while a lead is still waiting');
  await run();
  results.check(mock.sent.length === 2 && events('email_failed').length === 2, 'run 2 tries the failing lead again (still failing), nobody gets a duplicate');
  mock.fail.gmail = () => false;
  await run();
  results.check(mock.sent.length === 3 && C(news4.content_id).status === 'published' && C(news4.content_id).publish_ref === 'newsletter:3 sent', `once Gmail works the lead gets it and the newsletter is published (${C(news4.content_id).publish_ref})`);
  results.check(new Set(mock.sent.map((m) => m.to)).size === 3, 'every lead got it exactly once');
  const sendNodeCalls = mock.requests.filter((q) => q === 'POST /gmail/send').length;
  results.check(sendNodeCalls === mock.sent.length + 2, `Gmail node is never retried inside a run (${sendNodeCalls} calls = ${mock.sent.length} sent + 2 failed)`);
  sheetRulesRespected();

  // ------------------------------------------------------------------ 11
  results.begin('Two runs back to back: no double post, no double email');
  const newsB = content({ ...NEWSLETTER, scheduled_for: T(-8) });
  const capB = content({ body: 'Back to back caption', scheduled_for: T(-8) });
  fresh({}, [capB, newsB], [lead(1), lead(2)]);
  await run(2);
  results.check(mock.messages.length === 1 && mock.sent.length === 2 && new Set(mock.sent.map((m) => m.to)).size === 2, `1 post, 2 emails after two runs (${mock.messages.length}/${mock.sent.length})`);
  results.check(events('content_published').length === 2 && events('email_sent').length === 2, 'each logged once');
  await run();
  results.check(mock.messages.length === 1 && mock.sent.length === 2, 'a third run changes nothing');

  // ------------------------------------------------------------------ 12
  results.begin('Node failing mid-run: Sheets hiccups are retried; a dead LEADS read does not lose or duplicate anything');
  const capR = content({ body: 'Retry caption', scheduled_for: T(-8) });
  fresh({}, [capR]);
  let hiccups = 0;
  mock.fail.sheetsWrite = (tab, op) => tab === 'CONTENT' && op === 'update' && hiccups++ < 2;
  await run();
  await mock.idle(4500);
  results.check(hiccups >= 3 && C(capR.content_id).status === 'published' && mock.messages.length === 1, `CONTENT update failed ${Math.min(hiccups, 2)}× then succeeded on retry: published, ONE message (${C(capR.content_id).status})`);
  mock.fail.sheetsWrite = () => false;
  results.check(events('content_published').length === 1, 'logged once');
  const capD = content({ body: 'Post survives dead LEADS read', scheduled_for: T(-8) });
  const newsD = content({ ...NEWSLETTER, scheduled_for: T(-8) });
  fresh({}, [capD, newsD], [lead(1)]);
  mock.fail.sheetsRead = (tab) => tab === 'LEADS';
  await run();
  await mock.idle(7000);
  results.check(lastExecution()?.status === 'error', `the run is marked failed in n8n (${lastExecution()?.status})`);
  results.check(mock.messages.length === 1 && C(capD.content_id).status === 'published', 'the post (processed before the newsletter) was published once');
  results.check(mock.sent.length === 0 && C(newsD.content_id).status === 'publishing', 'no email sent; newsletter is publishing and will continue');
  mock.fail.sheetsRead = () => false;
  await run();
  results.check(mock.messages.length === 1 && mock.sent.length === 1 && C(newsD.content_id).status === 'published', 'next run: no second post, the newsletter completes');
  results.check(mock.violations.length === 0, 'no sheet rule violations');

  results.begin('SETTINGS missing a key: clear error, nothing written');
  fresh({ MAX_POSTS_PER_RUN: undefined }, [content()]);
  await run();
  const lastE = lastExecution();
  results.check(lastE?.status === 'error' && /missing a value for: MAX_POSTS_PER_RUN/.test(lastE.data), 'execution fails naming MAX_POSTS_PER_RUN');
  results.check(mock.messages.length === 0 && mock.writes.length === 0, 'nothing posted or written');
  fresh({ SEND_DELAY_SECONDS: 'abc' }, [content()]);
  await run();
  results.check(lastExecution()?.status === 'error' && /SEND_DELAY_SECONDS must be a number/.test(lastExecution().data) && mock.messages.length === 0, 'a non-numeric setting stops the run with a clear message');
} catch (error) {
  results.check(false, `test run crashed: ${error.stack}`);
} finally {
  await n8n.stop();
  await mock.stop();
}
writeFileSync(new URL(`./results-${engine}.json`, import.meta.url), JSON.stringify(results.items, null, 2));
console.log(`\n${results.summary()}`);
process.exit(results.failed.length ? 1 : 0);
