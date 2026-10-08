// Lane 3 · Score lead: exact rules of SPEC 7.3 (cap 100).
const S = $('Lane 3 · Settings to object').first().json;
const lead = $input.first().json;

const BUDGET = { above_5000: 30, '3000_5000': 25, '1500_3000': 15, under_1500: 5 };
const OCCASION = { diwali_outfit: 25, gifting: 20, wedding_season: 20, self_treat: 15, just_browsing: 0 };
const INTEREST = { full_set: 15, necklaces: 12, earrings: 10, bangles: 10, gifting: 10, maang_tikka: 8 };

const parts = [
  [`budget ${lead.budget}`, BUDGET[lead.budget] ?? 0],
  [`occasion ${lead.occasion}`, OCCASION[lead.occasion] ?? 0],
  [`interest ${lead.interest}`, INTEREST[lead.interest] ?? 0],
];
if (lead.instagram_handle) parts.push(['instagram', 10]);
if (lead.phone) parts.push(['phone', 10]);
if (lead.consent === 'TRUE') parts.push(['consent', 10]);

const score = Math.min(100, parts.reduce((sum, [, points]) => sum + points, 0));
const segment = score >= Number(S.HOT_LEAD_SCORE) ? 'hot' : score >= Number(S.WARM_LEAD_SCORE) ? 'warm' : 'cold';
const score_reason = parts.map(([label, points]) => `${label} +${points}`).join('; ');

// The gate (next node) reads the recipient from `to_email`.
return [{ json: { ...lead, score, segment, score_reason, to_email: lead.email } }];
