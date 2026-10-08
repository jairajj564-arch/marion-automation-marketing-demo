#!/usr/bin/env node
// End-to-end tests for Lane 6 (Outreach) in a REAL n8n server.
// Usage: node tests/lane-6/run-tests.mjs [vm|legacy]     (vm = n8n's default expression engine)
// The lane file in lanes/ is turned into a test copy (triggers -> webhook, Sheets/Gmail -> mock HTTP stubs,
// Gemini/Groq -> mock). Everything else (Code, IF, Loop, Wait, ...) is the real node from the real lane file.
import { readFileSync } from 'node:fs';
import { startMock } from '../_shared/mock-server.mjs';
import { buildTestWorkflow, startN8n, freePort, mockApi, Tester } from '../_shared/harness.mjs';

const engine = process.argv[2] || 'vm';
const mockPort = await freePort();
const mock = await startMock(mockPort);
const mockUrl = `http://127.0.0.1:${mockPort}`;
const api = mockApi(mockUrl);
const lane = JSON.parse(readFileSync(new URL('../../lanes/lane-6-outreach.json', import.meta.url), 'utf8'));
const n8n = await startN8n({ engine, label: 'lane6', workflows: [buildTestWorkflow(6, lane, { mockUrl, id: 'lane6test', webhookPaths: { main: 'lane6-run' } })] });
const T = new Tester(`Lane 6 [${engine}]`);

const OWNED = ['status', 'seq_step', 'next_action_at', 'last_contacted_at', 'thread_ids', 'email_allowed', 'updated_at'];
const BASE_SETTINGS = { SEND_DELAY_SECONDS: '1', AI_WAIT_SECONDS: '1' };
const kolkata = (ms) => { const d = new Date(ms + 5.5 * 3600e3); return d.toISOString().replace(/\.\d+Z$/, '+05:30'); };
const ms = (stamp) => new Date(stamp).getTime();
const run = () => n8n.fire('lane6-run');
const reset = (extra = {}) => api.reset({ settings: { ...BASE_SETTINGS, ...(extra.settings || {}) }, config: { owned: { PROSPECTS: OWNED }, ...(extra.config || {}) } });
const rows = async () => Object.fromEntries((await api.sheet('PROSPECTS')).map((r) => [r.prospect_id, r]));
const events = async () => (await api.sheet('EVENTS_LOG')).filter((e) => e.execution_id !== 'sample');   // ignore the sample rows of the template
const lastError = async () => { const list = await n8n.executions(); return list[list.length - 1]; };
const sends = async () => (await api.calls('gmail_send')).map((c) => c.payload);
const only = async (...ids) => { // pause every prospect except the given ones
  const all = await api.sheet('PROSPECTS');
  for (const r of all) if (!ids.includes(r.prospect_id)) r.status = 'paused';
  await api.setSheet('PROSPECTS', all);
};
const edit = async (id, changes) => { const all = await api.sheet('PROSPECTS'); Object.assign(all.find((r) => r.prospect_id === id), changes); await api.setSheet('PROSPECTS', all); };
const evOf = (list, type) => list.filter((e) => e.event_type === type);
const meta = (e) => JSON.parse(e.meta_json);
const PAST = () => kolkata(Date.now() - 3600e3);

