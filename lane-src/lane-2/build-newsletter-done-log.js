// Lane 2 · Build newsletter done log: the broadcast is complete.
const S = $('Lane 2 · Settings to object').first().json;
/*@include time*/
/*@include events*/
const saved = $input.first().json;
return [{ json: event({
  event_type: 'content_published', entity_type: 'content', entity_id: saved.content_id,
  status_from: 'publishing', status_to: 'published', channel: 'email',
  detail: `newsletter finished (${saved.publish_ref})`, meta: { publish_ref: saved.publish_ref, asset_type: 'newsletter' },
}) }];
