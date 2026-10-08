// Runs once per lead, after the email step has finished one way or another (sent, send failed, blocked,
// or nothing to send). Decides what to write back to LEADS and which events to log.
// Only this node knows the outcome, so every branch of the loop meets here.
const S = $('Lane LANE_N · Settings to object').first().json;
//@include time
const now = $now.setZone(TZ);
const input = $json;

let ctx;
let outcome;
if (input.gate_ok === false) { ctx = input; outcome = 'blocked'; }
else if (input.action === 'complete' || input.action === 'skip') { ctx = input; outcome = input.action; }
else {
  // Gmail's own output has no lead data, so fetch the item that went into Gmail (matched by n8n's item pairing).
  ctx = $('Lane LANE_N · Recipient allowed?').item.json;
  outcome = (input.error || !input.id) ? 'failed' : 'sent';
}

const stamp = (d) => d.toFormat(STAMP);
const leadId = ctx.lead_id;
const update = { lead_id: leadId, updated_at: stamp(now) };
const events = [];
let hasUpdate = true;

if (outcome === 'sent') {
  const threads = String(ctx.thread_ids_before || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (input.threadId) threads.push(String(input.threadId));
  const statusTo = ctx.is_last ? 'nurture_done' : 'nurturing';
  Object.assign(update, {
    seq_step: ctx.step, status: statusTo, last_contacted_at: stamp(now),
    next_action_at: ctx.is_last ? '' : stamp(addDays(now, ctx.next_delay_days)),
    thread_ids: threads.slice(-10).join(','),
  });
  events.push({ event_type: 'email_sent', entity_type: 'lead', entity_id: leadId, status_from: ctx.status_from, status_to: statusTo, channel: 'email',
    detail: `${ctx.sequence_id} step ${ctx.step} sent`, meta: { sequence_id: ctx.sequence_id, step: ctx.step, thread_id: String(input.threadId ?? '') } });
  if (ctx.is_last) events.push({ event_type: 'sequence_completed', entity_type: 'lead', entity_id: leadId, status_from: ctx.status_from, status_to: statusTo, channel: 'email',
    detail: `${ctx.sequence_id} finished after step ${ctx.step}`, meta: { sequence_id: ctx.sequence_id } });
} else if (outcome === 'failed') {
  // Do not advance seq_step; try again a little later (0.1 day on the demo clock).
  update.next_action_at = stamp(addDays(now, 0.1));
  const message = typeof input.error === 'string' ? input.error : (input.error?.message || JSON.stringify(input.error ?? 'Gmail returned no message id'));
  events.push({ event_type: 'email_failed', entity_type: 'lead', entity_id: leadId, channel: 'email',
    detail: `${ctx.sequence_id} step ${ctx.step} not sent: ${message}`, meta: { sequence_id: ctx.sequence_id, step: ctx.step, error: String(message).slice(0, 300) } });
} else if (outcome === 'blocked') {
  Object.assign(update, { status: 'blocked', email_allowed: 'FALSE', next_action_at: '' });
  events.push({ event_type: 'email_blocked', entity_type: 'lead', entity_id: leadId, status_from: ctx.status_from, status_to: 'blocked', channel: 'email',
    detail: `${ctx.to_email} blocked by the safety gate: ${ctx.gate_reason}`, meta: { reason: ctx.gate_reason } });
} else if (outcome === 'complete') {
  Object.assign(update, { status: 'nurture_done', next_action_at: '' });
  events.push({ event_type: 'sequence_completed', entity_type: 'lead', entity_id: leadId, status_from: ctx.status_from, status_to: 'nurture_done', channel: 'email',
    detail: `${ctx.sequence_id} has no step ${ctx.step + 1}; sequence finished`, meta: { sequence_id: ctx.sequence_id } });
} else {
  // skip: bad row or bad template. Leave the row alone and say why.
  hasUpdate = false;
  events.push({ event_type: 'error', entity_type: ctx.entity_type || 'lead', entity_id: ctx.entity_id ?? ctx.lead_id ?? (ctx.row_number ? `row ${ctx.row_number}` : ''), channel: 'sheet',
    detail: ctx.pick_error, meta: { node: 'Lane LANE_N · Pick due leads', message: ctx.pick_error } });
}

return { json: { outcome, lead_id: leadId, has_update: hasUpdate, row_update: update, events } };
