#!/usr/bin/env node
// End-to-end tests for Lane 7 (Inbox) in a REAL n8n server.
// Usage: node tests/lane-7/run-tests.mjs [vm|legacy]
// The Gmail Trigger and the Form Trigger become webhooks (the test posts the messages the trigger would deliver),
// Sheets / Gmail / Telegram become mock HTTP stubs, Gemini / Groq go to the mock. All other nodes are the real ones.
import { readFileSync } from 'node:fs';
import { startMock } from '../_shared/mock-server.mjs';
import { buildTestWorkflow, startN8n, freePort, mockApi, Tester } from '../_shared/harness.mjs';

const engine = process.argv[2] || 'vm';
const mockPort = await freePort();
const mock = await startMock(mockPort);
const mockUrl = `http://127.0.0.1:${mockPort}`;
const api = mockApi(mockUrl);
const lane = JSON.parse(readFileSync(new URL('../../lanes/lane-7-inbox.json', import.meta.url), 'utf8'));
const n8n = await startN8n({ engine, label: 'lane7', workflows: [buildTestWorkflow(7, lane, { mockUrl, id: 'lane7test', webhookPaths: { inbox: 'lane7-inbox', form: 'lane7-form' } })] });
const T = new Tester(`Lane 7 [${engine}]`);

const OWNED = {
  LEADS: ['status', 'last_reply_at', 'reply_class', 'next_action_at', 'notes', 'updated_at'],
  PROSPECTS: ['status', 'last_reply_at', 'reply_class', 'next_action_at', 'deal_notes', 'updated_at'],
};
const reset = (extra = {}) => api.reset({ settings: { AI_WAIT_SECONDS: '1', TELEGRAM_OWNER_CHAT_ID: '4242', ...(extra.settings || {}) }, config: { owned: OWNED, ...(extra.config || {}) } });
const rowOf = async (tab, id) => (await api.sheet(tab)).find((r) => r[tab === 'LEADS' ? 'lead_id' : 'prospect_id'] === id);
const edit = async (tab, id, changes) => { const all = await api.sheet(tab); Object.assign(all.find((r) => r[tab === 'LEADS' ? 'lead_id' : 'prospect_id'] === id), changes); await api.setSheet(tab, all); };
const events = async () => (await api.sheet('EVENTS_LOG')).filter((e) => e.execution_id !== 'sample');   // ignore the sample rows of the template
const lastError = async () => { const list = await n8n.executions(); return list[list.length - 1]; };
const evOf = (list, type) => list.filter((e) => e.event_type === type);
const meta = (e) => JSON.parse(e.meta_json);
const telegrams = async () => (await api.calls('telegram')).map((c) => c.payload);
const marked = async () => (await api.calls('gmail_markread')).map((c) => c.payload.message_id);
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

let counter = 0;
const gmail = ({ from = 'kayademo.customers@gmail.com', name = 'Demo Customer', thread, text, subject = 'Re: hello from Kaya Jewels', headers = {}, id }) => ({
  id: id ?? `m-${++counter}`, threadId: thread, labelIds: ['INBOX', 'UNREAD'], subject, text,
  from: { value: [{ address: from, name }], text: `${name} <${from}>` }, to: { value: [{ address: 'kayademo.hello@gmail.com', name: 'Kaya Jewels (Demo)' }] },
  headers, date: new Date().toISOString(),
});
const poll = (...messages) => n8n.fire('lane7-inbox', { messages });
// A contacted prospect / nurtured lead whose Gmail thread we know.
const prospectThread = (id, thread, extra = {}) => edit('PROSPECTS', id, { status: 'contacted', seq_step: '1', thread_ids: thread, next_action_at: '2026-10-20T10:00:00+05:30', ...extra });
const leadThread = (id, thread, extra = {}) => edit('LEADS', id, { status: 'nurturing', thread_ids: thread, next_action_at: '2026-10-20T10:00:00+05:30', ...extra });
const firstLead = async () => (await api.sheet('LEADS'))[0];

