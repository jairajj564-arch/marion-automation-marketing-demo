// Lane 2 · Build problem update
// The Sheets "update" node writes EVERY field it receives, so send it only the key + the columns Lane 2 owns.
/*@include time*/
return $input.all().map((item) => ({
  json: { content_id: item.json.content_id, last_error: item.json.last_error, updated_at: item.json.updated_at },
}));
