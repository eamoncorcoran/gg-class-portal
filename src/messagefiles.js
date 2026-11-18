import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { VOICE_MIME_TYPES, audioExtension } from './voice.js';

/**
 * What may be attached to a private message, and by whom.
 *
 * A student may send a PDF or a Word document and nothing else: that is what
 * homework, a form or a letter arrives as, and it is a short list to keep safe.
 * The teacher may also send pictures, slides, spreadsheets, plain text and
 * audio, and may record a voice note. A student may not send a voice note.
 *
 * A file is what its first bytes say it is. The name and the type the browser
 * reports are only used to tell apart formats that share a container (every
 * modern Office file is a zip), never to let something through.
 */

export const MAX_FILES = 5;
export const MAX_FILE_MB = 10;
export const MAX_VOICE_MINUTES = 15;

const KINDS = {
  pdf: { label: 'PDF', mime: 'application/pdf', ext: '.pdf' },
  docx: { label: 'Word document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
  doc: { label: 'Word document', mime: 'application/msword', ext: '.doc' },
  pptx: { label: 'PowerPoint', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
  xlsx: { label: 'Excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  jpg: { label: 'picture', mime: 'image/jpeg', ext: '.jpg' },
  png: { label: 'picture', mime: 'image/png', ext: '.png' },
  gif: { label: 'picture', mime: 'image/gif', ext: '.gif' },
  webp: { label: 'picture', mime: 'image/webp', ext: '.webp' },
  mp3: { label: 'audio', mime: 'audio/mpeg', ext: '.mp3' },
  m4a: { label: 'audio', mime: 'audio/mp4', ext: '.m4a' },
  txt: { label: 'text file', mime: 'text/plain', ext: '.txt' },
};
export const STUDENT_KINDS = Object.freeze(['pdf', 'docx', 'doc']);
export const TEACHER_KINDS = Object.freeze(Object.keys(KINDS));
/** For the file picker: what each side is offered. The server decides again on arrival. */
export const acceptFor = (role) => (role === 'admin' ? TEACHER_KINDS : STUDENT_KINDS).map((kind) => KINDS[kind].ext).join(',');

const starts = (buffer, bytes, at = 0) => bytes.every((byte, index) => buffer[at + index] === byte);

/** What the file is, read from its first bytes. Null for anything not on the list. */
export function sniffFile(buffer, fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (!buffer || buffer.length < 4) return null;
  if (starts(buffer, [0x25, 0x50, 0x44, 0x46])) return 'pdf';                                   // %PDF
  if (starts(buffer, [0x50, 0x4b, 0x03, 0x04])) return { '.docx': 'docx', '.pptx': 'pptx', '.xlsx': 'xlsx' }[ext] || null; // a zip: Office, told apart by name
  if (starts(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return ext === '.doc' ? 'doc' : null;             // the old Office container
  if (starts(buffer, [0xff, 0xd8, 0xff])) return 'jpg';
  if (starts(buffer, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (starts(buffer, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (starts(buffer, [0x52, 0x49, 0x46, 0x46]) && starts(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (starts(buffer, [0x49, 0x44, 0x33]) || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0 && ext === '.mp3')) return 'mp3';
  if (starts(buffer, [0x66, 0x74, 0x79, 0x70], 4) && ['.m4a', '.mp4'].includes(ext)) return 'm4a';
  // Plain text: named .txt and nothing in the first stretch that is not text.
  if (ext === '.txt' && !buffer.subarray(0, 4096).includes(0)) return 'txt';
  return null;
}

const refuse = (message, status = 400) => Object.assign(new Error(message), { status });

/* Held in memory just long enough to be looked at and written to the private
   store. The ceiling here is the voice note's; attachments have a lower one,
   checked below. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: MAX_FILES + 1 },
}).fields([{ name: 'files', maxCount: MAX_FILES }, { name: 'voice', maxCount: 1 }]);

/** Reads the files off a message being sent. A plain JSON message passes straight through. */
export const receiveMessageFiles = (req, res, next) => upload(req, res, (error) => {
  if (!error) return next();
  if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') return next(refuse(`A message can carry up to ${MAX_FILES} files.`));
  if (error.code === 'LIMIT_FILE_SIZE') return next(refuse(`That file is too large. Attachments can be up to ${MAX_FILE_MB}MB.`, 413));
  return next(error);
});

/**
 * Checks what was attached against what this sender may send, and returns it
 * ready to store: [{ kind: 'file' | 'voice', buffer, fileName, mimeType, size, seconds }].
 * Throws, with a sentence the sender can act on, at the first thing not allowed.
 */
export function checkMessageFiles(req, { role }) {
  const out = [];
  const allowed = role === 'admin' ? TEACHER_KINDS : STUDENT_KINDS;
  for (const file of req.files?.files || []) {
    const name = String(file.originalname || 'file').slice(0, 200);
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw refuse(`"${name}" is too large. Attachments can be up to ${MAX_FILE_MB}MB.`, 413);
    const kind = sniffFile(file.buffer, name);
    if (!kind || !allowed.includes(kind)) {
      throw refuse(role === 'admin'
        ? `"${name}" is not a kind of file that can be sent here. Send a PDF, a Word, PowerPoint or Excel file, a picture, an MP3 or a text file.`
        : `"${name}" cannot be sent. You can attach a PDF or a Word document.`);
    }
    out.push({ kind: 'file', buffer: file.buffer, fileName: name, mimeType: KINDS[kind].mime, size: file.size, seconds: null, ext: KINDS[kind].ext });
  }
  const voice = req.files?.voice?.[0];
  if (voice) {
    if (role !== 'admin') throw refuse('Voice notes are for the teacher. You can write a message, or attach a PDF or a Word document.', 403);
    const mime = String(voice.mimetype).split(';')[0];
    if (!VOICE_MIME_TYPES.has(mime)) throw refuse('That recording is in a format that cannot be played back. Try recording it again.');
    const seconds = Math.max(0, Math.round(Number(req.body?.voiceSeconds) || 0));
    if (seconds > MAX_VOICE_MINUTES * 60) throw refuse(`Voice notes are limited to ${MAX_VOICE_MINUTES} minutes.`, 413);
    out.push({ kind: 'voice', buffer: voice.buffer, fileName: 'Voice note', mimeType: mime, size: voice.size, seconds, ext: audioExtension(mime) || '.webm' });
  }
  return out;
}

/** Writes one checked file to the private store and returns the name it was given. */
export async function storeMessageFile(file) {
  const storedName = `message-${crypto.randomUUID()}${file.ext}`;
  await fs.writeFile(path.join(config.privateUploadDir, storedName), file.buffer);
  return storedName;
}

export const removeStoredMessageFile = (storedName) => fs.unlink(path.join(config.privateUploadDir, path.basename(storedName))).catch(() => {});
