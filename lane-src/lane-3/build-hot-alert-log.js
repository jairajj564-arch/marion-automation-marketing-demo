// Lane 3 · Build hot alert log: hot_alert_sent when Telegram answered, an `error` event when it did not.
// The lead is already saved and logged by now, so a Telegram problem never loses the lead.
const S = $('Lane 3 · Settings to object').first().json;
/*@include time*/
/*@include events*/
const alert = $('Lane 3 · Build hot alert').first().json;
const reply = $input.first().json ?? {};
const messageId = reply.message_id ?? reply.result?.message_id;
if (messageId !== undefined && messageId !== null && messageId !== '') {
  return [{ json: event({
    event_type: 'hot_alert_sent', entity_type: 'lead', entity_id: alert.lead_id, channel: 'telegram_owner',
    detail: alert.text.replace(/<[^>]*>/g, ''), meta: { score: Number(/score (\d+)/.exec(alert.text)?.[1] ?? 0), message_id: messageId },
  }) }];
}
const err = reply.error;
const detail = typeof err === 'string' ? err : (err?.description ?? err?.message ?? (err ? JSON.stringify(err) : 'Telegram returned no message_id'));
return [{ json: event({
  event_type: 'error', entity_type: 'lead', entity_id: alert.lead_id, channel: 'telegram_owner',
  detail: `Hot-lead alert not sent: ${detail}`, meta: { node: 'Lane 3 · Alert owner on Telegram', message: String(detail).slice(0, 300) },
}) }];
