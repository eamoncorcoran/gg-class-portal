/**
 * Practice support: the voice list, "hear it" audio, phonetic respellings and
 * the batch transcription fallback. The live mic is in speech.js.
 */
import { scoreAttempt } from '../../public/live/scoring.js';
import { VOICES, ttsFor, knownVoice } from './tts.js';

export function voices() { return VOICES; }

export async function ttsRoute(req, res) {
  const text = String(req.query.text || '').slice(0, 200).trim();
  const voice = String(req.query.voice || '').slice(0, 40).trim();
  if (!text) return res.status(400).json({ error: 'No text.' });
  if (voice && !knownVoice(voice)) return res.status(400).json({ error: 'Unknown voice.' });
  const buf = await ttsFor(text, voice);
  if (!buf) return res.status(502).json({ error: 'No voice available.' });
  // The text and voice are in the URL, so the browser can keep a clip for a
  // month without ever playing the wrong one.
  res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=2592000' });
  res.send(buf);
}

/* Phonetic respelling for the Phonetics toggle: intuitive English respelling,
   no IPA. Cached per phrase. */
const phonCache = new Map();
export async function phoneticsRoute(req, res) {
  const text = String(req.query.text || '').slice(0, 200).trim();
  if (!text) return res.status(400).json({ error: 'No text.' });
  if (phonCache.has(text)) return res.json({ phonetic: phonCache.get(text) });
  if (!process.env.OPENAI_API_KEY) return res.status(502).json({ error: 'No phonetics available.' });
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0,
        messages: [{ role: 'user', content: `Give an intuitive, easy-to-read English phonetic respelling of this Irish phrase for absolute beginners (like 'slawn' for 'slán'). NO IPA symbols, simple lowercase syllables with hyphens inside words. Keep the same number of words. Reply with ONLY the respelling: ${text}` }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    const phonetic = (j.choices?.[0]?.message?.content || '').trim().replace(/^["“]|["”]$/g, '');
    if (!phonetic) throw new Error('empty');
    phonCache.set(text, phonetic);
    if (phonCache.size > 300) phonCache.delete(phonCache.keys().next().value);
    res.json({ phonetic });
  } catch (error) {
    console.error('phonetics failed', error?.message);
    res.status(502).json({ error: 'No phonetics available.' });
  }
}

/* Batch fallback when the live mic is unavailable: transcribe the recording
   and grade it with the same scoring the browser uses. */
export async function analyzeRoute(req, res) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: 'Recorded practice is not set up on this portal.' });
  const { audioBase64, mime = 'audio/webm', target = '', partial = false } = req.body || {};
  const cleanTarget = String(target).slice(0, 200).trim();
  if (!cleanTarget) return res.status(400).json({ error: 'No target phrase.' });
  if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.length > 4_500_000) return res.status(400).json({ error: 'Bad audio.' });
  const audio = Buffer.from(audioBase64, 'base64');
  if (audio.length < 1000) return res.status(400).json({ error: 'Recording too short.' });
  const form = new FormData();
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : (mime.includes('mpeg') || mime.includes('mp3')) ? 'mp3' : mime.includes('wav') ? 'wav' : 'webm';
  form.append('file', new Blob([audio], { type: mime }), `attempt.${ext}`);
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('prompt', 'Seo comhrá as Gaeilge.');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: form, signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) {
    console.error('transcription error', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return res.status(502).json({ error: 'Could not hear that. Try again.' });
  }
  const { text = '' } = await r.json();
  const result = scoreAttempt(cleanTarget, text, { partial: Boolean(partial) });
  res.json({ transcript: text, ...result });
}
