/**
 * Where a lesson's video comes from.
 *
 * Deliberately not tied to one host. A Zoom cloud recording cannot be embedded —
 * Zoom serves its playback pages with framing blocked, and there is no embed
 * product for them — so the file has to be moved somewhere that will play it.
 * Which somewhere that is, is a decision about cost and about whether students
 * are on mobile data, not a decision the schema should have made in advance.
 *
 * A lesson therefore stores a provider and a reference, and this turns the pair
 * into something the browser can play.
 */

export const VIDEO_PROVIDERS = Object.freeze(['bunny', 'youtube', 'loom', 'mp4']);

export const PROVIDER_LABELS = Object.freeze({
  bunny: 'Bunny Stream',
  youtube: 'YouTube',
  loom: 'Loom',
  mp4: 'Uploaded file',
});

/* Bunny embeds are library id + video id. Everything else is a single id or a
   path we serve ourselves. */
const BUNNY_REF = /^(\d+)\/([a-f0-9-]{8,})$/i;

/**
 * Accepts what somebody pasted and returns the pair to store, or null.
 *
 * People paste whole URLs rather than ids, so every provider takes either.
 */
export function parseVideoSource(provider, input) {
  const value = String(input || '').trim();
  if (!value || !VIDEO_PROVIDERS.includes(provider)) return null;

  if (provider === 'youtube') {
    const id = value.match(/(?:youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/)?.[1]
      || (/^[a-zA-Z0-9_-]{6,}$/.test(value) ? value : null);
    return id ? { provider, ref: id } : null;
  }

  if (provider === 'loom') {
    const id = value.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]{8,})/)?.[1]
      || (/^[a-zA-Z0-9]{8,}$/.test(value) ? value : null);
    return id ? { provider, ref: id } : null;
  }

  if (provider === 'bunny') {
    // https://iframe.mediadelivery.net/embed/<library>/<video>
    const fromUrl = value.match(/mediadelivery\.net\/(?:embed|play)\/(\d+)\/([a-f0-9-]{8,})/i);
    if (fromUrl) return { provider, ref: `${fromUrl[1]}/${fromUrl[2]}` };
    return BUNNY_REF.test(value) ? { provider, ref: value } : null;
  }

  // An MP4 we serve ourselves, or one already sitting on a URL.
  if (value.startsWith('/uploads/') || /^https?:\/\//i.test(value)) return { provider, ref: value };
  return null;
}

/**
 * What the lesson page should render.
 *
 * `iframe` for hosts that supply their own player, `file` for one we play in a
 * plain <video>. Returns null when a lesson has no recording yet, which is a
 * normal state for a lesson that is written before it is taught.
 */
export function videoSource(lesson, { signBunny = null } = {}) {
  const provider = lesson?.video_provider;
  const ref = lesson?.video_ref;
  if (!provider || !ref) return null;

  if (provider === 'youtube') {
    // nocookie, so a course page is not setting advertising cookies on students.
    return { type: 'iframe', provider, src: `https://www.youtube-nocookie.com/embed/${ref}` };
  }
  if (provider === 'loom') {
    return { type: 'iframe', provider, src: `https://www.loom.com/embed/${ref}` };
  }
  if (provider === 'bunny') {
    const [library, video] = ref.split('/');
    /* Bunny's own player: adaptive streaming, which is the reason to use it at
       all when students watch on mobile data.

       When a signer is supplied the URL carries a signature and an expiry, so a
       link forwarded outside the class is refused rather than merely obscure.
       Signed per request, which is why this takes a function rather than
       building the token itself. */
    if (signBunny) return { type: 'iframe', provider, src: signBunny(video, library) };
    return {
      type: 'iframe',
      provider,
      src: `https://iframe.mediadelivery.net/embed/${library}/${video}?autoplay=false&preload=false`,
    };
  }
  return { type: 'file', provider, src: ref };
}

/** "1h 24m", or "9m", for a lesson list. */
export function fmtDuration(seconds) {
  const total = Number(seconds) || 0;
  if (!total) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
