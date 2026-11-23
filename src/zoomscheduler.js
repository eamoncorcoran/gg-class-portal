import cron from 'node-cron';
import { importWatched, importConfigured } from './zoomimport.js';
import { syncAttendance } from './zoomattendance.js';
import { finishMoves } from './lessonmoves.js';
import { zoomConfigured } from './zoom.js';
import { config } from './config.js';
import { finishVideoImports, warmPending } from './courseimport.js';

/**
 * A safety net rather than the main route.
 *
 * The webhook brings a recording across within minutes of Zoom finishing with
 * it, and reads the attendance report once a webinar ends. This sweep exists
 * for the times the webhook did not arrive: the server was restarting, Zoom
 * gave up retrying, the endpoint was briefly unreachable. It only ever
 * imports recordings from webinars already marked for automatic import, and
 * only reads attendance for classes whose Zoom link names a webinar.
 *
 * Hourly, because a class recording that appears an hour late is nobody's
 * emergency, and because sweeping more often mostly means asking Zoom the
 * same question repeatedly.
 */
export function startZoomScheduler() {
  const expression = process.env.ZOOM_SWEEP_CRON || '20 * * * *';
  if (!cron.validate(expression)) {
    console.error(`Invalid ZOOM_SWEEP_CRON: ${expression}`);
    return;
  }
  cron.schedule(expression, async () => {
    if (importConfigured()) {
      try {
        const result = await importWatched();
        if (result.imported) console.log(`Zoom sweep imported ${result.imported} recording(s)`);
      } catch (error) {
        console.error('Zoom sweep failed', error);
      }
    }
    /* A lesson being moved off a Zoom link is switched over once Bunny has
       finished with its copy. The move's own worker does that; this catches
       any it was not around for, after a restart. */
    try { await finishMoves(); } catch (error) { console.error('Finishing lesson video moves failed', error); }
    // And the videos of an imported course, the same way.
    try { await finishVideoImports(); } catch (error) { console.error('Finishing course video imports failed', error); }
    try { await warmPending(); } catch (error) { console.error('Warming imported videos failed', error); }
    if (zoomConfigured()) {
      try {
        const result = await syncAttendance();
        const fresh = (result.classes || []).reduce((a, c) => a + (c.newSittings || 0), 0);
        if (fresh) console.log(`Zoom sweep read attendance for ${fresh} sitting(s)`);
      } catch (error) {
        console.error('Zoom attendance sweep failed', error);
      }
    }
  }, { timezone: config.defaultTimezone });
}
