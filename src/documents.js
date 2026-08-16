/**
 * Reading a student's uploaded homework.
 *
 * The correction pipeline is a text model, so a photo of handwritten Irish is
 * useless to it until somebody has read the handwriting. Each format takes the
 * shortest reliable route:
 *
 *  - images  -> the vision model, told to transcribe exactly what is written and
 *               to invent nothing. Handwriting is the common case here.
 *  - PDF     -> the same model, which accepts a PDF directly, so a scan and a
 *               typed document both work without a local PDF parser.
 *  - .docx   -> unzipped locally and the text pulled out of the XML. No model
 *               call, because there is nothing to interpret.
 *  - .txt    -> read as-is.
 *
 * Extraction never blocks a submission. If it fails the file is still saved and
 * the teacher still sees it; only the automatic correction goes without it.
 */
import { unzipSync, strFromU8 } from 'fflate';
import OpenAI from 'openai';
import { getOpenAIConfig } from './settings.js';
import { getDictationConfig } from './voice.js';

/** The formats a teacher can choose to accept, and what each one covers. */
export const FILE_TYPE_GROUPS = Object.freeze({
  image: {
    label: 'Photos and images',
    hint: 'A photo or scan of handwritten work',
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
  },
  pdf: {
    label: 'PDF',
    hint: 'Scans and exported documents',
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
  },
  word: {
    label: 'Word documents',
    hint: '.docx from Word, Pages or Google Docs',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    extensions: ['.docx'],
  },
  text: {
    label: 'Plain text',
    hint: '.txt files',
    mimeTypes: ['text/plain'],
    extensions: ['.txt'],
  },
});

export function mimeTypesFor(groups = []) {
  return new Set(groups.flatMap((group) => FILE_TYPE_GROUPS[group]?.mimeTypes || []));
}

export function acceptAttributeFor(groups = []) {
  return groups.flatMap((group) => FILE_TYPE_GROUPS[group]?.extensions || []).join(',');
}

export function groupForMimeType(mimeType = '') {
  const base = String(mimeType).split(';')[0].trim().toLowerCase();
  return Object.entries(FILE_TYPE_GROUPS).find(([, group]) => group.mimeTypes.includes(base))?.[0] || null;
}

/** Word documents are zip archives; the text lives in word/document.xml. */
function extractDocx(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const document = files['word/document.xml'];
  if (!document) throw new Error('That .docx file has no readable document body.');
  const xml = strFromU8(document);
  return xml
    // Paragraph and line breaks become real newlines before the tags are stripped.
    .replace(/<w:p[ >]/g, '\n<w:p ')
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<w:tab\s*\/?>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const READ_INSTRUCTIONS = `You are transcribing a student's Irish-language homework so a teacher can correct it.
Write out exactly what is on the page, including any mistakes. Do not correct spelling, grammar or mutations — the errors are the point.
Keep the original line and paragraph breaks, and keep question numbers.
If the page is blank or unreadable, say exactly: (nothing legible on this page)
Output only the transcription, with no commentary.`;

async function readWithModel({ buffer, mimeType, fileName }) {
  const openai = await getOpenAIConfig();
  if (!openai.apiKey) throw Object.assign(new Error('OpenAI is not configured, so uploaded work cannot be read automatically.'), { status: 409 });
  const client = new OpenAI({ apiKey: openai.apiKey });
  const dictation = await getDictationConfig();
  const base64 = Buffer.from(buffer).toString('base64');
  const terms = dictation.dictionary.length ? `\n\nTerms this course uses: ${dictation.dictionary.join(', ')}.` : '';

  const content = mimeType === 'application/pdf'
    ? [{ type: 'input_text', text: READ_INSTRUCTIONS + terms },
       { type: 'input_file', filename: fileName || 'homework.pdf', file_data: `data:application/pdf;base64,${base64}` }]
    : [{ type: 'input_text', text: READ_INSTRUCTIONS + terms },
       { type: 'input_image', image_url: `data:${String(mimeType).split(';')[0]};base64,${base64}` }];

  const response = await client.responses.create({
    model: openai.model,
    input: [{ role: 'user', content }],
  });
  return String(response.output_text || '').trim();
}

/**
 * Returns { text, state, error } for one uploaded file.
 * Never throws: a failed read must not cost the student their submission.
 */
export async function extractText({ buffer, mimeType, fileName }) {
  const group = groupForMimeType(mimeType);
  try {
    if (group === 'text') return { text: Buffer.from(buffer).toString('utf8').trim(), state: 'done' };
    if (group === 'word') return { text: extractDocx(buffer), state: 'done' };
    if (group === 'image' || group === 'pdf') {
      const text = await readWithModel({ buffer, mimeType, fileName });
      return { text, state: 'done' };
    }
    return { text: null, state: 'unsupported', error: `No reader for ${mimeType}.` };
  } catch (error) {
    console.error(`Could not read ${fileName}`, error);
    return { text: null, state: 'failed', error: error.message };
  }
}