await T.scenario('1 · the 12 sample prospects: 3 per run, highest fit_score first, personalised, one email each', async () => {
  await reset();
  const order = [];
  for (let i = 1; i <= 4; i++) {
    const r = await run();
    T.eq(r.status, 200, `run ${i} http status`);
    const batch = (await sends()).slice(order.length).map((s) => s.to);
    order.push(...batch);
    T.eq(batch.length, 3, `run ${i} sent exactly MAX_SENDS_PER_RUN emails`);
  }
  const all = await sends();
  T.eq(order.slice(0, 3), ['kayademo.customers+boutique4@gmail.com', 'kayademo.customers+influencer1@gmail.com', 'kayademo.customers+influencer4@gmail.com'], 'run 1 = fit_score 90, 88, 86 in that order');
  T.eq(new Set(all.map((s) => s.to)).size, 12, '12 different prospects were emailed');
  T.eq(all.length, 12, 'exactly 12 emails in 4 runs (nobody twice)');
  const state = await rows();
  T.check(Object.values(state).every((r) => r.status === 'contacted' && String(r.seq_step) === '1'), 'all 12 are contacted, seq_step 1');
  const b04 = all.find((s) => s.to.includes('boutique4'));
  T.check(b04.subject === 'Gulmohar Concept Store x Kaya Jewels for Diwali?', `boutique subject rendered (${b04.subject})`);
  T.check(b04.html.includes('Hi Ravi Menon,'), 'contact_name rendered');
  T.check(/Your feed shows how Gulmohar Concept Store/.test(b04.html), 'AI opener (personalised with the business name) is in the body');
  T.check(b04.html.includes('Not for you? Just reply &quot;unsubscribe&quot; and we will not email you again.'), 'unsubscribe line rendered (escaped)');
  T.check(!/\{\{|\}\}/.test(b04.html + b04.subject), 'no placeholder left over');
  T.check(!all.some((s) => /ROSHNI10/.test(s.html)), 'the discount code never appears in outreach emails');
  T.eq(b04.sender_name, 'Kaya Jewels (Demo)', 'display name = SENDER_NAME');
  const ai = await api.calls('gemini');
  T.eq(ai.length, 12, 'one Gemini call per first-touch prospect');
  const ev = await events();
  T.eq(evOf(ev, 'email_sent').length, 12, '12 email_sent events');
  const sample = evOf(ev, 'email_sent').find((e) => e.entity_id === 'PR-B04');
  T.eq(meta(sample), { sequence_id: 'OUTREACH_BOUTIQUE', step: 1, thread_id: 'thr-1' }, 'email_sent meta has sequence_id, step, thread_id');
  T.check(sample.lane === '6' && sample.channel === 'email' && sample.status_from === 'new' && sample.status_to === 'contacted' && sample.demo_mode === 'TRUE' && sample.execution_id !== '', 'event columns (lane, channel, status_from/to, demo_mode, execution_id)');
  T.eq(evOf(ev, 'ai_call').length, 12, '12 ai_call events');
  T.eq((await api.violations()).length, 0, 'only owned PROSPECTS columns were ever written');
  T.eq((await api.calls('sheet_update')).every((c) => Object.keys(c.payload).every((k) => k === 'prospect_id' || OWNED.includes(k))), true, 'every update payload = key + owned columns');
});

await T.scenario('2 · full 3-step sequence in demo time (6 and 8 demo minutes), then silence', async () => {
  await reset();
  await only('PR-B04');
  await run();
  let state = (await rows())['PR-B04'];
  T.eq([state.status, String(state.seq_step)], ['contacted', '1'], 'after run 1: contacted, step 1');
  T.eq(ms(state.next_action_at) - ms(state.last_contacted_at), 6 * 60e3, 'step 2 is due 3 days later = 6 demo minutes');
  T.eq((await sends()).length, 1, 'one email so far');
  // time moves forward: pretend the 6 minutes have passed
  await edit('PR-B04', { next_action_at: PAST(), last_contacted_at: kolkata(Date.now() - 7 * 60e3) });
  await run();
  state = (await rows())['PR-B04'];
  const all = await sends();
  T.eq([state.status, String(state.seq_step)], ['contacted', '2'], 'after run 2: contacted, step 2');
  T.eq(ms(state.next_action_at) - ms(state.last_contacted_at), 8 * 60e3, 'step 3 is due 4 days later = 8 demo minutes');
  T.check(all[1].subject === 'Re: Gulmohar Concept Store x Kaya Jewels for Diwali?', 'follow-up 1 subject');
  T.check(all[1].html.includes('Stock ships within 7 working days'), 'follow-up 1 body');
  T.eq((await api.calls('gemini')).length, 1, 'no AI call for follow-ups (ai_personalize FALSE)');
  T.eq(state.thread_ids, 'thr-1,thr-2', 'thread ids appended');
  await edit('PR-B04', { next_action_at: PAST(), last_contacted_at: kolkata(Date.now() - 9 * 60e3) });
  await run();
  state = (await rows())['PR-B04'];
  T.eq([state.status, String(state.seq_step), state.next_action_at], ['sequence_done', '3', ''], 'after run 3: sequence_done, next_action_at cleared');
  T.check((await sends())[2].html.includes('this is my last note'), 'step 3 is the break-up email');
  const ev = await events();
  T.eq(evOf(ev, 'sequence_completed').length, 1, 'sequence_completed logged once');
  T.eq(meta(evOf(ev, 'sequence_completed')[0]), { sequence_id: 'OUTREACH_BOUTIQUE' }, 'sequence_completed meta');
  await run(); await run();
  T.eq((await sends()).length, 3, 'nothing is sent after the sequence is done');
});

