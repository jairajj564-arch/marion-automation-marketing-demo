// Pull the answer text out of Groq's (OpenAI-style) response, and remember why we fell back.
const request = $('Lane LANE_N · Build AI request').first().json;
const response = $input.first().json;
const fallbackReason = $('Lane LANE_N · Need Groq fallback?').first(0)?.json?.ai_error || '';

let text = '';
let error = '';
if (response.error) {
  const { message, description } = response.error;
  const detail = [message, description].filter(Boolean).join(' - ') || JSON.stringify(response.error);
  error = `Groq call failed: ${String(detail).slice(0, 300)}`;
} else {
  const choice = (response.choices || [])[0];
  text = choice?.message?.content || '';
  if (!text) error = `Groq returned no text (reason: ${choice?.finish_reason || 'unknown'})`;
}
return [{ json: { provider: 'groq', model: request.groq_model, text, error, fallback_reason: fallbackReason } }];
