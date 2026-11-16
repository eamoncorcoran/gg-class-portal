/**
 * Small versions of profile pictures.
 *
 * A profile picture is whatever somebody's phone took: three or four megabytes,
 * four thousand pixels across. It is shown as a circle forty pixels wide. The
 * board draws thirty or forty of them at once, and every one used to be sent
 * whole, so opening the community meant downloading a hundred megabytes of
 * photographs to draw a column of thumbnails.
 *
 * So each picture gets a small copy, made the first time anybody asks for it and
 * kept on the disk beside the original. The original is never changed, and if a
 * small copy cannot be made (a format the library cannot read, the library not
 * there at all) the original is what is sent, exactly as before.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { query } from './db.js';

/* The shorter side, in pixels. The biggest a face is drawn anywhere is about a
   hundred and thirty points, so this stays sharp on a phone's dense screen and
   still comes to twenty kilobytes or so. */
export const AVATAR_PX = 320;
const thumbDir = path.join(config.privateUploadDir, 'avatar-thumbs');
const thumbPath = (stored) => path.join(thumbDir, `${path.basename(stored)}-${AVATAR_PX}.webp`);

/* Loaded on first use, and allowed to fail. An image library is a native
   module: if it will not load on some machine, pictures are slower there, and
   that is all. It must never be the reason the portal does not start. */
let loading;
function loadSharp() {
  loading ||= import('sharp').then((module) => module.default).catch((error) => {
    console.error(`Small profile pictures are off, the image library did not load: ${error.message}`);
    return null;
  });
  return loading;
}

/* One at a time for each picture: twenty requests for a new face make one copy. */
const making = new Map();
/* A picture that could not be shrunk is not tried again on every request. */
const failed = new Set();

/** The small copy of a stored picture, made if it is not there yet. Null when there cannot be one. */
export async function avatarThumb(file, stored) {
  const out = thumbPath(stored);
  if (failed.has(out)) return null;
  if (fs.existsSync(out)) return out;
  if (!making.has(out)) {
    making.set(out, (async () => {
      const sharp = await loadSharp();
      if (!sharp) return null;
      await fs.promises.mkdir(thumbDir, { recursive: true });
      // Written beside itself and moved into place, so a half-written file is never served.
      const partial = `${out}.${process.pid}.${Date.now()}.part`;
      try {
        await sharp(file, { failOn: 'none' })
          .rotate() // a phone stores "this way up" as a note beside the pixels; the note is not kept
          .resize({ width: AVATAR_PX, height: AVATAR_PX, fit: 'outside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(partial);
        await fs.promises.rename(partial, out);
        return out;
      } catch (error) {
        await fs.promises.unlink(partial).catch(() => {});
        failed.add(out);
        console.error(`Could not make a small copy of ${path.basename(stored)}: ${error.message}`);
        return null;
      }
    })().finally(() => making.delete(out)));
  }
  return making.get(out);
}

/** Gone with the picture it was made from: a replaced photograph, a deleted account. */
export async function removeAvatarThumb(stored) {
  if (!stored) return;
  failed.delete(thumbPath(stored));
  await fs.promises.unlink(thumbPath(stored)).catch(() => {});
}

/* The pictures already on the disk, shrunk quietly after start so that nobody's
   first look at the board is the one that pays for them. One at a time with a
   breath between, because this shares a small machine with a class in progress. */
export async function warmAvatarThumbs({ resolve, pause = 200 } = {}) {
  if (!(await loadSharp())) return 0;
  let made = 0;
  try {
    const users = await query('SELECT avatar_path FROM users WHERE avatar_path IS NOT NULL');
    for (const user of users.rows) {
      const out = thumbPath(user.avatar_path);
      if (fs.existsSync(out)) continue;
      const file = resolve(user.avatar_path);
      if (!file) continue;
      if (await avatarThumb(file, user.avatar_path)) made += 1;
      await new Promise((done) => { setTimeout(done, pause); });
    }
  } catch (error) {
    console.error(`Preparing small profile pictures stopped early: ${error.message}`);
  }
  return made;
}