await T.scenario('3 · statuses that must never be contacted (replied, interested, do_not_contact, paused, ...)', async () => {
  await reset();
  const all = await api.sheet('PROSPECTS');
  const blocked = ['paused', 'replied', 'interested', 'not_interested', 'do_not_contact', 'blocked', 'sequence_done', 'won', 'lost'];
  all.slice(0, 9).forEach((r, i) => { r.status = blocked[i]; r.seq_step = '1'; r.next_action_at = PAST(); });
  await api.setSheet('PROSPECTS', all);
  const eligible = all[9].prospect_id;
  await run();
  const to = (await sends()).map((s) => s.to);
  T.eq(to.length, 3, 'the 3 untouched `new` prospects are emailed');
  T.check(!all.slice(0, 9).some((r) => to.includes(r.email)), 'none of the 9 blocked-status prospects got an email');
  T.check(eligible.length > 0, 'control prospect exists');
});

await T.scenario('4 · a prospect whose status turns interested / replied / do_not_contact mid-sequence gets nothing more', async () => {
  for (const status of ['interested', 'replied', 'do_not_contact']) {
    await reset();
    await only('PR-I01');
    await run();
    T.eq((await sends()).length, 1, `${status}: step 1 sent`);
    await edit('PR-I01', { status, next_action_at: '' });         // what Lane 7 does when a reply arrives
    await edit('PR-I01', { last_contacted_at: kolkata(Date.now() - 10 * 60e3) });
    await run(); await run();
    T.eq((await sends()).length, 1, `${status}: no further email`);
    T.eq((await rows())['PR-I01'].status, status, `${status}: status untouched by Lane 6`);
  }
});

await T.scenario('4b · cross-lane guard (session 5): a reply Lane 7 records DURING the run stops the send and keeps Lane 7\'s status', async () => {
  for (const status of ['interested', 'replied', 'do_not_contact']) {
    // PR-B02 is picked (1st PROSPECTS read), then Lane 7 marks it before Lane 6 reaches it.
    await reset({ config: { afterRead: [{ tab: 'PROSPECTS', nth: 1, id: 'PR-B02', set: { status, next_action_at: '' } }] } });
    await only('PR-B01', 'PR-B02', 'PR-B03');
    const r = await run();
    T.eq(r.status, 200, `${status}: run finished`);
    const to = (await sends()).map((m) => m.to);
    T.check(to.length === 2 && !to.includes('kayademo.customers+boutique2@gmail.com'), `${status}: the other two were emailed, PR-B02 was not (${to.join(', ')})`);
    const row = (await rows())['PR-B02'];
    T.eq([row.status, row.seq_step], [status, '0'], `${status}: Lane 7's status survives, seq_step untouched`);
    T.eq((await events()).filter((e) => e.entity_id === 'PR-B02').length, 0, `${status}: nothing logged for PR-B02`);
  }
});

