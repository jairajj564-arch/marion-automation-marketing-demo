// Same check for both providers: valid JSON with 3 insights, and NO number that is not in the metrics.
// A bad answer from Gemini sends the job to the Groq fallback (try_groq = true). A bad answer from Groq = AI failure (no insights).
const request = $('Lane LANE_N · Build AI request').first().json;
const reply = $input.first().json;

function parseJson(text) {
  let clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end > start) clean = clean.slice(start, end + 1);
  return JSON.parse(clean);
}

let insights = null;
let error = reply.error || '';
if (!error) {
  try {
    const data = parseJson(reply.text);
    const list = Array.isArray(data.insights) ? data.insights.map((s) => String(s ?? '').trim()).filter(Boolean) : [];
    if (list.length < 3) error = `${reply.provider} answer is incomplete: needs 3 insights`;
    else insights = list.slice(0, 3);
  } catch (parseError) {
    error = `${reply.provider} answer is not valid JSON: ${parseError.message}`;
  }
}
if (!error) {
  // Reject any insight with a number that is not one of the metrics we supplied.
  const allowed = new Set(request.allowed_numbers);
  const invented = [];
  for (const sentence of insights) {
    for (const found of sentence.match(/\d[\d,]*(?:\.\d+)?/g) || []) {
      const value = String(Number(found.replace(/,/g, '')));
      if (!allowed.has(value)) invented.push(found);
    }
  }
  if (invented.length) { error = `${reply.provider} used number(s) that are not in the metrics: ${[...new Set(invented)].join(', ')}`; insights = null; }
}

const ok = !error;
const tryGroq = !ok && reply.provider === 'gemini';
return [{
  json: {
    request_id: request.request_id, ai_ok: ok, ai_provider: reply.provider, ai_model: reply.model, ai_error: error,
    fallback_reason: reply.fallback_reason || '', try_groq: tryGroq, duration_ms: Date.now() - request.started_at,
    insights: ok ? insights : [], groq_body: tryGroq ? request.groq_body : null,
  },
}];
