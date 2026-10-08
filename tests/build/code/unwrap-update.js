// The Google Sheets update node writes every field it receives, so pass on ONLY the key column
// and the columns this lane owns (SPEC 5.4).
return { json: $json.row_update };
