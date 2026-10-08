// Shared helpers for the lane tests.
export const ist = (offsetMinutes = 0) => {
  const d = new Date(Date.now() + offsetMinutes * 60000 + 330 * 60000);
  return `${d.toISOString().slice(0, 19)}+05:30`;
};
export const minutesBetween = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
