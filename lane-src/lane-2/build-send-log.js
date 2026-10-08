// Lane 2 · Build send log
// Three ways into this node, once per loop round: email sent (lead row updated), address blocked
// (lead row updated) or Gmail failed (an error item). It writes ONE log event for what happened.
const S = $('Lane 2 · Settings to object').first().json;
/*@include time*/
/*@include events*/
const lead = $('Lane 2 · Demo safety gate').first().json;
const input = $input.first().json ?? {};
const pause = { pause_seconds: Number(S.SEND_DELAY_SECONDS) };      // extra field, used by the Wait node; the log append ignores it

// Gmail's error output carries an `error` field (and may repeat the input fields); the lead-row echo from a successful update never has one.
if (input.error !== undefined && input.error !== null && input.error !== '') {
  const err = input.error;
  const detail = typeof err === 'string' ? err : (err?.description ?? err?.message ?? JSON.stringify(err));
  return [{ json: { ...event({
    event_type: 'email_failed', entity_type: 'lead', entity_id: lead.lead_id, channel: 'email',
    detail: `Newsletter ${lead.content_id} not sent: ${detail}`, meta: { error: String(detail).slice(0, 300), content_id: lead.content_id },
  }), ...pause } }];
}
if (lead.gate_ok === false) {
  return [{ json: { ...event({
    event_type: 'email_blocked', entity_type: 'lead', entity_id: lead.lead_id, status_from: lead.lead_status, status_to: 'blocked', channel: 'email',
    detail: `Newsletter ${lead.content_id} blocked: ${lead.gate_reason}`, meta: { reason: lead.gate_reason, content_id: lead.content_id },
  }), ...pause } }];
}
const threadId = String(input.thread_ids ?? '').split(',').map((part) => part.trim()).filter(Boolean).pop() ?? '';
return [{ json: { ...event({
  event_type: 'email_sent', entity_type: 'lead', entity_id: lead.lead_id, channel: 'email',
  detail: `Newsletter ${lead.content_id} sent`, meta: { content_id: lead.content_id, thread_id: threadId },
}), ...pause } }];
