/**
 * Cloudflare Worker: serves the Baja SAE live results as JSON with CORS.
 *
 * Exists because results.bajasae.net sends no CORS headers and publishes no
 * API, so a static site cannot read it from the browser. The Worker doubles as
 * a shared cache: every visitor is served from one upstream fetch, so traffic
 * to SAE's server is independent of how many people are watching.
 *
 * The payload itself is assembled by @baja/parser, shared with the GitHub
 * Actions fallback poller so the two feeds cannot disagree.
 */
import { buildLivePayload, type Fetcher } from '@baja/parser';

const UA = 'BajaSaeStandings/0.1 (+https://github.com/ccrocker13/BajaSaeStandings) live-leaderboard';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * `cf.cacheTtl` lets Cloudflare serve every visitor from one origin fetch,
 * which is what keeps upstream load flat as the audience grows.
 */
const edgeFetch: Fetcher = async (url, ttl) => {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      cf: { cacheTtl: ttl, cacheEverything: true },
    } as RequestInit);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
};

function json(body: unknown, status = 200, maxAge = 10): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // stale-while-revalidate keeps the last good payload on screen if
      // upstream stalls mid-race rather than surfacing an error.
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=60`,
      ...cors,
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const { pathname } = new URL(request.url);

    if (pathname === '/health') return json({ ok: true });
    if (pathname === '/live') {
      const payload = await buildLivePayload(edgeFetch);
      return payload ? json(payload) : json({ error: 'upstream unavailable' }, 503, 10);
    }
    return json({ error: 'not found', routes: ['/live', '/health'] }, 404, 0);
  },
};
