// Pull the answer text out of Gemini's response. If the HTTP call failed (after its retries) the item only has an "error"
// field; we pass that on so the check can switch to Groq.
const request = $('Lane LANE_N · Build AI request').first().json;
const response = $input.first().json;

let text = '';
let error = '';
if (response.error) {
  const { message, description } = response.error;
  const detail = [message, description].filter(Boolean).join(' - ') || JSON.stringify(response.error);
  error = `Gemini call failed: ${String(detail).slice(0, 300)}`;
} else {
  const candidate = (response.candidates || [])[0];
  const parts = candidate?.content?.parts || [];
  text = parts.filter((part) => !part.thought && typeof part.text === 'string').map((part) => part.text).join('');
  const finish = candidate?.finishReason || response.promptFeedback?.blockReason || 'unknown';
  if (!text) error = `Gemini returned no text (reason: ${finish})`;
  else if (finish !== 'STOP') error = `Gemini stopped early (reason: ${finish})`;
}
return [{ json: { provider: 'gemini', model: request.gemini_model, text, error, fallback_reason: '' } }];
