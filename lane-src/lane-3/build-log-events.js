// Lane 3 · Build log events: lead_captured (+ email_blocked when the safety gate said no).
const S = $('Lane 3 · Settings to object').first().json;
/*@include time*/
/*@include events*/
const row = $input.first().json;                            // the row just saved (echoed by the append node)
const gate = $('Lane 3 · Demo safety gate').first().json;
const out = [event({
  event_type: 'lead_captured', entity_type: 'lead', entity_id: row.lead_id, status_to: row.status, channel: 'form',
  detail: `Waitlist sign-up: ${row.first_name} (${row.city}), score ${row.score} ${row.segment}`,
  meta: { score: row.score, segment: row.segment },
})];
if (row.status === 'blocked') {
  out.push(event({
    event_type: 'email_blocked', entity_type: 'lead', entity_id: row.lead_id, status_to: 'blocked', channel: 'email',
    detail: `Saved but never emailed: ${gate.gate_reason}`, meta: { reason: gate.gate_reason },
  }));
}
return out.map((json) => ({ json }));