await T.scenario('1 · prospect replies "yes please send the lookbook": interested, follow-ups stop, hot alert, mail marked read', async () => {
  await reset();
  await prospectThread('PR-B04', 'thr-5');
  const m = gmail({ thread: 'thr-5', text: 'Yes please send the lookbook' });
  const r = await poll(m);
  T.eq(r.status, 200, 'run finished');
  const row = await rowOf('PROSPECTS', 'PR-B04');
  T.eq([row.status, row.reply_class, row.next_action_at], ['interested', 'interested', ''], 'status interested, class interested, next_action_at cleared');
  T.check(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+05:30$/.test(row.last_reply_at) && row.updated_at === row.last_reply_at, `last_reply_at is a proper timestamp: ${row.last_reply_at}`);
  T.check(row.deal_notes === `[${today()}] Customer says: Yes please send the lookbook`, `deal_notes appended: ${row.deal_notes}`);
  const tg = await telegrams();
  T.eq(tg.length, 1, 'one Telegram message');
  T.check(tg[0].chat_id === '4242' && tg[0].text.startsWith('🔥 HOT: Gulmohar Concept Store replied: Customer says: Yes please send the lookbook') && tg[0].text.includes('\nNext step: Reply personally today.'), `hot alert text: ${JSON.stringify(tg[0].text)}`);
  T.eq(await marked(), [m.id], 'the Gmail message was marked read');
  const ev = await events();
  const got = evOf(ev, 'reply_received')[0];
  T.check(got.entity_type === 'prospect' && got.entity_id === 'PR-B04' && got.status_from === 'contacted' && got.status_to === 'interested' && got.channel === 'gmail_inbox' && got.lane === '7', 'reply_received columns');
  T.check(meta(got).reply_class === 'interested' && meta(got).thread_id === 'thr-5' && meta(got).message_id === m.id, 'reply_received meta has reply_class + thread_id (+ message_id)');
  T.check(evOf(ev, 'hot_alert_sent').length === 1 && evOf(ev, 'hot_alert_sent')[0].entity_type === 'prospect' && meta(evOf(ev, 'hot_alert_sent')[0]).reply_class === 'interested', 'hot_alert_sent logged');
  T.eq(evOf(ev, 'ai_call').length, 1, 'one ai_call');
  T.eq((await api.violations()).length, 0, 'only owned columns were written');
  T.eq((await api.calls('sheet_update')).length, 1, 'exactly one row update');
});

await T.scenario('2 · lead replies interested -> hot; unsubscribe / STOP -> stopped forever (lead unsubscribed, prospect do_not_contact)', async () => {
  await reset();
  const lead = await firstLead();
  await leadThread(lead.lead_id, 'thr-L1');
  await poll(gmail({ thread: 'thr-L1', text: 'Yes I am interested, please send details' }));
  let row = await rowOf('LEADS', lead.lead_id);
  T.eq([row.status, row.reply_class, row.next_action_at], ['hot', 'interested', ''], 'lead: hot');
  T.check(row.notes.endsWith(`[${today()}] Customer says: Yes I am interested, please send details`), 'lead notes appended (summary in notes)');
  T.check((await telegrams())[0].text.startsWith(`🔥 HOT: ${lead.first_name} replied:`), 'alert uses the first name');
  for (const text of ['STOP', 'unsubscribe me please']) {
    await reset();
    await leadThread(lead.lead_id, 'thr-L1');
    await prospectThread('PR-I02', 'thr-P2');
    await poll(gmail({ thread: 'thr-L1', text }), gmail({ thread: 'thr-P2', text }));
    row = await rowOf('LEADS', lead.lead_id);
    T.eq([row.status, row.reply_class, row.next_action_at], ['unsubscribed', 'unsubscribe', ''], `"${text}": lead unsubscribed`);
    const pr = await rowOf('PROSPECTS', 'PR-I02');
    T.eq([pr.status, pr.reply_class, pr.next_action_at], ['do_not_contact', 'unsubscribe', ''], `"${text}": prospect do_not_contact`);
    T.eq((await telegrams()).length, 0, `"${text}": no alert for an unsubscribe`);
  }
  // even if the AI misreads STOP as a friendly reply, the unsubscribe rule wins
  await reset({ config: { ai: { classify: { reply_class: 'interested', confidence: 0.95 } } } });
  await prospectThread('PR-I02', 'thr-P2');
  await poll(gmail({ thread: 'thr-P2', text: 'STOP' }));
  const pr2 = await rowOf('PROSPECTS', 'PR-I02');
  T.eq(pr2.status, 'do_not_contact', 'AI said interested but the reply was STOP: still do_not_contact');
  T.eq((await telegrams()).length, 0, 'and no hot alert');
});

