// Runs once per work item, after its post/email step has finished one way or another.
// Decides what to write back (SEQUENCES for a post, LEADS for an email) and which events to log.
const S = $('Lane LANE_N · Settings to object').first().json;
//@include time
const now = $now.setZone(TZ);
const input = $json;
// Every work item passes through "Is channel post?", so this is the item of this round whatever path it took.
const ctx = $('Lane LANE_N · Is channel post?').item.json;
const stamp = (d) => d.toFormat(STAMP);
const events = [];
let target = 'none';
let updates = [];
let outcome = ctx.kind;

if (ctx.kind === 'post') {
  const messageId = input.ok === true ? input.result?.message_id : undefined;
  if (messageId !== undefined && messageId !== null) {
    target = 'sequence'; outcome = 'posted';
    updates = [ctx.step_key, ...(ctx.stale_keys || [])].map((key) => ({ step_key: key, broadcast_done_at: stamp(now) }));
    events.push({ event_type: 'launch_post_published', entity_type: 'sequence', entity_id: ctx.step_key, channel: 'telegram_channel',
      detail: `${ctx.step_key} posted to the channel${ctx.stale_keys?.length ? `; ${ctx.stale_keys.length} older step(s) skipped as stale` : ''}`,
      meta: { step_key: ctx.step_key, message_id: messageId, stale_skipped: ctx.stale_keys || [] } });
  } else {
    // Leave broadcast_done_at blank so the next run tries again.
    outcome = 'post_failed';
    const message = typeof input.error === 'string' ? input.error : (input.error?.message || input.description || 'Telegram returned no message id');
    events.push({ event_type: 'error', entity_type: 'sequence', entity_id: ctx.step_key, channel: 'telegram_channel',
      detail: `channel post ${ctx.step_key} failed: ${message}`, meta: { node: 'Lane LANE_N · Post to channel', message: String(message).slice(0, 300) } });
  }
} else if (ctx.kind === 'email') {
  const id = ctx.lead_id;
  if (input.gate_ok === false) {
    outcome = 'blocked'; target = 'lead';
    updates = [{ lead_id: id, status: 'blocked', email_allowed: 'FALSE', updated_at: stamp(now) }];
    events.push({ event_type: 'email_blocked', entity_type: 'lead', entity_id: id, status_from: ctx.status_from, status_to: 'blocked', channel: 'email',
      detail: `${ctx.to_email} blocked by the safety gate: ${input.gate_reason}`, meta: { reason: input.gate_reason } });
  } else if (input.id && !input.error) {
    outcome = 'sent'; target = 'lead';
    const threads = String(ctx.thread_ids_before || '').split(',').map((t) => t.trim()).filter(Boolean);
    if (input.threadId) threads.push(String(input.threadId));
    updates = [{ lead_id: id, launch_step: ctx.step, last_contacted_at: stamp(now), thread_ids: threads.slice(-10).join(','), updated_at: stamp(now) }];
    events.push({ event_type: 'email_sent', entity_type: 'lead', entity_id: id, channel: 'email', detail: `${ctx.sequence_id} step ${ctx.step} sent`,
      meta: { sequence_id: ctx.sequence_id, step: ctx.step, thread_id: String(input.threadId ?? '') } });
  } else {
    // The lead keeps launch_step, so the next run simply tries again.
    outcome = 'email_failed';
    const message = typeof input.error === 'string' ? input.error : (input.error?.message || JSON.stringify(input.error ?? 'Gmail returned no message id'));
    events.push({ event_type: 'email_failed', entity_type: 'lead', entity_id: id, channel: 'email',
      detail: `${ctx.sequence_id} step ${ctx.step} not sent: ${message}`, meta: { sequence_id: ctx.sequence_id, step: ctx.step, error: String(message).slice(0, 300) } });
  }
} else {
  events.push({ event_type: 'error', entity_type: ctx.entity_type || 'sequence', entity_id: ctx.entity_id || '', channel: 'sheet',
    detail: ctx.pick_error, meta: { node: 'Lane LANE_N · Pick launch work', message: ctx.pick_error } });
}
return { json: { outcome, target, update_sequence: target === 'sequence', update_lead: target === 'lead', updates, events } };
