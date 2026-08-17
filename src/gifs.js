import { config } from './config.js';

/**
 * GIF search, proxied.
 *
 * The browser cannot call Giphy directly: the content security policy pins
 * `connectSrc` to this origin, and loosening it to allow one third party would
 * loosen it for every script on the page. So the search goes through here and
 * only the resulting image URLs reach the browser, which `imgSrc` already allows
 * over https.
 *
 * Proxying also keeps the API key on the server, where a key belongs.
 */

const ENDPOINT = 'https://api.giphy.com/v1/gifs';
const TIMEOUT_MS = 6000;

export const gifsConfigured = () => Boolean(config.giphyApiKey);

/* Only the fields the picker draws. Giphy returns a great deal per result and
   none of the rest is worth sending on to the browser. */
function simplify(row) {
  const still = row?.images?.fixed_width_still?.url;
  const animated = row?.images?.fixed_width?.url || row?.images?.downsized?.url;
  const full = row?.images?.downsized_medium?.url || animated;
  if (!animated || !full) return null;
  return {
    id: row.id,
    title: String(row.title || 'GIF').slice(0, 120),
    preview: still || animated,
    url: full,
    width: Number(row?.images?.fixed_width?.width) || 200,
    height: Number(row?.images?.fixed_width?.height) || 200,
  };
}

async function call(pathname, params) {
  if (!gifsConfigured()) {
    throw Object.assign(new Error('GIF search is not configured.'), { status: 503 });
  }
  const url = new URL(`${ENDPOINT}${pathname}`);
  url.searchParams.set('api_key', config.giphyApiKey);
  url.searchParams.set('rating', config.giphyRating);
  url.searchParams.set('limit', '24');
  url.searchParams.set('bundle', 'messaging_non_clips');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw Object.assign(new Error('GIF search is unavailable right now.'), { status: 502 });
    }
    const payload = await response.json();
    return (payload.data || []).map(simplify).filter(Boolean);
  } catch (error) {
    if (error.status) throw error;
    // A search that times out should read as "nothing found", not as a crash.
    throw Object.assign(new Error('GIF search is unavailable right now.'), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

export const searchGifs = (query) => call('/search', { q: String(query).slice(0, 100) });
export const trendingGifs = () => call('/trending', {});
