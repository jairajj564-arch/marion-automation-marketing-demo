// Builds the prompt for the optional "3 insights" AI call plus the exact request bodies for Gemini (main) and Groq (fallback).
// Only the computed metrics are sent (as JSON). No other facts are given, and none may be invented.
const S = $('Lane LANE_N · Settings to object').first().json;
const computed = $('Lane LANE_N · Compute metrics').first().json;
const { last_report_at, ...metricsForAi } = computed.metrics;       // a timestamp only invites made-up numbers

const system = [
  'You write the short management summary of a campaign report for Kaya Jewels, a handmade jewellery brand from Jaipur.',
  '',
  'BRAND VOICE',
  S.BRAND_VOICE,
  '',
  'RULES (most important)',
  '1. The METRICS JSON in the user message is the only source of truth. Use nothing else.',
  '2. Mention only numbers that appear in the METRICS JSON, written exactly as they appear there. Never add, subtract, round, convert or estimate numbers, and never write any other number (no dates, no percentages that are not in the JSON, no counts of items).',
  '3. Never invent causes, events, customers, people, products, prices, dates or quotes.',
  '4. Write exactly 3 insights, each at most 30 words, plain text without markdown: (1) what happened, (2) what is working, (3) one recommended action.',
  '5. Answer with one JSON object only: { "insights": [string, string, string] }',
].join('\n');
const prompt = `METRICS (JSON, ${computed.period_text}):\n${JSON.stringify(metricsForAi)}`;

const temperature = Number(S.AI_TEMPERATURE);
const geminiBody = {
  systemInstruction: { parts: [{ text: system }] },
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: {
    temperature: Number.isFinite(temperature) ? temperature : 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json',
    responseSchema: { type: 'OBJECT', properties: { insights: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 3, maxItems: 3 } }, required: ['insights'], propertyOrdering: ['insights'] },
  },
};
const budget = String(S.GEMINI_THINKING_BUDGET ?? '').trim();
if (budget !== '' && Number.isFinite(Number(budget))) geminiBody.generationConfig.thinkingConfig = { thinkingBudget: Number(budget) };

const groqBody = {
  model: S.GROQ_MODEL, temperature: Number.isFinite(temperature) ? temperature : 0.7, max_tokens: 1500,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: `${system}\nReturn ONLY one JSON object with exactly this shape: ${JSON.stringify({ insights: ['what happened', 'what is working', 'one recommended action'] })}` },
    { role: 'user', content: prompt },
  ],
};
return [{ json: { gemini_model: S.GEMINI_MODEL, groq_model: S.GROQ_MODEL, started_at: Date.now(), request_id: `report:${$now.setZone('Asia/Kolkata').toFormat('yyyyMMdd-HHmmss')}:insights`, gemini_body: geminiBody, groq_body: groqBody, allowed_numbers: Object.values(metricsForAi).map((v) => String(Number(v))) } }];
