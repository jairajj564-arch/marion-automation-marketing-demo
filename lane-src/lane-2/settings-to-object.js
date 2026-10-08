// SETTINGS arrives as one item per row (key | value | type | description).
// Turn it into ONE item, e.g. { DEMO_MODE: 'TRUE', MAX_POSTS_PER_RUN: '2', ... }.
const settings = {};
for (const item of $input.all()) {
  const key = String(item.json.key ?? '').trim();
  if (!key) continue;
  const value = item.json.value;
  settings[key] = typeof value === 'string' ? value.trim() : (value ?? '');
}

// Stop early with a clear message if the sheet is missing something Lane 2 needs.
const required = [
  'DEMO_MODE', 'DEMO_MINUTES_PER_DAY', 'LAUNCH_DATE', 'EARLY_ACCESS_DAYS', 'WAITLIST_FORM_URL',
  'SENDER_NAME', 'SENDER_EMAIL', 'ALLOWED_DEMO_INBOXES', 'MAX_SENDS_PER_RUN', 'SEND_DELAY_SECONDS',
  'MIN_EMAIL_GAP_DAYS', 'MAX_POSTS_PER_RUN', 'TELEGRAM_OWNER_CHAT_ID', 'TELEGRAM_CHANNEL_ID', 'UNSUBSCRIBE_LINE',
];
const missing = required.filter((key) => settings[key] === undefined || String(settings[key]).trim() === '');
if (missing.length) {
  throw new Error(`The SETTINGS tab is missing a value for: ${missing.join(', ')}`);
}
if (settings.ALLOWED_EMAIL_DOMAINS === undefined) settings.ALLOWED_EMAIL_DOMAINS = '';   // optional, may be blank

// Numbers must really be numbers (a typo here would otherwise break the run halfway).
const mustBe = (key, test, what) => { if (!test(Number(settings[key]))) throw new Error(`SETTINGS ${key} must be ${what}, found "${settings[key]}"`); };
mustBe('MAX_POSTS_PER_RUN', (n) => Number.isInteger(n) && n >= 1, 'a whole number of 1 or more');
mustBe('MAX_SENDS_PER_RUN', (n) => Number.isInteger(n) && n >= 1, 'a whole number of 1 or more');
mustBe('SEND_DELAY_SECONDS', (n) => Number.isFinite(n) && n >= 0, 'a number of seconds, 0 or more');
mustBe('MIN_EMAIL_GAP_DAYS', (n) => Number.isFinite(n) && n >= 0, 'a number of days, 0 or more');
mustBe('EARLY_ACCESS_DAYS', (n) => Number.isFinite(n) && n >= 0, 'a number of days, 0 or more');
settings.SEND_DELAY_SECONDS = Math.min(60, Number(settings.SEND_DELAY_SECONDS));   // SPEC 5.5: no Wait over 60 seconds

// Derived values (SPEC section 5.3). Sheet booleans may come back as true or "TRUE".
settings.IS_DEMO = String(settings.DEMO_MODE).trim().toUpperCase() === 'TRUE';
const demoMinutes = Number(settings.DEMO_MINUTES_PER_DAY);
if (settings.IS_DEMO && !(demoMinutes > 0)) {
  throw new Error('DEMO_MINUTES_PER_DAY must be a number above 0 when DEMO_MODE is TRUE');
}
settings.DAY_MS = settings.IS_DEMO ? demoMinutes * 60 * 1000 : 24 * 60 * 60 * 1000;

return [{ json: settings }];