await T.scenario('3 · not interested, question, maybe later', async () => {
  await reset();
  const lead = await firstLead();
  await leadThread(lead.lead_id, 'thr-L1');
  await prospectThread('PR-B04', 'thr-B4');
  await prospectThread('PR-B01', 'thr-B1');
  await prospectThread('PR-I01', 'thr-I1');
  await poll(
    gmail({ thread: 'thr-L1', text: 'Not interested, thank you' }),
    gmail({ thread: 'thr-B4', text: 'Not interested, no thanks.' }),
    gmail({ thread: 'thr-B1', text: 'Do you supply customised packaging?' }),
    gmail({ thread: 'thr-I1', text: 'Maybe later, after Diwali.' }),
  );
  T.eq((await rowOf('LEADS', lead.lead_id)).status, 'unsubscribed', 'lead not_interested -> unsubscribed (SPEC 3.2)');
  const b4 = await rowOf('PROSPECTS', 'PR-B04');
  T.eq([b4.status, b4.reply_class], ['not_interested', 'not_interested'], 'prospect not_interested');
  const b1 = await rowOf('PROSPECTS', 'PR-B01');
  T.eq([b1.status, b1.reply_class, b1.next_action_at], ['replied', 'question', ''], 'question -> replied');
  const i1 = await rowOf('PROSPECTS', 'PR-I01');
  T.eq([i1.status, i1.reply_class, i1.next_action_at], ['replied', 'not_now', ''], 'maybe later -> not_now -> replied');
  const tg = await telegrams();
  T.eq(tg.length, 1, 'only the question produced an alert');
  T.check(tg[0].text.startsWith('❓ Saanjh Boutique asked: '), `question alert: ${tg[0].text}`);
  const ev = await events();
  T.eq(evOf(ev, 'reply_received').length, 4, '4 reply_received events');
  T.eq(evOf(ev, 'hot_alert_sent').length, 1, '1 alert logged');
});

await T.scenario('4 · out-of-office auto-reply: logged as out_of_office, row unchanged, no AI, no alert, marked read', async () => {
  await reset();
  await prospectThread('PR-B04', 'thr-5');
  const before = await rowOf('PROSPECTS', 'PR-B04');
  const m = gmail({ thread: 'thr-5', subject: 'Automatic reply: Gulmohar x Kaya Jewels', text: 'I am out of office until Monday.', headers: { 'auto-submitted': 'Auto-Submitted: auto-replied' } });
  const m2 = gmail({ thread: 'thr-5', subject: 'Re: hi', text: 'Away', headers: { precedence: 'Precedence: bulk' } });
  const m3 = gmail({ thread: 'thr-5', subject: 'Out of office', text: 'Back soon' });
  const m4 = gmail({ thread: 'thr-5', subject: 'Re: thanks', text: 'hello', headers: { 'x-autoreply': 'X-Autoreply: yes' } });
  await poll(m, m2, m3, m4);
  T.eq(await rowOf('PROSPECTS', 'PR-B04'), before, 'the row is exactly as before');
  T.eq((await api.calls('sheet_update')).length, 0, 'no row update at all');
  T.eq((await api.calls('gemini')).length, 0, 'no AI call for auto-replies');
  T.eq((await telegrams()).length, 0, 'no alert');
  T.eq(await marked(), [m.id, m2.id, m3.id, m4.id], 'all four marked read');
  const got = evOf(await events(), 'reply_received');
  T.eq(got.length, 4, 'four reply_received events');
  T.check(got.every((e) => meta(e).reply_class === 'out_of_office' && e.entity_id === 'PR-B04'), 'all with class out_of_office');
  await reset();
  await poll(gmail({ thread: 'nope', from: 'stranger@example.com', subject: 'Automatic reply', text: 'away', headers: { 'auto-submitted': 'auto-replied' } }));
  T.eq(evOf(await events(), 'reply_unmatched').length, 1, 'an auto-reply from a stranger is just unmatched');
  await reset();
  await prospectThread('PR-B04', 'thr-5');
  await poll(gmail({ thread: 'thr-5', text: 'Hello', headers: { 'auto-submitted': 'no' } }));
  T.eq((await rowOf('PROSPECTS', 'PR-B04')).status, 'replied', 'Auto-Submitted: no is a normal mail');
});

await T.scenario('5 · unmatched mail: reply_unmatched logged, marked read, nothing else', async () => {
  await reset();
  const m = gmail({ thread: 'thr-zzz', from: 'someone.new@example.com', text: 'Hello, are you hiring?' });
  await poll(m);
  const un = evOf(await events(), 'reply_unmatched');
  T.eq(un.length, 1, 'one reply_unmatched');
  T.check(un[0].entity_type === 'system' && meta(un[0]).from === 'someone.new@example.com' && meta(un[0]).thread_id === 'thr-zzz', 'meta has from + thread_id');
  T.eq(await marked(), [m.id], 'marked read');
  T.eq([(await api.calls('sheet_update')).length, (await api.calls('gemini')).length, (await telegrams()).length], [0, 0, 0], 'no row update, no AI, no alert');
});

