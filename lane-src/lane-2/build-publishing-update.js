// Lane 2 · Build publishing update: first touch of a newsletter, approved -> publishing.
/*@include time*/
const row = $input.first().json;
return [{ json: { content_id: row.content_id, status: 'publishing', updated_at: nowTs() } }];
