/**
 * Assembles the live payload from the results site.
 *
 * Shared by the Cloudflare Worker and the GitHub Actions fallback poller so
 * the two cannot drift: whichever feed a visitor is served, the numbers were
 * produced by the same code. The fetcher is injected because the Worker wants
 * its edge cache and the Actions script wants a plain sequential fetch.
 */
import { parseLeaderboard, type LeaderboardPage } from './parse.js';
import { DYNAMIC_MODELS, scoreDynamicEvent, scoreEndurance } from './scoring.js';

export const RESULTS_ORIGIN = 'https://results.bajasae.net';

/** Static events publish real points; dynamic and endurance do not. */
export const STATIC_CODES = new Set(['DESN', 'COST', 'PRES']);
export const ENDURANCE_CODE = 'ENDUR';

/**
 * Per-page cache lifetimes, matched to how fast each page actually changes.
 * Refreshing everything on the endurance cadence would be about 36 upstream
 * requests a minute; this is roughly 8 at peak and under 2 otherwise.
 */
export const TTL = { endurance: 20, dynamic: 60, static: 300, root: 300 } as const;

export function ttlFor(code: string | null): number {
  if (code === null) return TTL.root;
  if (code === ENDURANCE_CODE) return TTL.endurance;
  if (STATIC_CODES.has(code)) return TTL.static;
  return TTL.dynamic;
}

export interface LiveRow {
  position: number | null;
  carNumber: number | null;
  school: string;
  schoolId: string;
  teamName: string | null;
  status: string | null;
  raw: string | null;
  points: number | null;
  estimated: boolean;
}

export interface LiveEvent {
  code: string;
  label: string;
  kind: LeaderboardPage['kind'];
  officialPoints: boolean;
  rows: LiveRow[];
}

export interface LiveOverall {
  school: string;
  schoolId: string;
  teamName: string | null;
  carNumber: number | null;
  points: number;
  scored: number;
  rank: number;
}

export interface LivePayload {
  competition: string | null;
  siteLocation: string | null;
  siteLastUpdate: string | null;
  fetchedAt: string;
  endurance: LeaderboardPage['endurance'];
  events: LiveEvent[];
  overall: LiveOverall[];
  warnings: string[];
  disclaimer: string;
}

export const DISCLAIMER =
  'Overall totals and all dynamic and endurance points are computed by this project, not published by SAE. Official results supersede them.';

/** Fetches a URL, honouring a caching hint; returns null on any failure. */
export type Fetcher = (url: string, ttlSeconds: number) => Promise<string | null>;

function buildEvent(code: string, label: string, page: LeaderboardPage): LiveEvent {
  const kind = page.kind;
  const common = (r: LeaderboardPage['rows'][number]) => ({
    position: r.position,
    carNumber: r.carNumber,
    school: r.school,
    schoolId: r.schoolId,
    teamName: r.teamName,
    status: r.status,
  });

  if (kind === 'static') {
    return {
      code, label, kind, officialPoints: true,
      rows: page.rows.map((r) => ({
        ...common(r),
        raw: r.finalScore === null ? null : String(r.finalScore),
        points: r.finalScore,
        estimated: false,
      })),
    };
  }

  if (kind === 'endurance') {
    const leaderLaps = Math.max(0, ...page.rows.map((r) => r.laps ?? 0));
    return {
      code, label, kind, officialPoints: false,
      rows: page.rows.map((r) => ({
        ...common(r),
        raw: r.laps === null ? null : `${r.laps} laps`,
        points: r.laps === null ? null : scoreEndurance(r.laps, leaderLaps),
        estimated: true,
      })),
    };
  }

  // Dynamic events score the whole field together: every entry's points depend
  // on the fastest and slowest times set, so rows cannot be scored in isolation.
  const times = page.rows.map((r) => r.resultValue).filter((t): t is number => t !== null && t > 0);
  const scores = DYNAMIC_MODELS[code] ? scoreDynamicEvent(code, times) : new Map<number, number>();
  return {
    code, label, kind, officialPoints: false,
    rows: page.rows.map((r) => ({
      ...common(r),
      raw: r.resultRaw,
      points: r.resultValue === null ? null : (scores.get(r.resultValue) ?? null),
      estimated: true,
    })),
  };
}

export async function buildLivePayload(fetcher: Fetcher): Promise<LivePayload | null> {
  const rootHtml = await fetcher(`${RESULTS_ORIGIN}/`, TTL.root);
  if (!rootHtml) return null;

  const root = parseLeaderboard(rootHtml, `${RESULTS_ORIGIN}/`);
  const warnings = [...root.warnings];
  const events: LiveEvent[] = [];
  let endurance: LeaderboardPage['endurance'] = null;

  for (const e of root.data.events) {
    const url = `${RESULTS_ORIGIN}/Leaderboard.aspx?Event=${encodeURIComponent(e.code)}`;
    const html = await fetcher(url, ttlFor(e.code));
    if (!html) {
      warnings.push(`${e.code}: upstream fetch failed`);
      continue;
    }
    const page = parseLeaderboard(html, url);
    warnings.push(...page.warnings.map((w) => `${e.code}: ${w}`));
    if (!page.data.kind) continue;
    events.push(buildEvent(e.code, e.label, page.data));
    if (page.data.endurance) endurance = page.data.endurance;
  }

  const totals = new Map<string, LiveOverall>();
  for (const ev of events) {
    for (const row of ev.rows) {
      if (!row.schoolId || row.points === null) continue;
      const t = totals.get(row.schoolId) ?? {
        school: row.school, schoolId: row.schoolId, teamName: row.teamName,
        carNumber: row.carNumber, points: 0, scored: 0, rank: 0,
      };
      t.points += row.points;
      t.scored += 1;
      totals.set(row.schoolId, t);
    }
  }
  const overall = [...totals.values()]
    .sort((a, b) => b.points - a.points)
    .map((t, i) => ({ ...t, rank: i + 1 }));

  return {
    competition: root.data.competitionTitle,
    siteLocation: root.data.siteLocation,
    siteLastUpdate: root.data.siteLastUpdate,
    fetchedAt: new Date().toISOString(),
    endurance,
    events,
    overall,
    warnings,
    disclaimer: DISCLAIMER,
  };
}
