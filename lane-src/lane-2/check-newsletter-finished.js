// Lane 2 · Check newsletter finished
// Arrives from two places: the recipient loop (items = the log events of this run) or straight from
// "Any recipient to send?" (one summary item, nothing was sent). Either way:
//   still waiting = leads that need the newsletter (before this run) - sent now - blocked now.
// 0 left -> output the CONTENT update that marks it published. Otherwise output nothing; the next run continues.
/*@include time*/
const S = $('Lane 2 · Settings to object').first().json;
const ctx = $('Lane 2 · Pick newsletter recipients').first().json.ctx;
const events = $input.all().map((item) => item.json);
const sentNow = events.filter((e) => e.event_type === 'email_sent').length;
const blockedNow = events.filter((e) => e.event_type === 'email_blocked').length;
const left = ctx.remaining_before - sentNow - blockedNow;
if (left > 0) return [];
return [{ json: {
  content_id: ctx.content_id, status: 'published', published_at: nowTs(),
  publish_ref: `newsletter:${ctx.prior_sent + sentNow} sent`, last_error: '', updated_at: nowTs(),
} }];
