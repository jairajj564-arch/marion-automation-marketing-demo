// Lane 3 · Validate and normalise
// Turns the raw form answers (keys = the field labels) into clean, stored values (SPEC 7.3).
// A bad submission is not thrown away silently: ok=false carries the reasons so they can be logged.
const form = $('Lane 3 · Waitlist form').first().json;

// Tolerate a curly apostrophe in the label, and stray spaces.
const answers = {};
for (const [label, value] of Object.entries(form)) answers[label.replace(/’/g, "'").trim()] = value;
const field = (label) => String(answers[label] ?? '').trim();

const INTEREST = {
  'Earrings': 'earrings', 'Necklaces': 'necklaces', 'Maang tikka': 'maang_tikka',
  'Bangles': 'bangles', 'Gifting': 'gifting', 'A full festive set': 'full_set',
};
const BUDGET = {
  'Under ₹1,500': 'under_1500', '₹1,500–₹3,000': '1500_3000',
  '₹3,000–₹5,000': '3000_5000', 'Above ₹5,000': 'above_5000',
};
const OCCASION = {
  'My Diwali outfit': 'diwali_outfit', 'Gifting': 'gifting', 'Wedding season': 'wedding_season',
  'Treating myself': 'self_treat', 'Just browsing': 'just_browsing',
};
const CONSENT = { 'Yes, email me about early access and offers': 'TRUE', 'No thanks': 'FALSE' };

const errors = [];
const need = (label) => { const v = field(label); if (!v) errors.push(`${label} is missing`); return v; };
const pick = (label, table) => {
  const v = need(label);
  if (!v) return '';
  if (table[v] === undefined) { errors.push(`${label} "${v.slice(0, 40)}" is not a known option`); return ''; }
  return table[v];
};

const first_name = need('First name').slice(0, 100);
const city = need('City').slice(0, 100);
const email = need('Email').toLowerCase();
if (email && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(email)) errors.push(`Email "${email.slice(0, 60)}" is not a valid address`);
const interest = pick("I'm shopping for", INTEREST);
const budget = pick('My budget', BUDGET);
const occasion = pick('Occasion', OCCASION);
const consent = pick('Email consent', CONSENT);

let instagram_handle = field('Instagram handle').replace(/\s+/g, '').replace(/^@+/, '');
instagram_handle = instagram_handle ? `@${instagram_handle}`.slice(0, 60) : '';
const phone = field('WhatsApp number').slice(0, 30);

if (errors.length) {
  return [{ json: { ok: false, errors, email_seen: email.slice(0, 80) } }];
}
return [{ json: { ok: true, first_name, email, phone, city, instagram_handle, interest, budget, occasion, consent } }];