await T.scenario('6 · matching: by thread id, by exact sender address, by sender address without the plus-tag, ambiguous = never guess', async () => {
  await reset();
  await prospectThread('PR-B01', 'thr-1');
  await poll(gmail({ thread: 'thr-1', from: 'somebody.else@gmail.com', text: 'Interested!' }));
  T.eq((await rowOf('PROSPECTS', 'PR-B01')).status, 'interested', 'thread id wins even if the sender address is different');
  await reset();
  await poll(gmail({ thread: 'unknown', from: 'Kayademo.Customers+Boutique2@Gmail.com', text: 'Interested!' }));
  T.eq([(await rowOf('PROSPECTS', 'PR-B02')).status, (await rowOf('PROSPECTS', 'PR-B02')).reply_class], ['interested', 'interested'], 'exact sender address matches (case-insensitive); a `new` prospect that replies is taken off the outreach list');
  await reset();
  const lead = await firstLead();
  await edit('LEADS', lead.lead_id, { email: 'solo.person@gmail.com', status: 'nurturing' });
  await poll(gmail({ thread: 'unknown', from: 'solo.person+promo@gmail.com', text: 'Interested, yes!' }));
  const row = await rowOf('LEADS', lead.lead_id);
  T.eq([row.status, row.reply_class], ['hot', 'interested'], 'sender solo.person+promo@ matches solo.person@ (plus-tag removed, one row)');
  T.eq(meta(evOf(await events(), 'reply_received')[0]).matched_by, 'email_base', 'logged as matched by the base address');
  await reset();
  await poll(gmail({ thread: 'unknown', from: 'kayademo.customers@gmail.com', text: 'Interested, yes!' }));
  const un = evOf(await events(), 'reply_unmatched');
  T.eq(un.length, 1, 'the shared demo address matches many rows: unmatched, never guessed');
  T.check(meta(un[0]).reason.includes('never guess'), `reason: ${meta(un[0]).reason}`);
  T.eq((await api.calls('sheet_update')).length, 0, 'no row was touched');
});

await T.scenario('7 · low-confidence classification becomes `other`, flagged for a human; confident `other` is not', async () => {
  await reset({ config: { ai: { classify: { reply_class: 'interested', confidence: 0.4 } } } });
  await prospectThread('PR-B04', 'thr-5');
  await poll(gmail({ thread: 'thr-5', text: 'Hmm let me think about it' }));
  const row = await rowOf('PROSPECTS', 'PR-B04');
  T.eq([row.status, row.reply_class], ['replied', 'other'], 'confidence 0.4 -> other -> replied');
  T.check((await telegrams())[0]?.text.startsWith('🤔 Needs a human look: Gulmohar Concept Store: '), `flag text: ${(await telegrams())[0]?.text}`);
  await reset({ config: { ai: { classify: { reply_class: 'other', confidence: 0.9 } } } });
  await prospectThread('PR-B04', 'thr-5');
  await poll(gmail({ thread: 'thr-5', text: 'Thanks for your note' }));
  T.eq((await telegrams()).length, 0, 'a confident `other` raises no alert');
});

await T.scenario('8 · AI down on both providers: keyword rules classify every reply', async () => {
  const table = [
    ['Please remove me from your list', 'unsubscribe', 'do_not_contact'],
    ['STOP', 'unsubscribe', 'do_not_contact'],
    ['I am on leave till Diwali', 'out_of_office', 'contacted'],
    ['No thanks, not interested', 'not_interested', 'not_interested'],
    ['Maybe next season', 'not_now', 'replied'],
    ['Not now, sorry', 'not_now', 'replied'],
    ['Sure, send the price list', 'interested', 'interested'],
    ['We would love a sample', 'interested', 'interested'],
    ['How long does delivery take?', 'question', 'replied'],
    ['ok', 'other', 'replied'],
  ];
  await reset({ config: { ai: { gemini: 'http500', groq: 'http500' } } });
  for (const [i, [text]] of table.entries()) await prospectThread(['PR-B01', 'PR-B02', 'PR-B03', 'PR-B04', 'PR-B05', 'PR-B06', 'PR-I01', 'PR-I02', 'PR-I03', 'PR-I04'][i], `thr-k${i}`);
  await poll(...table.map(([text], i) => gmail({ thread: `thr-k${i}`, text })));
  const ids = ['PR-B01', 'PR-B02', 'PR-B03', 'PR-B04', 'PR-B05', 'PR-B06', 'PR-I01', 'PR-I02', 'PR-I03', 'PR-I04'];
  for (const [i, [text, cls, status]] of table.entries()) {
    const row = await rowOf('PROSPECTS', ids[i]);
    T.eq([row.reply_class || 'out_of_office', row.status], [cls, status], `"${text}" -> ${cls}`);
  }
  const ev = await events();
  T.eq(evOf(ev, 'ai_failed').length, 10, 'ai_failed logged for each mail');
  T.check(evOf(ev, 'reply_received').length === 10, '10 reply_received events');
  const tg = await telegrams();
  T.check(tg.some((t) => t.text.startsWith('🤔 Needs a human look')), 'the unclear `ok` was flagged for a human');
  T.check(tg.filter((t) => t.text.startsWith('🔥')).length === 2 && tg.filter((t) => t.text.startsWith('❓')).length === 1, '2 hot alerts + 1 question alert');
});

