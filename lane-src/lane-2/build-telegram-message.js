// Lane 2 · Build Telegram message (runs once per post, inside the loop)
const S = $('Lane 2 · Settings to object').first().json;
const row = $input.first().json;

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LIMIT = 4000;                                   // Telegram's hard limit is 4,096
// Shorten raw text so its HTML-escaped form fits `room` characters (never cuts an entity in half).
function fit(raw, room) {
  const text = String(raw ?? '').trim();
  if (room <= 1) return '';
  if (esc(text).length <= room) return text;
  let cut = text;
  while (cut.length > 0 && esc(cut).length > room - 1) cut = cut.slice(0, Math.max(0, cut.length - Math.max(1, Math.ceil((esc(cut).length - room) / 6))));
  return `${cut.trimEnd()}…`;
}
const waitlist = `👉 Join the waitlist: ${esc(S.WAITLIST_FORM_URL)}`;
const tags = esc(row.hashtags);
const type = row.asset_type;
let chat_id = S.TELEGRAM_CHANNEL_ID;
let channel = 'telegram_channel';
let compose;

if (type === 'ig_caption' || type === 'short_post') {
  compose = (f) => [esc(f.body), tags, waitlist].filter(Boolean).join('\n\n');
} else if (type === 'blog_article') {
  compose = (f) => [
    '📝 <b>New on the Kaya Jewels blog</b>',
    `<b>${esc(row.title.trim())}</b>`,
    esc(f.meta_description),
    `Read: /blog/${esc(row.slug)} (demo)`,
    waitlist,
  ].filter(Boolean).join('\n\n');
} else if (type === 'reel_idea') {
  chat_id = S.TELEGRAM_OWNER_CHAT_ID;
  channel = 'telegram_owner';
  compose = (f) => [
    `🎬 <b>Reel brief</b>: ${esc(row.title.trim())}`,
    esc(f.media_notes),
    ['<b>Caption</b>', esc(f.body)].join('\n'),
    tags,
  ].filter(Boolean).join('\n\n');
} else {
  throw new Error(`Unsupported asset_type ${type}`);                // Pick due content already filtered these out
}

// Start from the full text and trim the long free-text fields until the message fits.
const fields = { body: row.body.trim(), media_notes: row.media_notes.trim(), meta_description: row.meta_description.trim() };
let text = compose(fields);
for (const name of ['body', 'media_notes', 'meta_description']) {
  if (text.length <= LIMIT) break;
  const over = text.length - LIMIT;
  fields[name] = fit(fields[name], esc(fields[name]).length - over);
  text = compose(fields);
}
if (text.length > LIMIT) text = `${text.slice(0, LIMIT - 1)}…`;       // last resort (very long title/hashtags)

return [{ json: { content_id: row.content_id, asset_type: type, status: row.status, channel, chat_id, text } }];
