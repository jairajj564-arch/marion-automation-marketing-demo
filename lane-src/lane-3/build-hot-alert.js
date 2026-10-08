// Lane 3 · Build hot alert: only hot leads produce a Telegram message; everyone else ends the run here.
const S = $('Lane 3 · Settings to object').first().json;
const row = $('Lane 3 · Save to LEADS').first().json;
if (row.segment !== 'hot') return [];
const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
return [{ json: {
  lead_id: row.lead_id,
  chat_id: S.TELEGRAM_OWNER_CHAT_ID,
  text: `🔥 New hot lead: ${esc(row.first_name)} (${esc(row.city)}), score ${row.score}`,
} }];
