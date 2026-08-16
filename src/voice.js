/**
 * Dictation: speech in, text the teacher would have typed out.
 *
 * The pipeline mirrors the VoiceKey keyboard so both tools produce the same voice:
 *
 *   audio -> gpt-4o-transcribe -> gpt-4.1-mini cleanup -> text
 *
 * Two decisions carried over from VoiceKey, both deliberate:
 *
 *  - Transcription and cleanup are separate calls. The speech model is chosen for
 *    accuracy on accents and Irish-language terms; the cleanup model is chosen for
 *    grammar normalisation. One model doing both is worse at each.
 *  - Cleanup is best-effort. If it fails or times out, the raw transcript is
 *    returned rather than nothing, because a teacher can tidy punctuation far more
 *    easily than they can re-record a paragraph they have already said.
 *
 * The one thing that differs from VoiceKey: Irish corrections are dictated with
 * `light` cleanup, which is forbidden from touching Irish wording. Aggressive
 * cleanup on a corrections list would rewrite the very thing being taught.
 */
import OpenAI from 'openai';
import { getOpenAIConfig, getSetting } from './settings.js';

const CLEANUP_TIMEOUT_MS = 12_000;
const MAX_AUDIO_SECONDS = 15 * 60;

export const VOICE_MIME_TYPES = new Set([
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/flac',
]);

/** Extension the OpenAI audio endpoint will accept for a given browser MIME type. */
export function audioExtension(mimeType = '') {
  const base = String(mimeType).split(';')[0].trim().toLowerCase();
  return {
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mp4': '.mp4',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/aac': '.m4a',
    'audio/flac': '.flac',
  }[base] || '.webm';
}

export async function getDictationConfig() {
  const stored = await getSetting('dictation', {});
  return {
    transcribeModel: stored.transcribeModel || 'gpt-4o-transcribe',
    cleanupModel: stored.cleanupModel || 'gpt-4.1-mini',
    language: stored.language || 'auto',
    dictionary: Array.isArray(stored.dictionary) ? stored.dictionary : [],
  };
}

async function client() {
  const openai = await getOpenAIConfig();
  if (!openai.apiKey) {
    throw Object.assign(new Error('Add an OpenAI API key on the OpenAI & prompts screen before using dictation.'), { status: 409 });
  }
  return new OpenAI({ apiKey: openai.apiKey });
}

/**
 * Raw transcript for one recording.
 *
 * The dictionary is passed as the transcription prompt, which biases recognition
 * toward those spellings — the same trick VoiceKey uses so "teg be two" comes back
 * as "TEG B2" rather than being invented later by the cleanup model.
 */
export async function transcribe({ buffer, mimeType, filename }) {
  const config = await getDictationConfig();
  const openai = await client();
  const file = await OpenAI.toFile(buffer, filename || `dictation${audioExtension(mimeType)}`, { type: String(mimeType).split(';')[0] });
  const response = await openai.audio.transcriptions.create({
    file,
    model: config.transcribeModel,
    ...(config.language && config.language !== 'auto' ? { language: config.language } : {}),
    ...(config.dictionary.length ? { prompt: `Names and terms: ${config.dictionary.join(', ')}` } : {}),
  });
  return String(response.text || '').trim();
}

/** Best-effort cleanup. Returns the raw transcript unchanged if the model cannot help. */
export async function cleanup(transcript, mode = 'full') {
  if (!transcript) return { text: '', cleaned: false };
  const config = await getDictationConfig();
  const prompts = await getSetting('voicePrompts', {});
  const template = mode === 'light' ? prompts.lightPrompt : prompts.cleanupPrompt;
  if (!template) return { text: transcript, cleaned: false, reason: 'No cleanup prompt is configured.' };

  const instructions = template.replace(/\{\{\s*dictionary\s*\}\}/g, config.dictionary.join(', ') || '(none)');
  try {
    const openai = await client();
    const response = await openai.chat.completions.create({
      model: config.cleanupModel,
      max_tokens: 2000,
      messages: [{ role: 'system', content: instructions }, { role: 'user', content: transcript }],
    }, { timeout: CLEANUP_TIMEOUT_MS });
    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) return { text: transcript, cleaned: false, reason: 'Cleanup returned nothing.' };
    return { text, cleaned: true };
  } catch (error) {
    // Never lose the recording to a cleanup failure.
    console.error('Dictation cleanup failed, falling back to the raw transcript', error);
    return { text: transcript, cleaned: false, reason: error.message };
  }
}

export async function dictate({ buffer, mimeType, filename, mode = 'full' }) {
  const raw = await transcribe({ buffer, mimeType, filename });
  if (!raw) {
    throw Object.assign(new Error('No speech was detected in that recording.'), { status: 422 });
  }
  const result = await cleanup(raw, mode);
  return { text: result.text, raw, cleaned: result.cleaned, reason: result.reason };
}

export function assertRecordingLength(seconds) {
  if (Number(seconds) > MAX_AUDIO_SECONDS) {
    throw Object.assign(new Error(`Recordings are limited to ${MAX_AUDIO_SECONDS / 60} minutes.`), { status: 413 });
  }
}

/**
 * Shapes a check-in or homework row for the browser.
 *
 * The on-disk filename never leaves the server. Clients get a URL on the
 * authenticated media route instead, so a recording of one student's feedback
 * cannot be fetched by anyone else even if the link is guessed or shared.
 */
export function withVoiceNote(row, type) {
  if (!row) return row;
  const { teacher_audio_path: storedPath, ...rest } = row;
  return {
    ...rest,
    voice_note: storedPath
      ? {
          url: `/api/media/voice-note/${type}/${row.id}`,
          mime: row.teacher_audio_mime || 'audio/webm',
          seconds: row.teacher_audio_seconds || 0,
          recordedAt: row.teacher_audio_recorded_at,
        }
      : null,
  };
}

/** Same treatment for a list of rows. */
export function withVoiceNotes(rows, type) {
  return (rows || []).map((row) => withVoiceNote(row, type));
}
