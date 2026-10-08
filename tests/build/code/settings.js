// SETTINGS arrives as one item per row (key | value | type | description).
// Turn it into ONE item, e.g. { DEMO_MODE: 'TRUE', MAX_SENDS_PER_RUN: '3', ... },
// so every later node can read settings with $('Lane LANE_N · Settings to object').first().json.KEY
const settings = {};
for (const item of $input.all()) {
  const key = String(item.json.key ?? '').trim();
  if (!key) continue;
  const value = item.json.value;
  settings[key] = typeof value === 'string' ? value.trim() : (value ?? '');
}

// Stop early with a clear message if the sheet is missing something this lane needs.
const required = REQUIRED_LIST;
const missing = required.filter((key) => settings[key] === undefined || settings[key] === '');
if (missing.length) {
  throw new Error(`The SETTINGS tab is missing a value for: ${missing.join(', ')}`);
}

// Derived values (SPEC section 5.3). Sheet booleans may come back as true or "TRUE".
//@include settings_tail
