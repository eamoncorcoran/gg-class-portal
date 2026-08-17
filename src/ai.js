import OpenAI from 'openai';
import { getOpenAIConfig, getSetting } from './settings.js';

async function clientAndConfig() {
  const openai = await getOpenAIConfig();
  /* 409 rather than 500, so the real reason reaches the screen: a 500 is reported
     as "Something went wrong", which sends you looking for a broken button when
     the only thing missing is the key on the OpenAI page. */
  if (!openai.apiKey) {
    throw Object.assign(new Error('Add your OpenAI key under OpenAI and prompts before drafting feedback.'), { status: 409 });
  }
  return { client: new OpenAI({ apiKey: openai.apiKey }), model: openai.model };
}

export async function draftCheckinFeedback(payload) {
  const { client, model } = await clientAndConfig();
  const prompts = await getSetting('prompts', {});
  const response = await client.responses.create({
    model,
    input: [
      { role: 'system', content: prompts.checkinPrompt || 'Write a short, warm Irish teacher response based only on the submitted check-in.' },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'checkin_feedback',
        strict: true,
        schema: {
          type: 'object',
          properties: { reply: { type: 'string' } },
          required: ['reply'],
          additionalProperties: false,
        },
      },
    },
  });
  return JSON.parse(response.output_text).reply;
}

export async function draftHomeworkFeedback(payload) {
  const answers = payload.questions?.map((item) => item.answer).filter((value) => String(value || '').trim()) || [];
  if (!answers.length) throw new Error('Homework has no submitted answers.');
  const { client, model } = await clientAndConfig();
  const prompts = await getSetting('prompts', {});
  const instructions = `${prompts.correctionPrompt || ''}\n\n${prompts.generalFeedbackPrompt || ''}`;
  const response = await client.responses.create({
    model,
    input: [
      { role: 'system', content: instructions },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'homework_feedback',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            corrections: { type: 'string' },
            generalFeedback: { type: 'string' },
          },
          required: ['corrections', 'generalFeedback'],
          additionalProperties: false,
        },
      },
    },
  });
  const parsed = JSON.parse(response.output_text);
  return {
    corrections: parsed.corrections?.trim() || 'No Irish corrections needed.',
    generalFeedback: parsed.generalFeedback?.trim() || '',
  };
}

/**
 * A drafted reply to a post on the class board.
 *
 * Given the post, who wrote it and what has already been said underneath, so the
 * draft does not repeat a point somebody has already made. Written for the
 * teacher to edit — it is a starting point, not a reply, and nothing sends it
 * without them.
 */
export async function draftCommunityReply(payload) {
  const { client, model } = await clientAndConfig();
  const prompts = await getSetting('prompts', {});
  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'system',
        content: prompts.communityReplyPrompt
          || 'You are a warm, experienced Irish-language teacher replying to a post on your class board. Answer the question actually asked in 2 to 4 short sentences. Never mention being an assistant or a model.',
      },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'community_reply',
        strict: true,
        schema: {
          type: 'object',
          properties: { reply: { type: 'string' } },
          required: ['reply'],
          additionalProperties: false,
        },
      },
    },
  });
  return JSON.parse(response.output_text).reply;
}
