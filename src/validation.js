/**
 * Why a form would not save, in words that name the field.
 *
 * Every route validates its body with zod and, until now, answered any failure
 * with one fixed sentence written for the likeliest case: "give the course a
 * title", "enter both models and both cleanup prompts". Zod knows which field
 * failed and why, and that was being thrown away. So a course description one
 * character over its limit was told to give the course a title, and a personal
 * dictionary one line too long was told to enter both models. A teacher who
 * has filled in what the sentence names is then told to fill it in.
 *
 * This turns the first issue into a sentence about the actual field. The fixed
 * sentence stays as the fallback for anything it cannot phrase, so nothing
 * gets worse than it was.
 */

/* A field may be named with a phrase, or with an object carrying phrases for
   particular failures: `eircode: { name: 'your Eircode', tooSmall: '...' }`. */
function nameFor(names, key) {
  const entry = names[key];
  if (!entry) return null;
  return typeof entry === 'string' ? { name: entry } : entry;
}

function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* questions[2].prompt reads as "Question 3". The head of the path names the
   list, the number is one-based because that is how a form numbers things. */
function listItem(names, head, index) {
  const entry = nameFor(names, head);
  const singular = entry?.item || (entry?.name || String(head)).replace(/^the /, '').replace(/s$/, '');
  return `${capital(singular)} ${index + 1}`;
}

export function problemFrom(error, names = {}, fallback = 'Something on this form could not be saved.') {
  const issue = error?.issues?.[0];
  if (!issue) return fallback;

  const [head, index, field] = issue.path;
  const inList = typeof index === 'number';
  const key = inList ? field : head;
  const entry = nameFor(names, key) || (inList ? null : nameFor(names, head));
  /* A list of plain values, a dictionary of words say, has no field under the
     item, so the item itself is the subject: "Dictionary line 2 is too long"
     rather than "Dictionary line 2: this is too long". */
  const bare = inList && field === undefined;
  const prefix = inList && !bare ? `${listItem(names, head, index)}: ` : '';
  const who = bare ? listItem(names, head, index)
    : entry?.name || (key ? String(key).replace(/([A-Z])/g, ' $1').toLowerCase() : 'this');
  const Who = inList && !bare ? who : capital(who);
  // "The notes are too long", not "is".
  const is = /s$/.test(who) && !/(address|status)$/.test(who) ? 'are' : 'is';

  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined' || issue.received === 'null') {
        return entry?.missing || `${prefix}${inList ? who : `Fill in ${who}`}${inList ? ' is missing' : ''}.`;
      }
      if (issue.expected === 'number') return `${prefix}${Who} has to be a number.`;
      if (issue.expected === 'boolean') return `${prefix}${Who} has to be yes or no.`;
      return `${prefix}${Who} ${is} not the right kind of value.`;
    case 'too_small':
      if (entry?.tooSmall) return entry.tooSmall;
      if (issue.type === 'array') return `${prefix}${Who} need${is === 'are' ? '' : 's'} at least ${issue.minimum} item${issue.minimum === 1 ? '' : 's'}.`;
      if (issue.type === 'number') return `${prefix}${Who} cannot be less than ${issue.minimum}.`;
      if (issue.minimum === 1) return `${prefix}Fill in ${who}.`;
      return `${prefix}${Who} needs at least ${issue.minimum} characters.`;
    case 'too_big':
      if (entry?.tooBig) return entry.tooBig;
      if (issue.type === 'array') return `${prefix}${Who} can have at most ${issue.maximum} item${issue.maximum === 1 ? '' : 's'}.`;
      if (issue.type === 'number') return `${prefix}${Who} cannot be more than ${issue.maximum}.`;
      return `${prefix}${Who} ${is} too long: at most ${issue.maximum} characters.`;
    case 'invalid_string':
      if (entry?.invalid) return entry.invalid;
      if (issue.validation === 'url') return `${prefix}${Who} ${is === 'are' ? 'have' : 'has'} to be a full web address starting with https://`;
      if (issue.validation === 'email') return `${prefix}${Who} is not a valid email address.`;
      if (issue.validation === 'datetime') return `${prefix}${Who} is not a valid date and time.`;
      if (issue.validation === 'uuid') return `${prefix}${Who} does not refer to anything the portal knows.`;
      return `${prefix}${Who} ${is} not in the right form.`;
    case 'invalid_enum_value':
      return entry?.invalid || `${prefix}${Who} has to be one of: ${(issue.options || []).join(', ')}.`;
    default:
      return entry?.invalid || fallback;
  }
}

