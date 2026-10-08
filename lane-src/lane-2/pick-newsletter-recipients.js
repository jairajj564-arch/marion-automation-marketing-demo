// Lane 2 · Pick newsletter recipients
// Input: every LEADS row. Output: up to MAX_SENDS_PER_RUN recipients with the email already rendered.
// If nobody can be mailed right now it outputs one "summary" item (recipient_count 0) so the run can
// still decide whether the whole broadcast is finished.
const S = $('Lane 2 · Settings to object').first().json;
/*@include time*/
const letter = $('Lane 2 · Pick due content').all().map((item) => item.json).find((json) => json.kind === 'newsletter');

const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function render(template, values) {
  const missing = new Set();
  const text = String(template ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key) => {
    if (values[key] === undefined || values[key] === null) { missing.add(key); return token; }
    return String(values[key]);
  });
  return { text, missing: [...missing] };
}
const clean = (value) => String(value ?? '').trim();
const csv = (value) => clean(value).split(',').map((part) => part.trim()).filter(Boolean);
const ACTIVE = ['new', 'nurturing', 'nurture_done', 'replied', 'hot'];                  // SPEC 3.2
const isActive = (lead) => ACTIVE.includes(clean(lead.status).toLowerCase())
  && isTrue(lead.consent) && clean(lead.email_allowed).toUpperCase() !== 'FALSE';

const leads = $input.all().map((item) => item.json).filter((lead) => clean(lead?.lead_id) !== '');
const already = leads.filter((lead) => clean(lead.last_newsletter_id) === letter.content_id);
const waiting = leads.filter((lead) => isActive(lead) && clean(lead.last_newsletter_id) !== letter.content_id);
const ready = waiting.filter((lead) => gapOk(lead, now));                                // gap rule (SPEC 5.3)
const chosen = ready.slice(0, Number(S.MAX_SENDS_PER_RUN));

const launch = parseDate(S.LAUNCH_DATE);
const fmt = (d) => (d ? d.toFormat('cccc, d LLLL') : '');
const shared = {
  unsubscribe_line: S.UNSUBSCRIBE_LINE, launch_date: fmt(launch),
  public_launch_date: fmt(launch && launch.plus({ days: Number(S.EARLY_ACCESS_DAYS) })),
  waitlist_form_url: S.WAITLIST_FORM_URL, sender_name: S.SENDER_NAME,
};
const ctx = { content_id: letter.content_id, prior_sent: already.length, remaining_before: waiting.length };

if (!chosen.length) return [{ json: { kind: 'summary', recipient_count: 0, ctx } }];

return chosen.map((lead) => {
  const firstName = clean(lead.first_name) || 'there';
  const textValues = { ...shared, first_name: firstName, city: clean(lead.city) };       // for the subject (plain text)
  const htmlValues = Object.fromEntries(Object.entries(textValues).map(([k, v]) => [k, escapeHtml(v)]));   // for the body (HTML)
  const subject = render(letter.title, textValues).text.replace(/[\r\n]+/g, ' ').trim();
  let html = render(letter.body, htmlValues).text;
  if (!/\{\{\s*unsubscribe_line\s*\}\}/.test(letter.body)) html += `\n<p>${htmlValues.unsubscribe_line}</p>`;   // always give people a way out
  return { json: {
    kind: 'recipient', recipient_count: chosen.length, ctx,
    lead_id: clean(lead.lead_id), to_email: clean(lead.email).toLowerCase(), lead_status: clean(lead.status),
    thread_ids: clean(lead.thread_ids), content_id: letter.content_id,
    subject, html, sender_name: S.SENDER_NAME,
  } };
});
