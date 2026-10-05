import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicConfig, getSetting } from './settings.js';
import { CHECKIN_SYSTEM, COMMUNITY_SYSTEM, CORRECTION_FORMAT, HOMEWORK_VOICE, inEamonsVoice } from './draftprompts.js';

/* Drafting runs on Claude; dictation and transcription stay on OpenAI, because
   there is no Anthropic equivalent of Whisper and the keyboard pipeline in
   voice.js is already matched to it. Two keys, two jobs, both on the settings
   screen. */
async function clientAndConfig() {
  const anthropic = await getAnthropicConfig();
  /* 409 rather than 500, so the real reason reaches the screen: a 500 is reported
     as "Something went wrong", which sends you looking for a broken button when
     the only thing missing is the key on the Feedback drafting page. */
  if (!anthropic.apiKey) {
    throw Object.assign(new Error('Add your Claude key under Feedback drafting before drafting feedback.'), { status: 409 });
  }
  return { client: new Anthropic({ apiKey: anthropic.apiKey }), model: anthropic.model };
}

/* Instructions an administrator has added for this term or class. They are
   appended to the voice rather than replacing it, and they are appended last so
   a note like "we are three weeks from the oral" outranks the general advice
   without being able to undo the register. */
function withNotes(system, notes) {
  const extra = String(notes || '').trim();
  return extra ? `${system}\n\nNOTES FROM ÉAMON FOR THIS CLASS, these take priority over the general guidance above:\n${extra}` : system;
}

const REPLY_SCHEMA = {
  type: 'object',
  properties: { reply: { type: 'string' } },
  required: ['reply'],
  additionalProperties: false,
};

/**
 * One drafting request.
 *
 * Adaptive thinking is on and effort is left at medium: these are short replies
 * where the work is matching a register rather than reasoning, and the drafts
 * are written on every submission, so the difference shows up on the bill.
 * `max_tokens` is well above what any reply needs because thinking tokens count
 * against it, and a draft cut off mid-sentence costs a retry.
 */
async function draft({ system, payload, effort = 'medium', schema = REPLY_SCHEMA }) {
  const { client, model } = await clientAndConfig();
  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  });
  /* A safety decline arrives as a normal 200 with nothing usable in it, so it
     has to be checked before the content is read. Nothing a student writes in a
     check-in should trigger one, which is exactly why it should surface as a
     failed draft rather than as a confusing empty reply. */
  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to draft this one. Write the reply yourself.');
  }
  const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
  return JSON.parse(text);
}

export async function draftCheckinFeedback(payload) {
  const prompts = await getSetting('prompts', {});
  const { reply } = await draft({
    system: withNotes(CHECKIN_SYSTEM, prompts.checkinNotes),
    payload,
  });
  return inEamonsVoice(reply);
}

export async function draftHomeworkFeedback(payload) {
  const answers = payload.questions?.map((item) => item.answer).filter((value) => String(value || '').trim()) || [];
  if (!answers.length) throw new Error('Homework has no submitted answers.');
  const prompts = await getSetting('prompts', {});
  /* Corrections are a marking standard rather than a voice, so that prompt is
     still the one on the settings screen. Effort stays at the default because
     getting a séimhiú wrong in front of a student is worse than the cost of
     thinking about it properly. */
  /* The stored prompts first, then the format and the voice from code. Last word
     wins with a model the same way it does with a person, and the layout of a
     correction is not a marking standard to be tuned on a settings screen: it is
     the shape the student's screen renders. */
  const instructions = [
    prompts.correctionPrompt || '',
    prompts.generalFeedbackPrompt || '',
    CORRECTION_FORMAT,
    HOMEWORK_VOICE,
  ].filter(Boolean).join('\n\n');
  const parsed = await draft({
    system: instructions,
    payload,
    effort: 'high',
    schema: {
      type: 'object',
      properties: {
        corrections: { type: 'string' },
        generalFeedback: { type: 'string' },
      },
      required: ['corrections', 'generalFeedback'],
      additionalProperties: false,
    },
  });
  return {
    /* Corrections are quoted Irish, so they are left exactly as returned. Only
       the feedback underneath is passed through the voice scrub, or an em dash
       inside a corrected sentence would be rewritten into a comma. */
    corrections: parsed.corrections?.trim() || 'No Irish corrections needed.',
    generalFeedback: inEamonsVoice(parsed.generalFeedback || ''),
  };
}

