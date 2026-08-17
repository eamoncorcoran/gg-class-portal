import cron from 'node-cron';
import { importWatched, importConfigured } from './zoomimport.js';
import { config } from './config.js';

/**
 * A safety net rather than the main route.
 *
 * The webhook brings a recording across within minutes of Zoom finishing with
 * it. This sweep exists for the times the webhook did not arrive — the server
 * was restarting, Zoom gave up retrying, the endpoint was briefly unreachable —
 * and it only ever touches webinars already marked for automatic import.
 *
 * Hourly, because a class recording that appears an hour late is nobody's
 * emergency, and because sweeping more often mostly means asking Zoom the same
 * question repeatedly.
 */
export function startZoomScheduler() {
  const expression = process.env.ZOOM_SWEEP_CRON || '20 * * * *';
  if (!cron.validate(expression)) {
    console.error(`Invalid ZOOM_SWEEP_CRON: ${expression}`);
    return;
  }
  cron.schedule(expression, async () => {
    if (!importConfigured()) return;
    try {
      const result = await importWatched();
      if (result.imported) console.log(`Zoom sweep imported ${result.imported} recording(s)`);
    } catch (error) {
      console.error('Zoom sweep failed', error);
    }
  }, { timezone: config.defaultTimezone });
}
