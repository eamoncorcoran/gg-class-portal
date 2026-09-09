/**
 * The timer behind the board's notifications.
 *
 * Only scheduled posts need it. One written and published now is announced by
 * the route that wrote it; a scheduled one becomes visible because the clock
 * passed, and nothing runs at that moment to notice — so something has to come
 * along and look.
 */
import cron from 'node-cron';
import { config } from './config.js';
import { notifyPublishedPosts } from './boardnotify.js';

export function startBoardNotifier() {
  cron.schedule(config.boardEmailCron, () => {
    notifyPublishedPosts().catch((error) => console.error('Board notification sweep failed', error));
  }, { noOverlap: true });
}