/**
 * A drafted reply to a post on the class board.
 *
 * Given the post, who wrote it and what has already been said underneath, so the
 * draft does not repeat a point somebody has already made. Written for the
 * teacher to edit: it is a starting point, not a reply, and nothing sends it
 * without them.
 */
export async function draftCommunityReply(payload) {
  const prompts = await getSetting('prompts', {});
  const { reply } = await draft({
    system: withNotes(COMMUNITY_SYSTEM, prompts.communityNotes),
    payload,
  });
  return inEamonsVoice(reply);
}

/* Marking a listening comprehension.
   ------------------------------------------------------------------
   Different work from drafting feedback, and kept apart from it. Feedback is a
   register; this is a judgement against the story, and it produces a number.
   The teacher may type a model answer beside a question and need not: the
   marker reads the answer out of the story itself, and says in its note what
   it took the answer to be, so the teacher can check it at a glance. The number never reaches the student on its own: it lands
   in the held-back columns beside the AI's prose and waits for the teacher, the
   same as everything else.

   Effort is high. A comprehension answer in Irish can be right in a way the
   expected answer did not anticipate — a synonym, a different tense that is
   still correct, the right fact in the wrong order — and marking that wrong is
   worse than marking it slowly. */
const MARKING_SYSTEM = `You are marking a listening comprehension for a Leaving Certificate Irish class.

The student listened to a story in Irish and answered questions about it. You are given the story, and for each question: the question, the marks available, what the student wrote, and sometimes a model answer the teacher typed.

The story is the answer key. Work out the correct answer to each question from the story yourself. Where the teacher gave a model answer, treat it as one way of putting the same thing, not the only way. Where they gave none, the story alone decides.

How to mark:
- Mark the content, not the spelling. A right answer spelled badly is a right answer.
- Accept a synonym, a paraphrase, or the same fact in different words.
- Accept an answer in English if the question did not require Irish, unless the question or the teacher's model answer shows the point was to answer in Irish.
- Partial marks where a question carries more than one mark and the student got part of it.
- An empty answer gets zero.
- Do not invent a reason to take marks off. If it is right, it is right.
- If the story does not answer the question at all, say so in the note and give the marks to any reasonable answer.

Write the note on each question to the teacher, not to the student: a working note that lets them check your marking quickly. Start with the answer the story gives, in a few words, then how the student's answer compares. One or two short sentences. Never use an em dash or an en dash.`;

const MARKING_SCHEMA = {
  type: 'object',
  properties: {
    marks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          position: { type: 'integer' },
          awarded: { type: 'integer' },
          available: { type: 'integer' },
          note: { type: 'string' },
        },
        required: ['position', 'awarded', 'available', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['marks'],
  additionalProperties: false,
};

/* A beginner's respelling of an Irish phrase, for the Phonetics tile on the
   practice card. Written on Claude, which the portal already has a key for;
   the OpenAI route is the fallback when it does not. */
const PHONETICS_SYSTEM = `You write easy English respellings of Irish phrases for absolute beginners, the way "slán" is written "slawn".
Rules: no IPA, lowercase syllables joined with hyphens inside a word, one respelled word for each Irish word, in the same order, separated by single spaces. Standard Irish pronunciation unless the spelling is clearly a dialect form. Reply with the respelling only. Never use an em dash or an en dash.`;
export async function phoneticsFor(text) {
  const { phonetic } = await draft({
    system: PHONETICS_SYSTEM,
    payload: { phrase: String(text).slice(0, 200) },
    effort: 'low',
    schema: { type: 'object', properties: { phonetic: { type: 'string' } }, required: ['phonetic'], additionalProperties: false },
  });
  return String(phonetic || '').trim().replace(/^["“]|["”]$/g, '');
}

export async function markListening(payload) {
  const { marks } = await draft({
    system: MARKING_SYSTEM,
    payload,
    effort: 'high',
    schema: MARKING_SCHEMA,
  });
  /* Clamped here rather than trusted. A model that awards four out of two makes
     a percentage that is wrong in the teacher's favour and nobody notices. */
  return marks.map((mark) => ({
    ...mark,
    note: inEamonsVoice(mark.note),
    awarded: Math.max(0, Math.min(Number(mark.awarded) || 0, Number(mark.available) || 0)),
  }));
}