await T.scenario('9 · Gmail mark-read fails: row still updated, alert still sent, error logged', async () => {
  await reset({ config: { gmailMarkReadFail: true } });
  await prospectThread('PR-B04', 'thr-5');
  const r = await poll(gmail({ thread: 'thr-5', text: 'Yes please send the lookbook' }));
  T.eq(r.status, 200, 'run finished');
  T.eq((await rowOf('PROSPECTS', 'PR-B04')).status, 'interested', 'row updated');
  T.eq((await telegrams()).length, 1, 'alert sent');
  const ev = await events();
  T.eq(evOf(ev, 'reply_received').length, 1, 'reply_received logged');
  const err = evOf(ev, 'error');
  T.check(err.length === 1 && err[0].detail.includes('Could not mark the mail read') && meta(err[0]).node === 'Lane 7 · Mark message read', `error event: ${err[0]?.detail}`);
});

await T.scenario('10 · Telegram fails: row still updated, error logged (not hot_alert_sent)', async () => {
  await reset({ config: { telegramFail: true } });
  await prospectThread('PR-B04', 'thr-5');
  const m = gmail({ thread: 'thr-5', text: 'Yes please send the lookbook' });
  const r = await poll(m);
  T.eq(r.status, 200, 'run finished');
  T.eq((await rowOf('PROSPECTS', 'PR-B04')).status, 'interested', 'row updated');
  T.eq(await marked(), [m.id], 'mail still marked read');
  const ev = await events();
  T.eq(evOf(ev, 'hot_alert_sent').length, 0, 'no hot_alert_sent');
  const err = evOf(ev, 'error');
  T.check(err.length === 1 && err[0].detail.includes('Telegram alert failed') && meta(err[0]).node === 'Lane 7 · Telegram alert', `error event: ${err[0]?.detail}`);
  T.eq((await api.calls('telegram')).length, 3, 'Telegram was tried 3 times');
});

await T.scenario('11 · quoted history is removed before the AI sees it; reply capped at 2000 chars', async () => {
  await reset();
  await prospectThread('PR-B04', 'thr-5');
  const text = 'Thanks, we will think about it.\n\nOn Tue, 6 Oct 2026 at 15:12, Kaya Jewels (Demo)\n<kayademo.hello@gmail.com> wrote:\n> Shall I send you the lookbook and the wholesale price list?\n> Warmly, Kaya';
  await poll(gmail({ thread: 'thr-5', text }));
  const prompt = (await api.calls('gemini'))[0].payload.contents[0].parts[0].text;
  const replyPart = /<<<REPLY\n([\s\S]*?)\nREPLY>>>/.exec(prompt)[1];
  T.eq(replyPart, 'Thanks, we will think about it.', 'only the new text reaches the AI (the "On ... wrote:" block is gone, even when wrapped)');
  await reset({ config: { ai: { gemini: 'http500', groq: 'http500' } } });
  await prospectThread('PR-B04', 'thr-5');
  await poll(gmail({ thread: 'thr-5', text: 'Not now, thanks.\n\nOn Tue, 6 Oct 2026 at 15:12 Kaya <kayademo.hello@gmail.com> wrote:\n> Can I send you the lookbook and the price list?' }));
  T.eq((await rowOf('PROSPECTS', 'PR-B04')).reply_class, 'not_now', 'keyword rules also ignore the quoted history (not "interested")');
  await reset();
  await prospectThread('PR-B04', 'thr-5');
  await poll(gmail({ thread: 'thr-5', text: '> quoted line\nYes please. ' + 'x'.repeat(2500) }));
  const p2 = (await api.calls('gemini'))[0].payload.contents[0].parts[0].text;
  const reply2 = /<<<REPLY\n([\s\S]*?)\nREPLY>>>/.exec(p2)[1];
  T.check(reply2.length === 2000 && !reply2.includes('quoted line'), `capped at 2000 chars, ">" lines dropped (length ${reply2.length})`);
});

