// Pause between two emails (SEND_DELAY_SECONDS). Only after an attempt to send; nothing else needs a pause.
const S = $('Lane LANE_N · Settings to object').first().json;
const attempted = $input.all().some((item) => ['email_sent', 'email_failed'].includes(item.json.event_type));
return [{ json: { pause_seconds: attempted ? Math.min(60, Math.max(0, Number(S.SEND_DELAY_SECONDS) || 0)) : 0 } }];
