// ONLY the key column and the LEADS columns Lane 5 owns (SPEC 5.4).
return $input.all().flatMap((item) => item.json.updates.map((u) => ({ json: u })));