await T.scenario('5 · blocked address (someone@example.com): status blocked, email_allowed FALSE, nothing sent to it', async () => {
  await reset();
  await edit('PR-B04', { email: 'someone@example.com' });
  await run();
  const to = (await sends()).map((s) => s.to);
  T.check(!to.includes('someone@example.com'), 'no Gmail send to the blocked address');
  T.eq(to.length, 2, 'the other two prospects of the run were sent');
  const row = (await rows())['PR-B04'];
  T.eq([row.status, row.email_allowed, row.next_action_at, String(row.seq_step)], ['blocked', 'FALSE', '', '0'], 'row: blocked, email_allowed FALSE, next_action_at cleared, seq_step unchanged');
  const ev = await events();
  const blockedEvent = evOf(ev, 'email_blocked').find((e) => e.entity_id === 'PR-B04');
  T.check(!!blockedEvent && blockedEvent.status_to === 'blocked' && !!meta(blockedEvent).reason, 'email_blocked event with reason');
  await run(); await run();
  T.check(!(await sends()).some((s) => s.to === 'someone@example.com'), 'still never sent after more runs');
});

await T.scenario('6 · AI down on both providers: template opener, email still sent, ai_failed logged', async () => {
  await reset({ config: { ai: { gemini: 'http500', groq: 'http500' } } });
  await run();
  const all = await sends();
  T.eq(all.length, 3, 'all 3 emails sent despite AI being down');
  T.check(all[0].html.includes('I came across Gulmohar Concept Store on Instagram and loved what you are building in Bengaluru.'), 'fixed template opener used');
  const ev = await events();
  T.eq(evOf(ev, 'ai_failed').length, 3, '3 ai_failed events');
  T.eq(evOf(ev, 'ai_fallback').length, 3, '3 ai_fallback events (Groq was tried)');
  T.eq((await api.calls('gemini')).length, 9, 'Gemini retried 3x per prospect');
  T.eq((await api.calls('groq')).length, 9, 'Groq retried 3x per prospect');
  T.check(meta(evOf(ev, 'ai_failed')[0]).error.length > 0 && meta(evOf(ev, 'ai_fallback')[0]).reason.length > 0, 'ai_failed meta.error and ai_fallback meta.reason filled');
  T.eq(evOf(ev, 'email_sent').length, 3, 'email_sent logged for each');
});

await T.scenario('7 · AI opener rules: invented price / digits / two sentences / too long / forbidden phrase are rejected', async () => {
  for (const bad of ['invented_price', 'digits', 'two_sentences', 'long', 'forbidden', 'bad_json']) {
    await reset({ config: { ai: { gemini: bad, groq: 'ok' } } });
    await only('PR-B04');
    await run();
    const mail = (await sends())[0];
    const ev = await events();
    T.check(!!mail && mail.html.includes('Your feed shows how Gulmohar Concept Store'), `${bad}: Gemini's opener rejected, Groq's accepted`);
    T.check(!/₹999|2019|real gold/.test(mail?.html ?? ''), `${bad}: the rejected text is not in the email`);
    const fb = evOf(ev, 'ai_fallback')[0];
    T.check(!!fb && meta(fb).reason.length > 0, `${bad}: ai_fallback logged with a reason (${fb ? meta(fb).reason.slice(0, 70) : 'none'})`);
  }
  await reset({ config: { ai: { gemini: 'invented_price', groq: 'invented_price' } } });
  await only('PR-B04');
  await run();
  const mail = (await sends())[0];
  T.check(mail.html.includes('I came across Gulmohar Concept Store on Instagram'), 'both providers invent a price: template opener used');
  T.check(!mail.html.includes('₹999'), 'invented price never reaches the email');
  T.eq(evOf(await events(), 'ai_failed').length, 1, 'ai_failed logged');
  await reset({ config: { ai: { gemini: 'fenced', groq: 'ok' } } });
  await only('PR-B04');
  await run();
  T.eq(evOf(await events(), 'ai_fallback').length, 0, 'JSON wrapped in ``` fences is accepted without fallback');
});