/* Human names for the fields that appear across the portal's forms. A key
   missing here still gets a readable sentence from its camelCase name. */
export const FIELD_NAMES = Object.freeze({
  title: 'the title', name: 'the name', email: 'the email address', phone: 'the phone number',
  description: 'the description', instructions: 'the instructions', body: 'the message',
  subject: 'the subject', notes: 'the notes', reason: 'the reason', label: 'the label',
  deadlineAt: 'the deadline', visibleAt: 'the date it becomes visible', dueAt: 'the deadline',
  releaseAt: 'the opening date', publishedAt: 'the publish date', reopenedUntil: 'the reopened date',
  startsOn: 'the first day', endsOn: 'the last day', startDate: 'the start date', endDate: 'the end date',
  startTime: 'the start time', dayOfWeek: 'the day of the week', timezone: 'the timezone',
  programmeName: 'the programme name', joinUrl: 'the class link', joinNote: 'the class link note',
  loomUrl: 'the Loom address', video: 'the recording link', videoProvider: 'the recording host',
  videoPasscode: 'the passcode', durationSeconds: 'the duration', durationMinutes: 'the duration',
  classId: 'the class', weekId: 'the teaching week', courseId: 'the course', categoryId: 'the category',
  studentId: 'the student', assignmentId: 'the assignment',
  questions: { name: 'the questions', item: 'question' }, prompt: 'the question text',
  expectedAnswer: 'the expected answer', marks: 'the marks',
  answers: { name: 'the answers', item: 'answer' }, answer: 'the answer',
  resources: { name: 'the attached files', item: 'attached file' }, attachments: { name: 'the attachments', item: 'attachment' },
  marksList: { name: 'the marks', item: 'mark' }, awarded: 'the marks awarded', available: 'the marks available',
  corrections: 'the Irish corrections', generalFeedback: 'the general feedback', feedback: 'the reply',
  correctionPrompt: 'the corrections prompt', generalFeedbackPrompt: 'the general feedback prompt',
  checkinNotes: 'the check-in notes', communityNotes: 'the community notes',
  transcribeModel: 'the transcription model', cleanupModel: 'the cleanup model',
  cleanupPrompt: 'the cleanup prompt', correctionsCleanupPrompt: 'the corrections cleanup prompt',
  dictionary: { name: 'the personal dictionary', item: 'dictionary line' },
  model: 'the model', apiKey: 'the API key', hours: 'the number of hours',
  line1: 'the first line of your address', line2: 'the second line of your address', county: 'your county',
  eircode: {
    name: 'your Eircode',
    tooSmall: 'That does not look like an Eircode. They are seven characters, like A65 F4E2. You can look yours up at finder.eircode.ie.',
    tooBig: 'That does not look like an Eircode. They are seven characters, like A65 F4E2.',
  },
  maxFiles: 'the number of files', acceptedFileTypes: 'the accepted file types',
  weekIds: { name: 'the weeks', item: 'week' }, itemIds: { name: 'the order', item: 'item' },
  text: 'the text', kind: 'the kind', status: 'the status', examGroup: 'the exam section',
  webinarId: 'the webinar id', moduleId: 'the section', reaction: 'the reaction',
  currentQuestion: 'the current question', step: 'the step',
});
