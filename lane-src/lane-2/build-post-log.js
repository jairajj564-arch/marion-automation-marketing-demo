// Lane 2 · Build post log: one event for the post that was just sent (or that failed).
const S = $('Lane 2 · Settings to object').first().json;
/*@include time*/
/*@include events*/
const ctx = $('Lane 2 · Build Telegram message').first().json;
const saved = $input.first().json;                                  // the row we just wrote (echoed by the update node)

if (saved.status === 'published') {
  return [{ json: event({
    event_type: 'content_published', entity_type: 'content', entity_id: ctx.content_id,
    status_from: ctx.status, status_to: 'published', channel: ctx.channel,
    detail: `${ctx.asset_type} posted to Telegram (${saved.publish_ref})`,
    meta: { publish_ref: saved.publish_ref, asset_type: ctx.asset_type },
  }) }];
}
return [{ json: event({
  event_type: 'publish_failed', entity_type: 'content', entity_id: ctx.content_id,
  status_from: ctx.status, status_to: 'failed', channel: ctx.channel,
  detail: String(saved.last_error ?? ''), meta: { error: String(saved.last_error ?? ''), asset_type: ctx.asset_type },
}) }];
