// Lane 3 · Check duplicate
// Input: every LEADS row (or one empty item when the tab is empty).
// Output: the new lead plus is_duplicate / existing_lead_id / a fresh lead_id (SPEC 5.9).
/*@include time*/
const lead = $('Lane 3 · Validate and normalise').first().json;
const rows = $input.all().map((item) => item.json).filter((row) => String(row?.lead_id ?? '').trim() !== '');

const existing = rows.find((row) => String(row.email ?? '').trim().toLowerCase() === lead.email);
const taken = new Set(rows.map((row) => String(row.lead_id).trim()));
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function newLeadId() {
  let id;
  do {
    const tail = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    id = `LD-${now.toFormat('yyyyMMdd')}-${tail}`;
  } while (taken.has(id));
  return id;
}
return [{ json: {
  ...lead,
  is_duplicate: Boolean(existing),
  existing_lead_id: existing ? String(existing.lead_id).trim() : '',
  lead_id: existing ? '' : newLeadId(),
} }];
