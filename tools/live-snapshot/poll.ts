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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildLivePayload, type Fetcher } from '../../packages/parser/src/live.js';

const run = promisify(execFile);

const UA = 'BajaSaeStandings/0.1 (+https://github.com/ccrocker13/BajaSaeStandings) live-snapshot';
const OUT = process.env.OUT_FILE ?? 'live.json';
const INTERVAL_MS = Number(process.env.INTERVAL_SECONDS ?? 30) * 1000;
const DURATION_MS = Number(process.env.DURATION_MINUTES ?? 20) * 60 * 1000;

/**
 * Where to publish from. When set, each update is pushed as it happens rather
 * than once the run ends — the earlier version committed only after the whole
 * duration elapsed, so a five-hour job published a single snapshot five hours
 * late, which is not a live feed at all.
 */
const PUBLISH_DIR = process.env.PUBLISH_DIR ?? '';
/**
 * Floor on how often we push. raw.githubusercontent caches for minutes, so
 * pushing faster than this buys no freshness for readers and only adds commits.
 */
const PUBLISH_MIN_MS = Number(process.env.PUBLISH_MIN_SECONDS ?? 45) * 1000;

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

/**
 * Push the current snapshot to the feed branch.
 *
 * Amends rather than stacking commits: the branch is force-pushed and only its
 * tip is ever read, so hundreds of snapshot commits would be pure weight.
 * Never throws — a failed push must not end a race-weekend poll, it just means
 * readers keep the previous snapshot until the next one lands.
 */
let published = 0;
let hasCommit = false;
async function publish(): Promise<void> {
  if (!PUBLISH_DIR) return;
  const git = (...args: string[]) => run('git', ['-C', PUBLISH_DIR, ...args]);
  try {
    await git('add', '--', 'live.json');
    const message = `Live snapshot ${new Date().toISOString()}`;
    await git(...(hasCommit ? ['commit', '--amend', '-m', message] : ['commit', '-m', message]));
    hasCommit = true;
    await git('push', '--force', '--quiet', 'origin', 'live-feed');
    published += 1;
    console.log(`[${new Date().toISOString()}] published snapshot ${published}`);
  } catch (err) {
    // stderr can carry the remote URL, which embeds the token; log only the
    // fact of the failure.
    console.log(`[${new Date().toISOString()}] publish failed (will retry on next update)`);
    void err;
  }
}

async function main() {
  const until = Date.now() + DURATION_MS;
  let writes = 0;
  let previous = '';
  let lastPublish = 0;
  let pending = false;

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
          pending = true;
          writes += 1;
          console.log(`[${new Date().toISOString()}] wrote update ${writes} (${payload.overall.length} teams)`);
        }
      } else {
        console.log(`[${new Date().toISOString()}] upstream unavailable`);
      }
    } catch (err) {
      console.log(`[${new Date().toISOString()}] error: ${(err as Error).message}`);
    }

    // Publish as we go. Waiting until the run ends would mean a five-hour job
    // serves nothing for five hours.
    if (pending && Date.now() - lastPublish >= PUBLISH_MIN_MS) {
      await publish();
      lastPublish = Date.now();
      pending = false;
    }

    await sleep(Math.max(0, INTERVAL_MS - (Date.now() - started)));
  }

  // Anything written but not yet pushed, so the last state of the race lands.
  if (pending) await publish();
  console.log(`done: ${writes} update(s) written, ${published} published`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
