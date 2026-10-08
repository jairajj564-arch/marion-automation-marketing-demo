// Decides whether a report is due (SPEC 7.8). L = time of the latest `report_sent` event.
//  demo mode: due if there is no report yet, or now - L >= DEMO_REPORT_EVERY_MINUTES
//  real mode: due if now >= today at REPORT_TIME and L is before today's REPORT_TIME (or there is none)
const S = $('Lane LANE_N · Settings to object').first().json;
//@include time
const now = $now.setZone(TZ);

let last = null;
for (const row of rowsOf('Lane LANE_N · Read EVENTS_LOG')) {
  if (String(row.event_type ?? '').trim() !== 'report_sent') continue;
  const t = parseTs(row.ts);
  if (t && (!last || t.toMillis() > last.toMillis())) last = t;
}

let due = false;
let reason = '';
if (S.IS_DEMO) {
  const every = Number(S.DEMO_REPORT_EVERY_MINUTES);
  if (!(every > 0)) throw new Error('DEMO_REPORT_EVERY_MINUTES must be a number above 0 in demo mode');
  if (!last) { due = true; reason = 'no report has been sent yet'; }
  else {
    const minutes = (now.toMillis() - last.toMillis()) / 60000;
    due = minutes >= every;
    reason = `${minutes.toFixed(1)} min since the last report (every ${every})`;
  }
} else {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(S.REPORT_TIME));
  if (!match) throw new Error('REPORT_TIME must look like 21:00');
  const todayAt = now.startOf('day').set({ hour: Number(match[1]), minute: Number(match[2]) });
  due = now.toMillis() >= todayAt.toMillis() && (!last || last.toMillis() < todayAt.toMillis());
  reason = `today's report time is ${S.REPORT_TIME}`;
}
return [{ json: { due, reason, period_start: last ? last.toFormat(STAMP) : '' } }];
