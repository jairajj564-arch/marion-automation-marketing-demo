// Writes what happened to EVENTS_LOG (SPEC 5.6): the dashboard write, the AI call (+ fallback / failure) and the report itself.
const S = $('Lane LANE_N · Settings to object').first().json;
const TZ = 'Asia/Kolkata';
//@include events
const computed = $('Lane LANE_N · Compute metrics').first().json;
const rowsWritten = $('Lane LANE_N · Back to one item').first().json.dashboard_rows;
const ai = $('Lane LANE_N · Build report message').first().json.ai;   // the final AI result (Gemini, or Groq after a fallback)
const telegram = $input.first().json;
const reportId = `R-${now.toFormat('yyyyMMdd-HHmmss')}`;
const events = [];

events.push(event({ event_type: 'dashboard_updated', entity_type: 'report', entity_id: reportId, channel: 'sheet',
  detail: `DASHBOARD updated with ${rowsWritten} metrics`, meta: { metrics: rowsWritten } }));

const aiMeta = { provider: ai.ai_provider, model: ai.ai_model, ok: ai.ai_ok, purpose: 'report_insights', duration_ms: ai.duration_ms };
events.push(event({ event_type: 'ai_call', entity_type: 'ai', entity_id: ai.request_id, channel: 'ai',
  detail: `report insights: ${ai.ai_ok ? 'ok' : 'failed'} via ${ai.ai_provider}`, meta: aiMeta }));
if (ai.ai_provider === 'groq') {
  events.push(event({ event_type: 'ai_fallback', entity_type: 'ai', entity_id: ai.request_id, channel: 'ai',
    detail: `Gemini failed, used Groq: ${ai.fallback_reason}`, meta: { ...aiMeta, reason: ai.fallback_reason } }));
}
if (!ai.ai_ok) {
  events.push(event({ event_type: 'ai_failed', entity_type: 'ai', entity_id: ai.request_id, channel: 'ai',
    detail: `${ai.ai_error} (report sent without insights)`, meta: { ...aiMeta, error: ai.ai_error } }));
}

const sent = telegram.ok === true && telegram.result?.message_id !== undefined && !telegram.error;
if (sent) {
  events.push(event({ event_type: 'report_sent', entity_type: 'report', entity_id: reportId, channel: 'telegram_owner',
    detail: `Report sent to the owner (${computed.period_text})`, meta: { period_start: computed.period_start, message_id: telegram.result.message_id } }));
} else {
  const message = typeof telegram.error === 'string' ? telegram.error : (telegram.error?.message || telegram.description || 'Telegram returned no message id');
  events.push(event({ event_type: 'error', entity_type: 'report', entity_id: reportId, channel: 'telegram_owner',
    detail: `Report not sent to Telegram (the dashboard was still updated): ${message}`, meta: { node: 'Lane LANE_N · Send report', message: String(message).slice(0, 300) } }));
}
return events.map((json) => ({ json }));
