// One SEQUENCES update per step: ONLY step_key + broadcast_done_at (SPEC 5.4).
return $input.all().flatMap((item) => item.json.updates.map((u) => ({ json: u })));
