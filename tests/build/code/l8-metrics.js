// Computes every metric of SPEC 2.8. "Period" = events after the previous report_sent (all time if there was none).
const S = $('Lane LANE_N · Settings to object').first().json;
//@include time
const now = $now.setZone(TZ);
const periodStartText = $('Lane LANE_N · Check if report is due').first().json.period_start;
const periodStart = parseTs(periodStartText);

const content = rowsOf('Lane LANE_N · Read CONTENT').filter((r) => String(r.content_id ?? '').trim());
const leads = rowsOf('Lane LANE_N · Read LEADS').filter((r) => String(r.lead_id ?? '').trim());
const prospects = rowsOf('Lane LANE_N · Read PROSPECTS').filter((r) => String(r.prospect_id ?? '').trim());
const events = rowsOf('Lane LANE_N · Read EVENTS_LOG').filter((r) => String(r.event_type ?? '').trim());

const txt = (v) => String(v ?? '').trim();
const inPeriod = (e) => !periodStart || (parseTs(e.ts) && parseTs(e.ts).toMillis() > periodStart.toMillis());
const ofType = (type) => events.filter((e) => txt(e.event_type) === type);
const mean = (rows, field) => {
  const values = rows.map((r) => (txt(r[field]) === '' ? NaN : Number(r[field]))).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
};
const meta = (e) => { try { return JSON.parse(e.meta_json || '{}'); } catch { return {}; } };

const status = (r) => txt(r.status);
const REPLIED = ['replied', 'interested', 'not_interested', 'do_not_contact', 'won', 'lost'];
const contacted = prospects.filter((p) => Number(txt(p.seq_step) || 0) >= 1).length;
const replied = prospects.filter((p) => REPLIED.includes(status(p))).length;
const emailSent = ofType('email_sent');

const metrics = {
  content_total: content.length,
  content_pending_approval: content.filter((r) => status(r) === 'pending_approval').length,
  content_approved: content.filter((r) => ['approved', 'publishing'].includes(status(r))).length,
  content_published: content.filter((r) => status(r) === 'published').length,
  content_avg_seo_score: mean(content, 'seo_score'),
  leads_total: leads.length,
  leads_new_period: ofType('lead_captured').filter(inPeriod).length,
  leads_hot: leads.filter((r) => txt(r.segment) === 'hot' || status(r) === 'hot').length,
  leads_warm: leads.filter((r) => txt(r.segment) === 'warm').length,
  leads_cold: leads.filter((r) => txt(r.segment) === 'cold').length,
  leads_avg_score: mean(leads, 'score'),
  leads_unsubscribed: leads.filter((r) => status(r) === 'unsubscribed').length,
  leads_blocked: leads.filter((r) => status(r) === 'blocked').length,
  emails_sent_total: emailSent.length,
  emails_sent_period: emailSent.filter(inPeriod).length,
  emails_blocked_total: ofType('email_blocked').length,
  launch_emails_sent: emailSent.filter((e) => txt(e.lane) === '5').length,
  prospects_total: prospects.length,
  prospects_contacted: contacted,
  prospects_replied: replied,
  prospects_interested: prospects.filter((p) => ['interested', 'won'].includes(status(p))).length,
  outreach_reply_rate_pct: contacted > 0 ? Math.round((replied / contacted) * 1000) / 10 : 0,
  replies_total: ofType('reply_received').length,
  hot_alerts_total: ofType('hot_alert_sent').length,
  channel_posts_total: ofType('content_published').filter((e) => txt(e.channel) === 'telegram_channel').length + ofType('launch_post_published').length,
  ai_calls_total: ofType('ai_call').length,
  ai_fallbacks_total: ofType('ai_fallback').length,
  ai_failures_total: ofType('ai_failed').length,
  errors_period: ofType('error').filter(inPeriod).length,
  last_report_at: now.toFormat(STAMP),
};
return [{ json: { metrics, period_start: periodStartText, period_text: periodStart ? `since ${periodStart.toFormat('d LLL HH:mm')}` : 'all time (first report)' } }];
