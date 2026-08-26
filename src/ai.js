import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicConfig, getSetting } from './settings.js';
import { CHECKIN_SYSTEM, COMMUNITY_SYSTEM, HOMEWORK_VOICE, inEamonsVoice } from './draftprompts.js';

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
  const instructions = [
    prompts.correctionPrompt || '',
    prompts.generalFeedbackPrompt || '',
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
