// Lane 2 · Build blocked update: the safety gate refused this address. Never email it again.
/*@include time*/
const lead = $input.first().json;
return [{ json: { lead_id: lead.lead_id, status: 'blocked', email_allowed: 'FALSE', updated_at: nowTs() } }];
