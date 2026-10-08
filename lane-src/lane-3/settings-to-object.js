// SETTINGS arrives as one item per row (key | value | type | description).
// Turn it into ONE item, e.g. { HOT_LEAD_SCORE: '70', ... }.
const settings = {};
for (const item of $input.all()) {
  const key = String(item.json.key ?? '').trim();
  if (!key) continue;
  const value = item.json.value;
  settings[key] = typeof value === 'string' ? value.trim() : (value ?? '');
}

// Stop early with a clear message if the sheet is missing something Lane 3 needs.
const required = [
  'DEMO_MODE', 'DEMO_MINUTES_PER_DAY', 'SENDER_EMAIL', 'ALLOWED_DEMO_INBOXES',
  'TELEGRAM_OWNER_CHAT_ID', 'HOT_LEAD_SCORE', 'WARM_LEAD_SCORE',
];
const missing = required.filter((key) => settings[key] === undefined || String(settings[key]).trim() === '');
if (missing.length) {
  throw new Error(`The SETTINGS tab is missing a value for: ${missing.join(', ')}`);
}
if (settings.ALLOWED_EMAIL_DOMAINS === undefined) settings.ALLOWED_EMAIL_DOMAINS = '';   // optional, may be blank
if (!Number.isFinite(Number(settings.HOT_LEAD_SCORE)) || !Number.isFinite(Number(settings.WARM_LEAD_SCORE))) {
  throw new Error('SETTINGS HOT_LEAD_SCORE and WARM_LEAD_SCORE must be numbers');
}

// Derived values (SPEC section 5.3). Sheet booleans may come back as true or "TRUE".
settings.IS_DEMO = String(settings.DEMO_MODE).trim().toUpperCase() === 'TRUE';
const demoMinutes = Number(settings.DEMO_MINUTES_PER_DAY);
if (settings.IS_DEMO && !(demoMinutes > 0)) {
  throw new Error('DEMO_MINUTES_PER_DAY must be a number above 0 when DEMO_MODE is TRUE');
}
settings.DAY_MS = settings.IS_DEMO ? demoMinutes * 60 * 1000 : 24 * 60 * 60 * 1000;

return [{ json: settings }];
