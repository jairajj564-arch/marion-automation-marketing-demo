// Works out what the launch needs RIGHT NOW and prepares it (SPEC 7.5):
//  - at most one channel post (the latest due step that is not done yet), plus the stale older steps to mark as done
//  - up to MAX_SENDS_PER_RUN launch emails (the highest due email step) for active leads that have not got it yet
// Output: one item per piece of work; nothing to do = no items = quiet end.
const S = $('Lane LANE_N · Settings to object').first().json;
//@include time
//@include render
const now = $now.setZone(TZ);
const SEQUENCE_ID = 'LAUNCH_BROADCAST';
const out = [];
const problem = (message, extra = {}) => out.push({ json: { kind: 'skip', is_post: false, needs_email: false, pick_error: message, entity_type: 'sequence', entity_id: SEQUENCE_ID, ...extra } });

// ---- when is the launch?
const T0 = launchAt(S);
if (!T0) {
  const demoBlank = S.IS_DEMO && String(S.DEMO_LAUNCH_AT ?? '').trim() === '';
  if (demoBlank) return [];                                           // demo mode, no launch moment chosen: nothing to do, quietly
  problem(S.IS_DEMO ? 'DEMO_LAUNCH_AT is not a valid timestamp' : 'LAUNCH_DATE / LAUNCH_TIME are not valid');
  return out;
}

// ---- steps
const steps = [];
for (const row of rowsOf('Lane LANE_N · Read SEQUENCES')) {
  if (String(row.sequence_id).trim() !== SEQUENCE_ID || !isTrue(row.active)) continue;
  const step = Number(row.step);
  const delay = Number(String(row.delay_days).trim() === '' ? NaN : row.delay_days);
  const basis = String(row.delay_basis ?? '').trim();
  if (!Number.isInteger(step) || step < 1 || !Number.isFinite(delay) || basis !== 'launch') {
    problem(`step ${row.step_key || '?'} has an invalid step, delay_days or delay_basis (must be a number and "launch")`, { entity_id: row.step_key || SEQUENCE_ID });
    continue;
  }
  steps.push({ ...row, step, due_at: addDays(T0, delay) });
}
const due = steps.filter((row) => row.due_at.toMillis() <= now.toMillis());
if (!due.length) return out;

// ---- placeholders (BRIEF text may contain {{launch_date}} style tokens, so fill those first)
const realLaunch = parseDate(S.LAUNCH_DATE);
const dateText = (d) => (d ? d.setLocale('en').toFormat('cccc, d LLLL') : '');
const base = {
  launch_date: dateText(realLaunch),
  public_launch_date: dateText(realLaunch?.plus({ days: Number(S.EARLY_ACCESS_DAYS) })),
  waitlist_form_url: S.WAITLIST_FORM_URL, sender_name: S.SENDER_NAME, unsubscribe_line: S.UNSUBSCRIBE_LINE,
};
const brief = {};
for (const row of rowsOf('Lane LANE_N · Read BRIEF')) { const key = String(row.key ?? '').trim(); if (key) brief[key] = String(row.value ?? '').trim(); }
const briefValues = {};
for (const key of ['brand_name', 'brand_instagram', 'collection_name', 'founder_name', 'offer_percent', 'offer_code']) {
  if (brief[key] !== undefined) briefValues[key] = render(brief[key], base).text;
}
// The discount code may only appear in the launch EMAIL, never in the public channel post.
const { offer_code: offerCode, ...briefPublic } = briefValues;

// ---- channel post: only the latest undone due step is posted, older undone ones are marked done without posting
const undoneChannel = due
  .filter((row) => String(row.channel).trim() === 'telegram_channel' && String(row.broadcast_done_at ?? '').trim() === '')
  .sort((a, b) => a.due_at.toMillis() - b.due_at.toMillis() || a.step - b.step);
if (undoneChannel.length) {
  const latest = undoneChannel[undoneChannel.length - 1];
  const stale = undoneChannel.slice(0, -1).map((row) => row.step_key);
  const post = render(latest.body_template, Object.fromEntries(Object.entries({ ...base, ...briefPublic }).map(([k, v]) => [k, escapeHtml(v)])));
  if (post.missing.length) problem(`channel post ${latest.step_key} has empty or unknown placeholder(s): ${post.missing.join(', ')}`, { entity_id: latest.step_key });
  else out.push({ json: { kind: 'post', is_post: true, needs_email: false, chat_id: String(S.TELEGRAM_CHANNEL_ID), text: post.text.slice(0, 4000), step_key: latest.step_key, stale_keys: stale } });
}

