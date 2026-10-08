// One clean row per metric: ONLY metric_key, value and updated_at (SPEC 5.4: DASHBOARD is written by Append or Update on metric_key).
const { metrics } = $input.first().json;
const ts = $now.setZone('Asia/Kolkata').toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
return Object.entries(metrics).map(([metric_key, value]) => ({ json: { metric_key, value, updated_at: ts } }));