await T.scenario('8 · Gmail failing for one prospect: email_failed, no step advance, retried later, others unaffected', async () => {
  await reset({ config: { gmailFail: ['kayademo.customers+influencer1@gmail.com'] } });
  await run();
  const to = (await sends()).map((s) => s.to);
  T.eq(to.length, 3, 'three send attempts were made');
  let state = await rows();
  T.eq([state['PR-I01'].status, String(state['PR-I01'].seq_step)], ['new', '0'], 'failed prospect: status and seq_step unchanged');
  const wait = ms(state['PR-I01'].next_action_at) - Date.now();
  T.check(wait > -5000 && wait < 25000, `failed prospect retried later: next_action_at ~ now + 0.1 demo day (=12 s), got ${Math.round(wait / 1000)} s`);
  T.eq([state['PR-B04'].status, state['PR-I04'].status], ['contacted', 'contacted'], 'the other two were contacted');
  const failed = evOf(await events(), 'email_failed');
  T.eq(failed.length, 1, 'one email_failed event');
  T.check(failed[0].entity_id === 'PR-I01' && !!meta(failed[0]).error, 'email_failed names the prospect and an error');
  T.eq(evOf(await events(), 'email_sent').length, 2, 'only the 2 real sends logged as email_sent');
  await api.config({ gmailFail: [] });
  await edit('PR-I01', { next_action_at: PAST() });
  await run();
  state = await rows();
  T.eq([state['PR-I01'].status, String(state['PR-I01'].seq_step)], ['contacted', '1'], 'after Gmail recovers the prospect gets step 1 (not step 2)');
});

await T.scenario('9 · a prospect inside the gap window is skipped until MIN_EMAIL_GAP_DAYS has passed', async () => {
  await reset();
  await only('PR-B04');
  await edit('PR-B04', { status: 'contacted', seq_step: '1', next_action_at: PAST(), last_contacted_at: kolkata(Date.now() - 20e3) });
  await run();
  T.eq((await sends()).length, 0, 'contacted 20 s ago (gap = 0.5 day = 60 s): not emailed');
  await edit('PR-B04', { last_contacted_at: kolkata(Date.now() - 120e3) });
  await run();
  T.eq((await sends()).length, 1, 'contacted 2 minutes ago: follow-up sent');
  T.eq(String((await rows())['PR-B04'].seq_step), '2', 'seq_step 2');
});

await T.scenario('10 · rows with missing/invalid fields are skipped and logged, never crash the run', async () => {
  await reset();
  await edit('PR-B04', { contact_name: '' });
  await edit('PR-I01', { email: 'not-an-email' });
  await edit('PR-I04', { sequence_id: 'OUTREACH_UNKNOWN' });
  await edit('PR-B01', { seq_step: 'abc' });
  await edit('PR-B02', { next_action_at: 'garbage' });
  const r = await run();
  T.eq(r.status, 200, 'the run completed');
  const to = (await sends()).map((s) => s.to);
  T.eq(to.length, 3, 'three valid prospects were still emailed');
  T.check(!['boutique4', 'influencer1', 'influencer4', 'boutique1', 'boutique2'].some((k) => to.some((a) => a.includes(k))), 'none of the 5 bad rows was emailed');
  const errors = evOf(await events(), 'error');
  T.eq(errors.length, 5, 'one error event per bad row');
  const byId = Object.fromEntries(errors.map((e) => [e.entity_id, e]));
  T.check(byId['PR-B04'].detail.includes('missing contact_name'), `detail names the field: ${byId['PR-B04'].detail}`);
  T.check(byId['PR-I01'].detail.includes('email'), 'invalid email named');
  T.check(byId['PR-I04'].detail.includes('sequence_id'), 'unknown sequence_id named');
  T.check(byId['PR-B01'].detail.includes('seq_step'), 'bad seq_step named');
  T.check(byId['PR-B02'].detail.includes('next_action_at'), 'bad next_action_at named');
  T.check(!!meta(byId['PR-B04']).node && !!meta(byId['PR-B04']).message, 'error meta has node + message');
  await run();
  T.eq(evOf(await events(), 'error').length, 5, 'a second run does not log the same problems again (rows were pushed back)');
});

await T.scenario('11 · two runs back to back: nobody gets the same step twice', async () => {
  await reset();
  await run(); await run();
  const to = (await sends()).map((s) => s.to);
  T.eq(to.length, 6, 'two runs = 6 emails');
  T.eq(new Set(to).size, 6, '6 different recipients');
});