await T.scenario('12 · the same message arriving twice: second time changes nothing and does not alert again', async () => {
  await reset();
  await prospectThread('PR-B04', 'thr-5');
  const m = gmail({ thread: 'thr-5', text: 'Yes please send the lookbook', id: 'dup-1' });
  await poll(m);
  const rowAfterFirst = await rowOf('PROSPECTS', 'PR-B04');
  const eventsAfterFirst = (await events()).length;
  await poll(m);
  T.eq(await rowOf('PROSPECTS', 'PR-B04'), rowAfterFirst, 'row identical after the second delivery (notes not appended twice)');
  T.eq((await events()).length, eventsAfterFirst, 'no new log rows');
  T.eq((await telegrams()).length, 1, 'one alert in total');
  T.eq((await api.calls('gemini')).length, 1, 'one AI call in total');
  await reset();
  await prospectThread('PR-B04', 'thr-5');
  await poll(gmail({ thread: 'thr-5', text: 'Yes please', id: 'dup-2' }), gmail({ thread: 'thr-5', text: 'Yes please', id: 'dup-2' }));
  T.eq(evOf(await events(), 'reply_received').length, 1, 'duplicate inside one poll is handled once');
});

await T.scenario('13 · several mails in one poll (mixed kinds, in awkward order) are all handled', async () => {
  await reset();
  await prospectThread('PR-B04', 'thr-5');
  await leadThread((await firstLead()).lead_id, 'thr-L1');
  await prospectThread('PR-I01', 'thr-I1');
  const own = gmail({ from: 'kayademo.hello@gmail.com', thread: 'thr-5', text: 'our own message' });
  await poll(
    gmail({ thread: 'zzz', from: 'x@example.com', text: 'who is this' }),            // unmatched (no AI)
    gmail({ thread: 'thr-5', text: 'Yes please send the lookbook' }),                // AI
    gmail({ thread: 'thr-I1', subject: 'Automatic reply', text: 'away', headers: { 'auto-submitted': 'auto-replied' } }), // auto (no AI)
    own,                                                                             // ignored silently
    gmail({ thread: 'thr-L1', text: 'unsubscribe' }),                               // AI
    gmail({ thread: 'yyy', from: 'y@example.com', text: 'again unknown' }),          // unmatched
  );
  const ev = await events();
  T.eq([evOf(ev, 'reply_unmatched').length, evOf(ev, 'reply_received').length], [2, 3], '2 unmatched + 3 matched (incl. the auto-reply)');
  T.eq((await rowOf('PROSPECTS', 'PR-B04')).status, 'interested', 'prospect interested');
  T.eq((await rowOf('LEADS', (await firstLead()).lead_id)).status, 'unsubscribed', 'lead unsubscribed');
  T.eq((await rowOf('PROSPECTS', 'PR-I01')).status, 'contacted', 'auto-reply left PR-I01 alone');
  T.eq((await marked()).length, 5, '5 mails marked read, our own mail not touched');
  T.eq((await api.calls('gemini')).length, 2, 'AI only for the 2 real replies');
  const rows = evOf(ev, 'reply_received');
  T.check(rows.map((e) => e.entity_id).join() === 'PR-B04,PR-I01,' + (await firstLead()).lead_id, `log rows belong to the right entities in order: ${rows.map((e) => e.entity_id)}`);
});

await T.scenario('14 · status guards: sticky do_not_contact / unsubscribed; hot + question -> replied (SPEC 3.2)', async () => {
  await reset();
  await prospectThread('PR-B04', 'thr-5', { status: 'do_not_contact', next_action_at: '' });
  const lead = await firstLead();
  await leadThread(lead.lead_id, 'thr-L1', { status: 'unsubscribed', next_action_at: '' });
  await prospectThread('PR-I01', 'thr-I1', { status: 'interested' });
  await prospectThread('PR-I02', 'thr-I2', { status: 'sequence_done', seq_step: '3' });
  await edit('LEADS', (await api.sheet('LEADS'))[1].lead_id, { status: 'hot', thread_ids: 'thr-L2' });
  const second = (await api.sheet('LEADS'))[1];
  await poll(
    gmail({ thread: 'thr-5', text: 'Yes please send the lookbook' }),
    gmail({ thread: 'thr-L1', text: 'Yes please send the lookbook' }),
    gmail({ thread: 'thr-I1', text: 'One more question: do you ship to Goa?' }),
    gmail({ thread: 'thr-I2', text: 'Yes interested now, send details' }),
    gmail({ thread: 'thr-L2', text: 'Can I change my delivery city?' }),
  );
  T.eq((await rowOf('PROSPECTS', 'PR-B04')).status, 'do_not_contact', 'do_not_contact is never undone by a reply');
  T.eq((await rowOf('LEADS', lead.lead_id)).status, 'unsubscribed', 'unsubscribed is never undone by a reply');
  T.eq((await rowOf('PROSPECTS', 'PR-I01')).status, 'interested', 'an interested prospect asking a question stays interested');
  T.eq((await rowOf('PROSPECTS', 'PR-I02')).status, 'interested', 'sequence_done + interested -> interested');
  T.eq((await rowOf('LEADS', second.lead_id)).status, 'replied', 'hot lead asking a question -> replied (SPEC 3.2)');
});

