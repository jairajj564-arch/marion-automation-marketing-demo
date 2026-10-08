// Lane 3 · Build error log: a submission that failed validation is logged and the run stops.
const S = $('Lane 3 · Settings to object').first().json;
/*@include time*/
/*@include events*/
const bad = $input.first().json;
const message = `Waitlist form rejected: ${bad.errors.join('; ')}`;
return [{ json: event({
  event_type: 'error', entity_type: 'lead', entity_id: '', channel: 'form',
  detail: message, meta: { node: 'Lane 3 · Validate and normalise', message: message.slice(0, 500), email: bad.email_seen },
}) }];
