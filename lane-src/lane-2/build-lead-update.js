// Lane 2 · Build lead update: right after Gmail accepted the email.
// Output = ONLY the LEADS columns Lane 2 owns (last_newsletter_id, last_contacted_at, thread_ids, updated_at).
/*@include time*/
const S = $('Lane 2 · Settings to object').first().json;
const sent = $input.first().json ?? {};
const lead = $('Lane 2 · Demo safety gate').first().json;          // the recipient of this loop round
const threadId = String(sent.threadId ?? '').trim();
let ids = String(lead.thread_ids ?? '').split(',').map((part) => part.trim()).filter(Boolean);
if (threadId && !ids.includes(threadId)) ids.push(threadId);
ids = ids.slice(-10);                                               // SPEC 2.4: keep the last 10
return [{ json: {
  lead_id: lead.lead_id, last_newsletter_id: lead.content_id, last_contacted_at: nowTs(),
  thread_ids: ids.join(','), updated_at: nowTs(),
} }];
