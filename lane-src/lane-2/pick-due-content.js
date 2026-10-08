// Lane 2 · Pick due content
// Looks at every CONTENT row once and decides what this run does:
//   kind "post"       -> a Telegram item that is approved and due (at most MAX_POSTS_PER_RUN, oldest first)
//   kind "newsletter" -> at most ONE newsletter that is approved/publishing and due
//   kind "problem"    -> a due row that cannot be published (empty field, bad date...). Reported once.
// Rows that are not approved, or not due yet, are never touched.
/*@include time*/
const S = $('Lane 2 · Settings to object').first().json;

const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function render(template, values) {
  const missing = new Set();
  const text = String(template ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key) => {
    if (values[key] === undefined || values[key] === null) { missing.add(key); return token; }
    return String(values[key]);
  });
  return { text, missing: [...missing] };
}
// The placeholders a Lane 2 newsletter may use (it only reads SETTINGS and LEADS).
const NEWSLETTER_KEYS = ['first_name', 'city', 'unsubscribe_line', 'launch_date', 'public_launch_date', 'waitlist_form_url', 'sender_name'];

const POST_TYPES = ['ig_caption', 'short_post', 'blog_article', 'reel_idea'];
const REQUIRED = {
  ig_caption: ['body'], short_post: ['body'],
  blog_article: ['title', 'body', 'slug'], reel_idea: ['title', 'body'],
  newsletter: ['title', 'body'],
};
const clean = (value) => String(value ?? '').trim();

function problemOf(row) {
  const type = clean(row.asset_type);
  if (!REQUIRED[type]) return `asset_type "${type}" is not supported`;
  const empty = REQUIRED[type].filter((field) => clean(row[field]) === '');
  if (empty.length) return `${empty.join(', ')} ${empty.length > 1 ? 'are' : 'is'} empty`;
  if (type === 'newsletter') {
    const sample = Object.fromEntries(NEWSLETTER_KEYS.map((key) => [key, 'x']));
    const unknown = [...new Set([...render(row.title, sample).missing, ...render(row.body, sample).missing])];
    if (unknown.length) return `unknown placeholder ${unknown.map((k) => `{{${k}}}`).join(', ')} in title/body`;
  }
  return '';
}

const rows = $input.all().map((item) => item.json).filter((row) => clean(row?.content_id) !== '');
const posts = [];
const newsletters = [];
const problems = [];

for (const row of rows) {
  const status = clean(row.status).toLowerCase();
  if (status !== 'approved' && status !== 'publishing') continue;      // not ours to touch
  const when = parseTs(row.scheduled_for);
  let problem = '';
  if (clean(row.scheduled_for) === '') problem = 'scheduled_for is missing';
  else if (!when) problem = `scheduled_for "${clean(row.scheduled_for)}" is not a valid timestamp`;
  else if (when.toMillis() > now.toMillis()) continue;                   // not due yet: leave it alone
  else problem = problemOf(row);

  if (problem) {
    const message = `Lane 2 skipped: ${problem}`.slice(0, 300);
    if (clean(row.last_error) !== message) {                             // report each problem once, not every minute
      problems.push({ kind: 'problem', content_id: clean(row.content_id), asset_type: clean(row.asset_type), status, last_error: message, updated_at: nowTs() });
    }
    continue;
  }
  const base = {
    content_id: clean(row.content_id), asset_type: clean(row.asset_type), status,
    scheduled_for: clean(row.scheduled_for), when: when.toMillis(),
    title: String(row.title ?? ''), body: String(row.body ?? ''), hashtags: clean(row.hashtags),
    media_notes: String(row.media_notes ?? ''), meta_description: String(row.meta_description ?? ''), slug: clean(row.slug),
  };
  if (base.asset_type === 'newsletter') newsletters.push(base);
  else if (POST_TYPES.includes(base.asset_type)) posts.push(base);
}

const oldestFirst = (a, b) => a.when - b.when || a.content_id.localeCompare(b.content_id);
posts.sort(oldestFirst);
// A newsletter that is already being broadcast is finished before a new one starts.
newsletters.sort((a, b) => (a.status === 'publishing' ? 0 : 1) - (b.status === 'publishing' ? 0 : 1) || oldestFirst(a, b));

const out = [];
for (const post of posts.slice(0, Number(S.MAX_POSTS_PER_RUN))) out.push({ json: { kind: 'post', ...post } });
if (newsletters.length) out.push({ json: { kind: 'newsletter', ...newsletters[0], needs_publishing: newsletters[0].status === 'approved' } });
for (const problem of problems) out.push({ json: problem });
return out;          // nothing to do = no items = the run ends quietly
