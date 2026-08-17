/**
 * Video links pasted into the body of a post.
 *
 * There is no separate field to fill in. Somebody writing a post pastes a Loom
 * or YouTube link into what they are already typing, and the player appears
 * underneath when it is posted — which is what every tool people use already
 * does, and one fewer box to explain.
 *
 * The link is taken out of the text once it becomes a player, because leaving
 * both means the same URL twice: once as a wall of characters and once as the
 * thing it actually is. Text either side of it is untouched.
 */

/* Deliberately narrow. Anything that is not recognisably one of these two stays
   as plain text rather than being handed to an iframe. */
const PATTERNS = [
  { kind: 'loom', re: /https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([a-zA-Z0-9]{8,})(?:\?[^\s]*)?/gi },
  { kind: 'youtube', re: /https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^\s]*&)?v=([a-zA-Z0-9_-]{6,})(?:[^\s]*)?/gi },
  { kind: 'youtube', re: /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{6,})(?:\?[^\s]*)?/gi },
  { kind: 'youtube', re: /https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})(?:\?[^\s]*)?/gi },
  { kind: 'youtube', re: /https?:\/\/(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{6,})(?:\?[^\s]*)?/gi },
];

/** The address an iframe may be pointed at, or null if this is not a video. */
export function embedUrl(kind, id) {
  if (kind === 'loom') return `https://www.loom.com/embed/${id}`;
  // nocookie, because a class board should not be setting advertising cookies on
  // students who only came to watch a two-minute explanation.
  if (kind === 'youtube') return `https://www.youtube-nocookie.com/embed/${id}`;
  return null;
}

/**
 * Pulls every video link out of a body.
 *
 * Returns the text with those links removed and the attachments they became.
 * Capped, because a post is not a playlist.
 */
export function extractVideoLinks(body, { limit = 3 } = {}) {
  let text = String(body || '');
  const found = [];
  const seen = new Set();

  for (const { kind, re } of PATTERNS) {
    // Fresh each pass: a global regex carries lastIndex between calls.
    const pattern = new RegExp(re.source, re.flags);
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const id = match[1];
      const key = `${kind}:${id}`;
      if (seen.has(key) || found.length >= limit) continue;
      seen.add(key);
      found.push({ kind, id, url: match[0], embed: embedUrl(kind, id) });
    }
    for (const item of found) {
      if (item.kind !== kind) continue;
      text = text.split(item.url).join('');
    }
  }

  return {
    // Blank lines left where a link was lifted out collapse back down.
    body: text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
    attachments: found.map((item) => ({ kind: item.kind, url: item.url })),
  };
}
