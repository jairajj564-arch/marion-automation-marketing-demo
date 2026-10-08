// Lane LANE_N · Demo safety gate: input items carry the recipient in `to_email`.
const S = $('Lane LANE_N · Settings to object').first().json;
const PUBLIC = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'rediffmail.com', 'proton.me', 'protonmail.com'];
const list = (value) => String(value ?? '').toLowerCase().split(',').map((part) => part.trim()).filter(Boolean);
function checkRecipient(email) {
  const match = /^([a-z0-9._%-]+)(\+[a-z0-9._%-]*)?@([a-z0-9.-]+\.[a-z]{2,})$/.exec(email);
  if (!match) return { ok: false, reason: 'not a single valid email address' };
  const base = `${match[1]}@${match[3]}`;                      // plus-tag removed
  const inboxes = [...list(S.ALLOWED_DEMO_INBOXES), ...list(S.SENDER_EMAIL)];
  const domains = list(S.ALLOWED_EMAIL_DOMAINS).map((d) => d.replace(/^@/, '')).filter((d) => !PUBLIC.includes(d));
  if (inboxes.includes(base)) return { ok: true, reason: 'demo inbox' };
  if (domains.includes(match[3])) return { ok: true, reason: 'demo domain' };
  return { ok: false, reason: 'not in ALLOWED_DEMO_INBOXES or ALLOWED_EMAIL_DOMAINS' };
}
return $input.all().map((item) => {
  const to = String(item.json.to_email ?? '').trim().toLowerCase();
  const check = checkRecipient(to);
  return { json: { ...item.json, safe_to: check.ok ? to : '', gate_ok: check.ok, gate_reason: check.reason } };
});