// ---- emails: k = highest due email step; every active lead with launch_step < k gets exactly that step
const emailSteps = due.filter((row) => String(row.channel).trim() === 'email').sort((a, b) => a.step - b.step);
if (emailSteps.length) {
  const stepRow = emailSteps[emailSteps.length - 1];
  const k = stepRow.step;
  const ACTIVE = ['new', 'nurturing', 'nurture_done', 'replied', 'hot'];
  // Cross-lane guard (session 5): Lane 4 reads LEADS at :15 and this lane at :30, and both runs can last ~45 s, so the
  // gap rule alone cannot see an email the other lane is sending right now. A lead Lane 4 will email within the next
  // minute (status new/nurturing, next_action_at blank or due by then) is left to Lane 4; once that email is in its
  // row, the gap rule spaces the launch email. Lane 4 re-reads the row before sending, which covers the other direction.
  const NURTURE_HORIZON_MS = 60 * 1000;
  const reservedForNurture = (lead) => ['new', 'nurturing'].includes(String(lead.status ?? '').trim())
    && (!parseTs(lead.next_action_at) || parseTs(lead.next_action_at).toMillis() <= now.toMillis() + NURTURE_HORIZON_MS);
  const maxSends = Math.max(0, Number(S.MAX_SENDS_PER_RUN) || 0);
  let sends = 0;
  for (const lead of rowsOf('Lane LANE_N · Read LEADS')) {
    if (sends >= maxSends) break;
    if (!ACTIVE.includes(String(lead.status ?? '').trim())) continue;
    if (!isTrue(lead.consent)) continue;
    if (String(lead.email_allowed ?? '').trim().toUpperCase() === 'FALSE') continue;
    const leadId = String(lead.lead_id ?? '').trim();
    const email = String(lead.email ?? '').trim().toLowerCase();
    const stepRaw = String(lead.launch_step ?? '').trim();
    const launchStep = stepRaw === '' ? 0 : Number(stepRaw);
    const bad = [];
    if (!leadId) bad.push('lead_id');
    if (!email) bad.push('email');
    if (!Number.isInteger(launchStep) || launchStep < 0) bad.push('launch_step');
    if (String(lead.last_contacted_at ?? '').trim() && !parseTs(lead.last_contacted_at)) bad.push('last_contacted_at');
    if (launchStep < k || bad.length) {
      if (bad.length) { problem(`missing or invalid ${bad.join(', ')}`, { entity_type: 'lead', entity_id: leadId || `row ${lead.row_number ?? '?'}` }); continue; }
    } else continue;                                               // already has this (or a later) launch email
    if (!gapOk(lead, now)) continue;                               // too soon after any other automated email
    if (reservedForNurture(lead)) continue;                        // Lane 4 is about to email this lead
    const common = { ...base, ...briefPublic, ...(offerCode !== undefined ? { offer_code: offerCode } : {}) };
    const text = render(stepRow.subject_template, { ...common, first_name: lead.first_name, city: lead.city });
    const html = render(stepRow.body_template, { ...common, first_name: escapeHtml(lead.first_name), city: escapeHtml(lead.city) });
    const missingTokens = [...new Set([...text.missing, ...html.missing])];
    if (missingTokens.length) { problem(`template ${stepRow.step_key} has empty or unknown placeholder(s): ${missingTokens.join(', ')}`, { entity_type: 'lead', entity_id: leadId }); continue; }
    out.push({
      json: {
        kind: 'email', is_post: false, needs_email: true, lead_id: leadId, to_email: email,
        subject: text.text.replace(/\s+/g, ' ').trim(), html: html.text, sender_name: S.SENDER_NAME,
        sequence_id: SEQUENCE_ID, step: k, step_key: stepRow.step_key,
        status_from: String(lead.status).trim(), thread_ids_before: String(lead.thread_ids ?? ''),
      },
    });
    sends++;
  }
}
return out;
