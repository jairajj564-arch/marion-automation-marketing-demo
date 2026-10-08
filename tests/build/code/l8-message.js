// Builds the Telegram report for the owner (SPEC 7.8). All numbers come from the computed metrics; insights (if any) from the AI check.
const S = $('Lane LANE_N · Settings to object').first().json;
const computed = $('Lane LANE_N · Compute metrics').first().json;
const m = computed.metrics;
const ai = $input.first().json;
const tg = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const lines = [
  '📊 <b>Kaya Jewels · campaign report</b>',
  `<i>Period: ${tg(computed.period_text)}</i>`,
  '',
  `<b>Content</b>: ${m.content_pending_approval} waiting for approval · ${m.content_published} published (of ${m.content_total})`,
  `<b>Leads</b>: ${m.leads_total} total · ${m.leads_new_period} new this period · ${m.leads_hot} hot`,
  `<b>Emails</b>: ${m.emails_sent_total} sent in total (${m.emails_sent_period} this period)`,
  `<b>Outreach</b>: ${m.prospects_contacted} contacted · ${m.prospects_replied} replied · ${m.prospects_interested} interested · reply rate ${m.outreach_reply_rate_pct}%`,
  `<b>AI</b>: ${m.ai_fallbacks_total} fallbacks to Groq`,
  `<b>Errors</b>: ${m.errors_period} this period`,
];
if (ai.ai_ok && ai.insights?.length) {
  lines.push('', '<b>Insights</b>');
  for (const insight of ai.insights) lines.push(`• ${tg(insight)}`);
}
lines.push('', `<a href="${String(S.SHEET_URL).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">Open the campaign sheet</a>`);
return [{ json: { chat_id: String(S.TELEGRAM_OWNER_CHAT_ID), text: lines.join('\n').slice(0, 4000), ai } }];
