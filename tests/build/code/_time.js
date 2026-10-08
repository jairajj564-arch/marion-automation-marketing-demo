// ---- time helpers (SPEC 5.2 / 5.3)
const TZ = 'Asia/Kolkata';
const STAMP = "yyyy-MM-dd'T'HH:mm:ssZZ";
const nowTs = () => $now.setZone(TZ).toFormat(STAMP);
function parseTs(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const text = String(value).trim();
  const tries = [
    () => DateTime.fromISO(text, { zone: TZ }),
    () => DateTime.fromFormat(text, 'yyyy-MM-dd HH:mm:ss', { zone: TZ }),
    () => DateTime.fromFormat(text, 'yyyy-MM-dd HH:mm', { zone: TZ }),
    () => DateTime.fromFormat(text, 'dd/MM/yyyy HH:mm:ss', { zone: TZ }),
    () => DateTime.fromFormat(text, 'dd/MM/yyyy', { zone: TZ }),
  ];
  for (const attempt of tries) { const d = attempt(); if (d.isValid) return d.setZone(TZ); }
  return null;
}
const parseDate = (value) => parseTs(value)?.startOf('day') ?? null;
const addDays = (dateTime, days) => dateTime.plus({ milliseconds: Number(days) * S.DAY_MS });
function launchAt(S) {
  if (S.IS_DEMO) return parseTs(S.DEMO_LAUNCH_AT);
  const [hour, minute] = String(S.LAUNCH_TIME).split(':').map(Number);
  return parseDate(S.LAUNCH_DATE)?.set({ hour, minute }) ?? null;
}
const gapOk = (row, now) => !parseTs(row.last_contacted_at) || now.toMillis() - parseTs(row.last_contacted_at).toMillis() >= Number(S.MIN_EMAIL_GAP_DAYS) * S.DAY_MS;
const isTrue = (value) => String(value ?? '').trim().toUpperCase() === 'TRUE';
// Rows read from a sheet; an empty tab comes back as one empty item (and blank rows only have a row_number), so drop those.
const rowsOf = (nodeName) => $(nodeName).all().map((item) => item.json).filter((row) => row && Object.entries(row).some(([key, v]) => key !== 'row_number' && String(v ?? '').trim() !== ''));