await T.scenario('15 · what the AI is sent: temperature 0.2, JSON mode, class enum, facts as context, no discount code', async () => {
  await reset({ settings: { GEMINI_THINKING_BUDGET: '1024' } });
  await prospectThread('PR-B04', 'thr-5');
  await poll(gmail({ thread: 'thr-5', text: 'Yes please send the lookbook' }));
  const call = (await api.calls('gemini'))[0];
  const g = call.payload.generationConfig;
  T.eq([g.temperature, g.responseMimeType, g.thinkingConfig], [0.2, 'application/json', { thinkingBudget: 1024 }], 'temperature 0.2, JSON mode, thinking budget');
  T.eq(g.responseSchema.properties.reply_class.enum, ['interested', 'question', 'not_now', 'not_interested', 'unsubscribe', 'out_of_office', 'other'], 'reply_class limited to the SPEC enum');
  const system = call.payload.systemInstruction.parts[0].text;
  T.check(system.includes('Kaya Jewels was started in 2021') && system.includes('b2b_stockist_offer') && !/ROSHNI10/.test(system), 'BRIEF facts for context, never the discount code');
  await reset({ config: { ai: { gemini: 'http500', groq: 'ok' } } });
  await prospectThread('PR-B04', 'thr-5');
  await poll(gmail({ thread: 'thr-5', text: 'Yes please send the lookbook' }));
  const groq = (await api.calls('groq'))[0].payload;
  T.eq([groq.temperature, groq.response_format], [0.2, { type: 'json_object' }], 'Groq: temperature 0.2 + JSON mode');
  const ev = await events();
  T.eq([evOf(ev, 'ai_fallback').length, evOf(ev, 'ai_call').length], [1, 1], 'ai_fallback + ai_call logged when Groq answers');
  T.eq((await rowOf('PROSPECTS', 'PR-B04')).status, 'interested', 'Groq answer used');
});

await T.scenario('16 · missing setting stops the run clearly; empty LEADS/PROSPECTS tabs still work', async () => {
  await reset();
  await api.setSheet('SETTINGS', (await api.sheet('SETTINGS')).filter((r) => r.key !== 'TELEGRAM_OWNER_CHAT_ID'));
  const r = await poll(gmail({ thread: 'a', text: 'hello' }));
  const failure = await lastError();
  T.check(r.status === 500 && failure.error.node === 'Lane 7 · Settings to object' && failure.error.message.includes('TELEGRAM_OWNER_CHAT_ID'), `error names the missing key: "${failure.error?.message}"`);
  await reset();
  await api.setSheet('LEADS', []);
  await api.setSheet('PROSPECTS', []);
  const r2 = await poll(gmail({ thread: 'a', from: 'x@example.com', text: 'hello' }));
  T.eq(r2.status, 200, 'empty tabs: run finished');
  T.eq(evOf(await events(), 'reply_unmatched').length, 1, 'logged as unmatched');
});

await T.scenario('16b · malformed mails (no sender, no id, no text, no thread) never crash the run', async () => {
  await reset();
  const r = await poll({}, { id: 'x1' }, { id: 'x2', from: 'garbage', text: null, subject: null }, { id: 'x3', from: { value: [] }, text: 'hello' }, gmail({ thread: 'nope', from: 'ok@example.com', text: 'hello', id: 'x4' }));
  T.eq(r.status, 200, 'run finished');
  const ev = await events();
  T.eq(evOf(ev, 'reply_unmatched').length, 5, 'all five are logged as unmatched');
  T.eq((await api.calls('sheet_update')).length, 0, 'no row touched');
  T.check(evOf(ev, 'error').every((e) => e.detail.includes('Could not mark the mail read') || e.entity_id === ''), 'at worst a mark-read problem is logged');
});

await T.scenario('16c · a failing row update (Sheets) does not stop the other mails; the failure is logged and the alert still goes out', async () => {
  await reset({ config: { sheetFailWhen: [{ tab: 'PROSPECTS', op: 'update', field: 'prospect_id', value: 'PR-B04' }] } });
  await prospectThread('PR-B04', 'thr-5');
  await prospectThread('PR-I01', 'thr-I1');
  const r = await poll(gmail({ thread: 'thr-5', text: 'Yes please send the lookbook' }), gmail({ thread: 'thr-I1', text: 'Yes please send the lookbook' }));
  T.eq(r.status, 200, 'run finished');
  T.eq((await rowOf('PROSPECTS', 'PR-I01')).status, 'interested', 'the second mail was processed normally');
  T.eq((await rowOf('PROSPECTS', 'PR-B04')).status, 'contacted', 'the failed row is unchanged');
  const ev = await events();
  const err = evOf(ev, 'error');
  T.check(err.length === 1 && err[0].detail.startsWith('Row update failed') && meta(err[0]).node === 'Lane 7 · Update PROSPECTS row', `error event: ${err[0]?.detail}`);
  T.eq((await telegrams()).length, 2, 'both alerts were still sent');
  T.eq((await marked()).length, 2, 'both mails marked read');
});

