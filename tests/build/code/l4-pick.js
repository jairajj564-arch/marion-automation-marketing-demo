// Works out which leads are due for their next WAITLIST_NURTURE email and prepares everything the loop needs
// (rendered subject + HTML, recipient, what to write back). One output item per lead; nothing due = no items = quiet end.
const S = $('Lane LANE_N · Settings to object').first().json;
//@include time
//@include render
const now = $now.setZone(TZ);
const SEQUENCE_ID = 'WAITLIST_NURTURE';

const leads = rowsOf('Lane LANE_N · Read LEADS');
const steps = rowsOf('Lane LANE_N · Read SEQUENCES')
  .filter((row) => String(row.sequence_id).trim() === SEQUENCE_ID && isTrue(row.active))
  .map((row) => ({ ...row, step: Number(row.step) }))
  .filter((row) => Number.isInteger(row.step) && row.step > 0)
  .sort((a, b) => a.step - b.step);
const stepByNumber = new Map(steps.map((row) => [row.step, row]));

// ---- BRIEF values used as placeholders. BRIEF text may itself contain {{launch_date}} style tokens, so fill those first.
const realLaunch = parseDate(S.LAUNCH_DATE);
const dateText = (d) => (d ? d.setLocale('en').toFormat('cccc, d LLLL') : '');
const base = {
  launch_date: dateText(realLaunch),
  public_launch_date: dateText(realLaunch?.plus({ days: Number(S.EARLY_ACCESS_DAYS) })),
  waitlist_form_url: S.WAITLIST_FORM_URL,
  sender_name: S.SENDER_NAME,
  unsubscribe_line: S.UNSUBSCRIBE_LINE,
};
const brief = {};
for (const row of rowsOf('Lane LANE_N · Read BRIEF')) {
  const key = String(row.key ?? '').trim();
  if (key) brief[key] = String(row.value ?? '').trim();
}
// The discount code is only revealed by Lane 5 on launch day, so it is never a Lane 4 placeholder.
const briefValues = {};
for (const key of ['brand_name', 'brand_instagram', 'collection_name', 'founder_name', 'offer_percent']) {
  if (brief[key] !== undefined) briefValues[key] = render(brief[key], base).text;
}
const common = { ...base, ...briefValues };

const out = [];
const problem = (lead, message, extra = {}) => out.push({ json: { action: 'skip', needs_email: false, lead_id: String(lead?.lead_id ?? '').trim(), row_number: lead?.row_number ?? '', pick_error: message, ...extra } });

if (!steps.length) {
  // No active steps at all means SEQUENCES is misconfigured, so do NOT mark anyone as finished.
  const anyDue = leads.some((lead) => ['new', 'nurturing'].includes(String(lead.status).trim()) && isTrue(lead.consent));
  if (anyDue) problem(null, `no active ${SEQUENCE_ID} steps in SEQUENCES`, { entity_type: 'sequence', entity_id: SEQUENCE_ID });
  return out;
}

const candidates = [];
for (const lead of leads) {
  const status = String(lead.status ?? '').trim();
  if (!['new', 'nurturing'].includes(status)) continue;
  if (!isTrue(lead.consent)) continue;
  if (String(lead.email_allowed ?? '').trim().toUpperCase() === 'FALSE') continue;
  const nextRaw = String(lead.next_action_at ?? '').trim();
  const lastRaw = String(lead.last_contacted_at ?? '').trim();
  const bad = [];
  if (nextRaw && !parseTs(nextRaw)) bad.push('next_action_at');
  if (lastRaw && !parseTs(lastRaw)) bad.push('last_contacted_at');
  if (bad.length) { problem(lead, `invalid value in ${bad.join(', ')}`); continue; }
  const next = parseTs(nextRaw);
  if (next && next.toMillis() > now.toMillis()) continue;      // not due yet
  if (!gapOk(lead, now)) continue;                              // too soon after the last email of any lane
  candidates.push({ lead, sortKey: next ? next.toMillis() : 0 });
}
candidates.sort((a, b) => a.sortKey - b.sortKey);

let sends = 0;
const maxSends = Math.max(0, Number(S.MAX_SENDS_PER_RUN) || 0);
for (const { lead } of candidates) {
  const leadId = String(lead.lead_id ?? '').trim();
  const email = String(lead.email ?? '').trim().toLowerCase();
  const missingFields = [];
  if (!leadId) missingFields.push('lead_id');
  if (!email) missingFields.push('email');
  const seqStepRaw = String(lead.seq_step ?? '').trim();
  const seqStep = seqStepRaw === '' ? 0 : Number(seqStepRaw);
  if (!Number.isInteger(seqStep) || seqStep < 0) missingFields.push('seq_step');
  if (missingFields.length) { problem(lead, `missing or invalid ${missingFields.join(', ')}`); continue; }

  const step = seqStep + 1;
  const stepRow = stepByNumber.get(step);
  const status = String(lead.status).trim();
  if (!stepRow) {
    out.push({ json: { action: 'complete', needs_email: false, lead_id: leadId, status_from: status, sequence_id: SEQUENCE_ID, step: seqStep } });
    continue;
  }
  if (sends >= maxSends) break;

  const text = render(stepRow.subject_template, { ...common, first_name: lead.first_name, city: lead.city });
  const html = render(stepRow.body_template, {
    ...common, first_name: escapeHtml(lead.first_name), city: escapeHtml(lead.city),
  });
  const missingTokens = [...new Set([...text.missing, ...html.missing])];
  if (missingTokens.length) { problem(lead, `template ${stepRow.step_key} has empty or unknown placeholder(s): ${missingTokens.join(', ')}`); continue; }

  const nextStep = stepByNumber.get(step + 1);
  const isLast = !nextStep;
  out.push({
    json: {
      action: 'send', needs_email: true, lead_id: leadId, to_email: email, subject: text.text.replace(/\s+/g, ' ').trim(), html: html.text,
      sender_name: S.SENDER_NAME, sequence_id: SEQUENCE_ID, step, step_key: stepRow.step_key, is_last: isLast,
      next_delay_days: isLast ? null : Number(nextStep.delay_days),
      status_from: status, thread_ids_before: String(lead.thread_ids ?? ''),
    },
  });
  sends++;
}
return out;
