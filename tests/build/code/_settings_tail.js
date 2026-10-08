settings.IS_DEMO = String(settings.DEMO_MODE).trim().toUpperCase() === 'TRUE';
const demoMinutes = Number(settings.DEMO_MINUTES_PER_DAY);
if (settings.IS_DEMO && !(demoMinutes > 0)) {
  throw new Error('DEMO_MINUTES_PER_DAY must be a number above 0 when DEMO_MODE is TRUE');
}
settings.DAY_MS = settings.IS_DEMO ? demoMinutes * 60 * 1000 : 24 * 60 * 60 * 1000;

return [{ json: settings }];