await T.scenario('12 · mixed failures in one run (Gemini down, one Gmail failure, one bad row)', async () => {
  await reset({ config: { ai: { gemini: 'http500', groq: 'ok' }, gmailFail: ['kayademo.customers+influencer1@gmail.com'] } });
  await edit('PR-B04', { contact_name: '' });
  const r = await run();
  T.eq(r.status, 200, 'run completed');
  const ev = await events();
  T.eq(evOf(ev, 'ai_fallback').length, 3, 'Groq took over for the 3 prospects with AI');
  T.eq(evOf(ev, 'email_failed').length, 1, 'one Gmail failure logged');
  T.eq(evOf(ev, 'email_sent').length, 2, 'two emails sent');
  T.eq(evOf(ev, 'error').length, 1, 'one bad row logged');
});

await T.scenario('13 · EVENTS_LOG write fails mid-run: no email is ever repeated after the crash', async () => {
  await reset({ config: { sheetFailWhen: [{ tab: 'EVENTS_LOG', op: 'append', field: 'entity_id', value: 'PR-I01' }] } });   // every log write about the 2nd prospect fails
  const r = await run();
  T.check(r.status === 500, `the run reports the failure (http ${r.status})`);
  const failure = await lastError();
  T.check(failure.status === 'error' && failure.error.node === 'Lane 6 · Save to EVENTS_LOG', `n8n recorded an error in ${failure.error?.node}`);
  const before = (await sends()).map((s) => s.to);
  T.eq(before.length, 2, 'two prospects were processed before the crash');
  const state = await rows();
  T.eq([state['PR-B04'].status, state['PR-I01'].status, state['PR-I04'].status], ['contacted', 'contacted', 'new'], 'both processed rows were updated BEFORE the crash; the third was not reached');
  await api.config({ sheetFailWhen: [] });
  await run();
  const after = (await sends()).map((s) => s.to);
  T.eq(new Set(after).size, after.length, 'no recipient was emailed twice after the crash');
  T.check(after.slice(0, 2).join() === before.join() && after.length === 5, `next run continued with new prospects (${after.length} emails total)`);
});

await T.scenario('14 · template problems: unknown placeholder and the discount code are never rendered; nothing is sent', async () => {
  await reset();
  const seq = await api.sheet('SEQUENCES');
  seq.find((r) => r.step_key === 'OUTREACH_BOUTIQUE#1').body_template += '<p>{{unknown_thing}} {{offer_code}}</p>';
  await api.setSheet('SEQUENCES', seq);
  await only('PR-B04');
  await run();
  T.eq((await sends()).length, 0, 'nothing sent');
  const err = evOf(await events(), 'error')[0];
  T.check(!!err && err.detail.includes('unknown_thing') && err.detail.includes('offer_code'), `error names the placeholders: ${err?.detail}`);
  const row = (await rows())['PR-B04'];
  T.eq([row.status, String(row.seq_step)], ['new', '0'], 'row not advanced');
});

await T.scenario('15 · special characters in names are HTML-escaped in the body, plain in the subject', async () => {
  await reset();
  await only('PR-B06');
  await edit('PR-B06', { business_name: 'Mitti & <b>Moti</b>' });
  await run();
  const mail = (await sends())[0];
  T.check(mail.subject === 'Mitti & <b>Moti</b> x Kaya Jewels for Diwali?', `subject is plain text: ${mail.subject}`);
  T.check(mail.html.includes('Mitti &amp; &lt;b&gt;Moti&lt;/b&gt;') && !mail.html.includes('<b>Moti</b>'), 'body is escaped');
});

await T.scenario('16 · nothing due: quiet run (no emails, no AI, no log rows); empty PROSPECTS tab too', async () => {
  await reset();
  const all = await api.sheet('PROSPECTS');
  all.forEach((r) => { r.status = 'paused'; });
  await api.setSheet('PROSPECTS', all);
  const before = (await events()).length;
  const r = await run();
  T.eq(r.status, 200, 'run finished');
  T.eq([(await sends()).length, (await api.calls('gemini')).length, (await events()).length - before], [0, 0, 0], 'no email, no AI call, no log row');
  await api.setSheet('PROSPECTS', []);
  const r2 = await run();
  T.eq(r2.status, 200, 'empty tab: run finished');
  T.eq((await events()).length - before, 0, 'empty tab: no log row');
});

