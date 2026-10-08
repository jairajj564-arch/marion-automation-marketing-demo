// Turns the outcome(s) of this loop round into EVENTS_LOG rows (SPEC 5.6).
const S = $('Lane LANE_N · Settings to object').first().json;
const TZ = 'Asia/Kolkata';
//@include events
const rows = [];
$input.all().forEach((item, index) => {
  const decided = $('Lane LANE_N · Decide outcome').itemMatching(index).json;
  for (const e of decided.events) rows.push({ json: event(e) });
});
return rows;
