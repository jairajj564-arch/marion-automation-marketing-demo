// Re-checks the lead against a FRESH read of LEADS, right before the safety gate (session 5 cross-lane guard).
// "Pick due leads" read the sheet at the start of the run, up to ~45 s ago. Meanwhile Lane 7 may have marked the lead
// hot / replied / unsubscribed, or Lane 2 / 5 may have just emailed it. Sending now would ignore that, and our row update
// would overwrite Lane 7's status. So: still new/nurturing, same seq_step, consent, not blocked, gap respected? Else skip quietly.
const S = $('Lane LANE_N · Settings to object').first().json;
//@include time
const now = $now.setZone(TZ);
const job = $('Lane LANE_N · Needs email?').first().json;                 // this round's lead (latest run of the IF)
const fresh = $input.all().map((item) => item.json).find((row) => String(row?.lead_id ?? '').trim() === job.lead_id);
const reasons = [];
if (!fresh) reasons.push('lead row not found');
else {
  const status = String(fresh.status ?? '').trim();
  const seqStepRaw = String(fresh.seq_step ?? '').trim();
  if (!['new', 'nurturing'].includes(status)) reasons.push(`status is now ${status}`);
  if ((seqStepRaw === '' ? 0 : Number(seqStepRaw)) !== job.step - 1) reasons.push(`seq_step is now ${seqStepRaw}`);
  if (!isTrue(fresh.consent) || String(fresh.email_allowed ?? '').trim().toUpperCase() === 'FALSE') reasons.push('no longer allowed');
  if (!gapOk(fresh, now)) reasons.push('another lane emailed this lead moments ago');
}
return [{ json: { ...job, still_due: reasons.length === 0, stale_reason: reasons.join('; '), thread_ids_before: String(fresh?.thread_ids ?? job.thread_ids_before ?? '') }, pairedItem: { item: 0 } }];