// ---------- the demo reply form ----------
const form = (address, type) => n8n.fire('lane7-form', { 'Reply to email sent to': address, 'Reply type': type });
const demoMail = (address) => [{ id: 'dm-1', threadId: 'thr-9', From: 'Kaya Jewels (Demo) <kayademo.hello@gmail.com>', To: address, Subject: 'hello' }];

await T.scenario('17 · demo reply form: each reply type replies in the same thread with canned text and logs demo_reply_simulated', async () => {
  const cases = [['Interested', 'interested', 'Yes please, this looks lovely. Could you send me the lookbook?'], ['Question', 'question', 'Thanks for writing! Could you tell me a bit more about how this would work for us?'], ['Not now', 'not_now', 'Not now, but maybe later in the new year.'], ['Unsubscribe', 'unsubscribe', 'Please unsubscribe me from these emails.']];
  for (const [label, key, snippet] of cases) {
    const address = 'kayademo.customers+boutique1@gmail.com';
    await reset({ config: { demoMailbox: demoMail(address) } });
    const r = await form(address, label);
    T.eq(r.status, 200, `${label}: form run finished`);
    const lookup = (await api.calls('gmail_getall'))[0];
    T.eq(lookup.payload.q, `from:kayademo.hello@gmail.com to:${address}`, `${label}: search = from:<SENDER_EMAIL> to:<address>`);
    const reply = (await api.calls('gmail_reply'))[0];
    T.check(!!reply && reply.payload.message_id === 'dm-1' && reply.payload.html.includes(snippet), `${label}: replied to the found message with the canned text`);
    T.eq(reply.payload.to, 'kayademo.hello@gmail.com', `${label}: the reply goes to the sender address`);
    const ev = evOf(await events(), 'demo_reply_simulated');
    T.check(ev.length === 1 && ev[0].entity_type === 'prospect' && ev[0].entity_id === 'PR-B01' && meta(ev[0]).reply_type === key, `${label}: demo_reply_simulated for PR-B01 with reply_type ${key}`);
  }
  await reset({ config: { demoMailbox: demoMail('kayademo.customers+lead01@gmail.com') } });
  await form('kayademo.customers+lead01@gmail.com', 'Question');
  const lead = evOf(await events(), 'demo_reply_simulated')[0];
  T.check(lead.entity_type === 'lead', 'an address that belongs to a lead is logged as a lead');
});

await T.scenario('18 · demo reply form: nothing found / bad answers / failed reply are logged as errors, nothing breaks', async () => {
  await reset({ config: { demoMailbox: [] } });
  let r = await form('kayademo.customers+boutique1@gmail.com', 'Interested');
  T.eq(r.status, 200, 'no mail found: run finished');
  T.eq((await api.calls('gmail_reply')).length, 0, 'no reply was sent');
  T.check(evOf(await events(), 'error').some((e) => e.detail.includes('no email from kayademo.hello@gmail.com')), 'error says nothing was found');
  await reset({ config: { demoMailbox: demoMail('x') } });
  r = await form('not an address', 'Interested');
  T.eq(r.status, 200, 'bad address: run finished');
  T.check(evOf(await events(), 'error').some((e) => e.detail.includes('not a single valid email address')), 'bad address logged');
  T.eq((await api.calls('gmail_getall')).length, 0, 'and Gmail was not even searched');
  await reset({ config: { demoMailbox: [{ id: 'dm-7', threadId: 't', From: 'Someone Else <other@example.com>' }] } });
  r = await form('kayademo.customers+boutique1@gmail.com', 'Interested');
  T.eq((await api.calls('gmail_reply')).length, 0, 'newest mail not from the sender: no reply');
  await reset({ config: { demoMailbox: demoMail('kayademo.customers+boutique1@gmail.com'), gmailReplyFail: true } });
  r = await form('kayademo.customers+boutique1@gmail.com', 'Interested');
  T.eq(r.status, 200, 'reply failure: run finished');
  T.check(evOf(await events(), 'error').some((e) => e.detail.includes('Simulated reply failed')), 'failed reply logged');
  T.eq((await api.calls('gmail_reply')).length, 1, 'reply was not retried');
});

const failed = T.summary();
await n8n.stop();
mock.close();
process.exit(failed ? 1 : 0);
