// Lane 2 · Build problem log: one `error` event per row that could not be published.
const S = $('Lane 2 · Settings to object').first().json;
/*@include time*/
/*@include events*/
return $input.all().map((item) => ({
  json: event({
    event_type: 'error', entity_type: 'content', entity_id: item.json.content_id, channel: 'sheet',
    detail: String(item.json.last_error ?? ''),
    meta: { node: 'Lane 2 · Pick due content', message: String(item.json.last_error ?? '') },
  }),
}));