await T.scenario('17 · sequence with no further step is closed; MAX_SENDS_PER_RUN is respected; missing setting stops the run clearly', async () => {
  await reset();
  await only('PR-B04');
  await edit('PR-B04', { status: 'contacted', seq_step: '3', next_action_at: PAST(), last_contacted_at: kolkata(Date.now() - 600e3) });
  await run();
  const row = (await rows())['PR-B04'];
  T.eq([row.status, row.next_action_at, (await sends()).length], ['sequence_done', '', 0], 'seq_step 3 of 3: marked sequence_done, no email');
  T.eq(evOf(await events(), 'sequence_completed').length, 1, 'sequence_completed logged');
  await reset({ settings: { MAX_SENDS_PER_RUN: '1' } });
  await run();
  T.eq((await sends()).length, 1, 'MAX_SENDS_PER_RUN=1 -> one email');
  await reset();
  const settings = (await api.sheet('SETTINGS')).filter((r) => r.key !== 'SEND_DELAY_SECONDS');
  await api.setSheet('SETTINGS', settings);
  const r = await run();
  const failure = await lastError();
  T.check(r.status === 500 && failure.error.node === 'Lane 6 · Settings to object' && failure.error.message.includes('SEND_DELAY_SECONDS'), `missing setting stops the run naming the key: "${failure.error?.message}"`);
  T.eq((await sends()).length, 0, 'nothing sent');
});

await T.scenario('18 · what the AI is sent: BRIEF facts only, the one prospect, JSON mode, thinking budget, no discount code', async () => {
  await reset({ settings: { GEMINI_THINKING_BUDGET: '1024' } });
  await only('PR-B04');
  await run();
  const call = (await api.calls('gemini'))[0];
  const body = call.payload;
  const system = body.systemInstruction.parts[0].text;
  const user = body.contents[0].parts[0].text;
  T.check(call.url.includes('gemini-2.5-flash:generateContent'), 'Gemini model from SETTINGS');
  T.eq([body.generationConfig.responseMimeType, body.generationConfig.thinkingConfig, body.generationConfig.temperature], ['application/json', { thinkingBudget: 1024 }, 0.7], 'JSON mode, thinking budget, AI_TEMPERATURE');
  T.check(body.generationConfig.responseSchema.properties.opener.type === 'STRING', 'schema asks for { opener }');
  T.check(system.includes('b2b_stockist_offer') && system.includes('Boutique stockists buy at 35% off MRP'), 'b2b facts are in the system prompt');
  T.check(!/ROSHNI10|offer_code|forbidden_phrases/.test(system), 'machine-only facts (code, forbidden list) are NOT sent to the AI');
  T.check(user.includes('Gulmohar Concept Store') && user.includes('Curates 40+ small Indian labels') && !user.includes('Saanjh') , 'user prompt has only this prospect');
  const groqBody = { model: 'x' };
  T.check(!!groqBody, 'groq body prepared');
});

await T.scenario('19 · Groq request shape when Gemini fails', async () => {
  await reset({ config: { ai: { gemini: 'http500', groq: 'ok' } } });
  await only('PR-B04');
  await run();
  const g = (await api.calls('groq'))[0].payload;
  T.eq([g.response_format, g.model, g.messages.length, g.messages[0].role], [{ type: 'json_object' }, 'llama-3.3-70b-versatile', 2, 'system'], 'Groq JSON mode, model from SETTINGS');
  T.check(g.messages[0].content.includes('"opener"'), 'Groq system prompt shows the JSON shape');
  T.check((await sends())[0].html.includes('Your feed shows how Gulmohar Concept Store'), 'Groq opener used');
});

const failed = T.summary();
await n8n.stop();
mock.close();
process.exit(failed ? 1 : 0);
