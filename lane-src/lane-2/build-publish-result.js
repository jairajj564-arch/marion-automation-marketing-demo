// Lane 2 · Build publish result
// Both outputs of "Send to Telegram" land here: success (a message came back) or failure (an error item).
// Output = ONLY the CONTENT columns Lane 2 owns (the update node writes every field it gets).
/*@include time*/
const S = $('Lane 2 · Settings to object').first().json;
const ctx = $('Lane 2 · Build Telegram message').first().json;
const reply = $input.first().json ?? {};
const messageId = reply.message_id ?? reply.result?.message_id;

if (messageId !== undefined && messageId !== null && messageId !== '') {
  return [{ json: {
    content_id: ctx.content_id, status: 'published', published_at: nowTs(),
    publish_ref: `tg:${messageId}`, last_error: '', updated_at: nowTs(),
  } }];
}
const err = reply.error;
const detail = typeof err === 'string' ? err : (err?.description ?? err?.message ?? (err ? JSON.stringify(err) : 'Telegram returned no message_id'));
return [{ json: {
  content_id: ctx.content_id, status: 'failed', last_error: `Telegram: ${detail}`.slice(0, 300), updated_at: nowTs(),
} }];
