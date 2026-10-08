// ---- event builder (SPEC 5.6)
const used = new Set();
function eventId() {
  let id;
  do { id = `EV-${now.toFormat('yyyyMMddHHmmssSSS')}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')}`; } while (used.has(id));
  used.add(id);
  return id;
}
function event({ event_type, entity_type, entity_id = '', status_from = '', status_to = '', channel = '', detail = '', meta = {} }) {
  return {
    event_id: eventId(), ts: now.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"), lane: __N__,
    event_type, entity_type, entity_id, status_from, status_to, channel,
    detail: String(detail).slice(0, 200), meta_json: JSON.stringify(meta),
    execution_id: String($execution.id), demo_mode: S.IS_DEMO ? 'TRUE' : 'FALSE',
  };
}
