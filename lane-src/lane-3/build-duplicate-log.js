// Lane 3 · Build duplicate log: same email twice = no new row, just a log line.
const S = $('Lane 3 · Settings to object').first().json;
/*@include time*/
/*@include events*/
const lead = $input.first().json;
return [{ json: event({
  event_type: 'lead_duplicate', entity_type: 'lead', entity_id: lead.existing_lead_id, channel: 'form',
  detail: `Duplicate sign-up ignored (already ${lead.existing_lead_id})`, meta: { email: lead.email },
}) }];
