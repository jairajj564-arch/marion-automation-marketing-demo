// ---- time helpers (SPEC 5.2 / 5.3)
const TZ = 'Asia/Kolkata';
const STAMP = "yyyy-MM-dd'T'HH:mm:ssZZ";
const now = $now.setZone(TZ);
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
// Gap rule before ANY automated email to a person (SPEC 5.3)
const gapOk = (row, at) => !parseTs(row.last_contacted_at) || at.toMillis() - parseTs(row.last_contacted_at).toMillis() >= Number(S.MIN_EMAIL_GAP_DAYS) * S.DAY_MS;
const isTrue = (value) => String(value ?? '').trim().toUpperCase() === 'TRUE';
