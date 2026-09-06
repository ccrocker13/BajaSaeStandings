/**
 * Cloudflare Worker: turns the Baja SAE results pages into JSON with CORS.
 *
 * Exists because results.bajasae.net sends no CORS headers and publishes no
 * API, so a static site cannot read it from the browser. The Worker also acts
 * as a shared cache: every visitor is served from one upstream fetch, so
 * traffic to SAE's server is independent of how many people are watching.
 *
 * Upstream request budget
 * -----------------------
 * A full refresh touches nine pages. Refreshing all of them on the endurance
 * cadence would be roughly 36 requests a minute, which is more than this
 * project needs and more than is polite. Instead each page carries its own TTL
 * matched to how fast it actually changes:
 *
 *   endurance   20s   the live race; laps land continuously
 *   dynamic     60s   changes only as cars take runs
 *   static     300s   design/cost/business barely move once judged
 *   root       300s   competition title and event list
 *
 * That is about 8 requests a minute at peak and under 2 outside the endurance
 * race, regardless of audience size.
 */
import { parseLeaderboard, type LeaderboardPage } from '@baja/parser';
import { scoreDynamicEvent, scoreEndurance, DYNAMIC_MODELS } from '@baja/parser';

const ORIGIN = 'https://results.bajasae.net';
const UA = 'BajaSaeStandings/0.1 (+https://github.com/ccrocker13/BajaSaeStandings) live-leaderboard';

/** Static events publish real points; dynamic and endurance do not. */
const STATIC_CODES = new Set(['DESN', 'COST', 'PRES']);
const ENDURANCE_CODE = 'ENDUR';

const TTL = { endurance: 20, dynamic: 60, static: 300, root: 300 } as const;

function ttlFor(code: string | null): number {
  if (code === null) return TTL.root;
  if (code === ENDURANCE_CODE) return TTL.endurance;
  if (STATIC_CODES.has(code)) return TTL.static;
  return TTL.dynamic;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Fetch with a shared edge cache.
 *
 * `cf.cacheTtl` lets Cloudflare serve every visitor from one origin fetch.
 * `stale-while-revalidate` means a slow or failing upstream keeps serving the
 * last good page rather than surfacing an error mid-race.
 */
async function cachedFetch(url: string, ttl: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      cf: { cacheTtl: ttl, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface LiveEvent {
  code: string;
  label: string;
  kind: LeaderboardPage['kind'];
  /** True when points are published upstream; false when this Worker computed them. */
  officialPoints: boolean;
  rows: LiveRow[];
}

interface LiveRow {
  position: number | null;
  carNumber: number | null;
  school: string;
  schoolId: string;
  teamName: string | null;
  status: string | null;
  /** Raw upstream figure: a time for dynamic events, laps for endurance. */
  raw: string | null;
  points: number | null;
  estimated: boolean;
}

function buildEventPayload(code: string, label: string, page: LeaderboardPage): LiveEvent {
  const kind = page.kind;

  if (kind === 'static') {
    return {
      code,
      label,
      kind,
      officialPoints: true,
      rows: page.rows.map((r) => ({
        position: r.position,
        carNumber: r.carNumber,
        school: r.school,
        schoolId: r.schoolId,
        teamName: r.teamName,
        status: r.status,
        raw: r.finalScore === null ? null : String(r.finalScore),
        points: r.finalScore,
        estimated: false,
      })),
    };
  }

  if (kind === 'endurance') {
    const leaderLaps = Math.max(0, ...page.rows.map((r) => r.laps ?? 0));
    return {
      code,
      label,
      kind,
      officialPoints: false,
      rows: page.rows.map((r) => ({
        position: r.position,
        carNumber: r.carNumber,
        school: r.school,
        schoolId: r.schoolId,
        teamName: r.teamName,
        status: r.status,
        raw: r.laps === null ? null : `${r.laps} laps`,
        points: r.laps === null ? null : scoreEndurance(r.laps, leaderLaps),
        estimated: true,
      })),
    };
  }

  // Dynamic: score the whole field together, since every entry's points depend
  // on the fastest and slowest times in that field.
  const times = page.rows.map((r) => r.resultValue).filter((t): t is number => t !== null && t > 0);
  const scores = DYNAMIC_MODELS[code] ? scoreDynamicEvent(code, times) : new Map<number, number>();
  return {
    code,
    label,
    kind,
    officialPoints: false,
    rows: page.rows.map((r) => ({
      position: r.position,
      carNumber: r.carNumber,
      school: r.school,
      schoolId: r.schoolId,
      teamName: r.teamName,
      status: r.status,
      raw: r.resultRaw,
      points: r.resultValue === null ? null : (scores.get(r.resultValue) ?? null),
      estimated: true,
    })),
  };
}

async function buildLive(): Promise<Response> {
  const rootHtml = await cachedFetch(`${ORIGIN}/`, TTL.root);
  if (!rootHtml) {
    return json({ error: 'upstream unavailable' }, 503, 10);
  }
  const root = parseLeaderboard(rootHtml, `${ORIGIN}/`);
  const events = root.data.events;

  const pages = await Promise.all(
    events.map(async (e) => {
      const url = `${ORIGIN}/Leaderboard.aspx?Event=${encodeURIComponent(e.code)}`;
      const html = await cachedFetch(url, ttlFor(e.code));
      return { event: e, page: html ? parseLeaderboard(html, url) : null };
    }),
  );

  const liveEvents: LiveEvent[] = [];
  const warnings: string[] = [...root.warnings];
  let endurance = null;

  for (const { event, page } of pages) {
    if (!page) {
      warnings.push(`${event.code}: upstream fetch failed`);
      continue;
    }
    warnings.push(...page.warnings.map((w) => `${event.code}: ${w}`));
    if (!page.data.kind) continue;
    liveEvents.push(buildEventPayload(event.code, event.label, page.data));
    if (page.data.endurance) endurance = page.data.endurance;
  }

  // Overall standings: sum whatever each team has scored so far. Everything but
  // the static events is computed, so the total is explicitly an estimate.
  const totals = new Map<string, { school: string; schoolId: string; teamName: string | null; carNumber: number | null; points: number; scored: number }>();
  for (const ev of liveEvents) {
    for (const row of ev.rows) {
      if (!row.schoolId || row.points === null) continue;
      const t = totals.get(row.schoolId) ?? {
        school: row.school, schoolId: row.schoolId, teamName: row.teamName,
        carNumber: row.carNumber, points: 0, scored: 0,
      };
      t.points += row.points;
      t.scored += 1;
      totals.set(row.schoolId, t);
    }
  }
  const overall = [...totals.values()]
    .sort((a, b) => b.points - a.points)
    .map((t, i) => ({ ...t, rank: i + 1 }));

  return json(
    {
      competition: root.data.competitionTitle,
      siteLocation: root.data.siteLocation,
      siteLastUpdate: root.data.siteLastUpdate,
      fetchedAt: new Date().toISOString(),
      endurance,
      events: liveEvents,
      overall,
      // Surfaced in the UI rather than swallowed: a leaderboard that quietly
      // drops rows is worse than one that says it did.
      warnings,
      disclaimer:
        'Overall totals and all dynamic and endurance points are computed by this project, not published by SAE. Official results supersede them.',
    },
    200,
    10,
  );
}

function json(body: unknown, status = 200, maxAge = 10): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=60`,
      ...cors,
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);

    if (url.pathname === '/live') return buildLive();
    if (url.pathname === '/health') return json({ ok: true });

    return json({ error: 'not found', routes: ['/live', '/health'] }, 404, 0);
  },
};
