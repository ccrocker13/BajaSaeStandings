/**
 * Fallback live feed, for when the Cloudflare Worker is not deployed or is down.
 *
 * Runs as a long-lived GitHub Actions job during a competition: it polls the
 * results site, writes the same payload the Worker serves, and commits it to a
 * dedicated orphan branch the site can read over raw.githubusercontent.
 *
 * This is insurance, not the primary path. raw.githubusercontent caches for a
 * few minutes, so the Worker is meaningfully fresher; the point is that race
 * weekend does not depend on a single component.
 */
import { writeFile } from 'node:fs/promises';
import { buildLivePayload, type Fetcher } from '../../packages/parser/src/live.js';

const UA = 'BajaSaeStandings/0.1 (+https://github.com/ccrocker13/BajaSaeStandings) live-snapshot';
const OUT = process.env.OUT_FILE ?? 'live.json';
const INTERVAL_MS = Number(process.env.INTERVAL_SECONDS ?? 30) * 1000;
const DURATION_MS = Number(process.env.DURATION_MINUTES ?? 20) * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Plain sequential fetch. Unlike the Worker there is no edge cache here, so the
 * TTL hint is used as a minimum spacing between requests instead — same intent,
 * different mechanism: do not hit a page more often than it changes.
 */
const lastFetched = new Map<string, { at: number; body: string | null }>();
const politeFetch: Fetcher = async (url, ttl) => {
  const prev = lastFetched.get(url);
  if (prev && Date.now() - prev.at < ttl * 1000) return prev.body;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    const body = res.ok ? await res.text() : null;
    lastFetched.set(url, { at: Date.now(), body: body ?? prev?.body ?? null });
    return body ?? prev?.body ?? null;
  } catch {
    return prev?.body ?? null;
  }
};

async function main() {
  const until = Date.now() + DURATION_MS;
  let writes = 0;
  let previous = '';

  while (Date.now() < until) {
    const started = Date.now();
    try {
      const payload = await buildLivePayload(politeFetch);
      if (payload) {
        // Compare ignoring the timestamp, so an unchanged race does not produce
        // a commit every thirty seconds.
        const comparable = JSON.stringify({ ...payload, fetchedAt: '' });
        if (comparable !== previous) {
          await writeFile(OUT, JSON.stringify(payload));
          previous = comparable;
          writes += 1;
          console.log(`[${new Date().toISOString()}] wrote update ${writes} (${payload.overall.length} teams)`);
        }
      } else {
        console.log(`[${new Date().toISOString()}] upstream unavailable`);
      }
    } catch (err) {
      console.log(`[${new Date().toISOString()}] error: ${(err as Error).message}`);
    }
    await sleep(Math.max(0, INTERVAL_MS - (Date.now() - started)));
  }
  console.log(`done: ${writes} update(s) written`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
