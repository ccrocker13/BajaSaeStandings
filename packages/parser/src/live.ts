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

/**
 * What a row's result means for the standings.
 *
 * `scored`  — a real result, worth the points shown.
 * `zero`    — the entry ran and came away with nothing (DNF, DQ, black flag).
 *             It counts as an attempt worth 0, not as an absence: a team that
 *             failed Suspension & Traction has settled that event, and hiding
 *             that makes its total look like a team that simply has not run.
 * `pending` — no result yet. Genuinely unknown, so it stays out of the total.
 */
export type ResultState = 'scored' | 'zero' | 'pending';

/**
 * Statuses that mean the attempt is over and scoreless.
 *
 * Deliberately a closed list: an unrecognised status is treated as pending,
 * because inventing a zero for a team is worse than admitting we do not know.
 * "N/A" is not here — it reads as "nothing to show", not as a verdict.
 */
const ZERO_STATUS =
  /\b(?:dnf|dns|dq|dsq|disqualified|did\s*not\s*(?:finish|start|attempt|run)|no\s*time|black\s*flag(?:ged)?|retired|withdrew|withdrawn|failed)\b/i;

/**
 * Decide a row's state from its result and its status cell.
 *
 * `value` is whatever the event measures — points, a time, laps — and is null
 * when the cell was blank or non-numeric.
 */
export function classifyResult(value: number | null, status: string | null): ResultState {
  if (value !== null) return 'scored';
  return status && ZERO_STATUS.test(status) ? 'zero' : 'pending';
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
  state: ResultState;
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
  /** Events with a settled result, scoring or not — i.e. events completed. */
  scored: number;
  /** Settled events the entry came away from with nothing. */
  zeroed: number;
  /** Events still to run, or run but not yet posted. */
  pending: number;
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
      rows: page.rows.map((r) => {
        const state = classifyResult(r.finalScore, r.status);
        return {
          ...common(r),
          raw: r.finalScore === null ? null : String(r.finalScore),
          points: state === 'pending' ? null : (r.finalScore ?? 0),
          estimated: false,
          state,
        };
      }),
    };
  }

  if (kind === 'endurance') {
    const leaderLaps = Math.max(0, ...page.rows.map((r) => r.laps ?? 0));
    return {
      code, label, kind, officialPoints: false,
      rows: page.rows.map((r) => {
        // Zero laps is the pre-race value for the whole field, so it reads as
        // "not started" rather than as a settled zero. An entry that really
        // completes no laps scores nothing anyway; calling that pending while
        // the race runs is the conservative error.
        const laps = r.laps !== null && r.laps > 0 ? r.laps : null;
        const state = classifyResult(laps, r.status);
        return {
          ...common(r),
          raw: laps === null ? null : `${laps} laps`,
          points: state === 'pending' ? null : laps === null ? 0 : scoreEndurance(laps, leaderLaps),
          estimated: true,
          state,
        };
      }),
    };
  }

  // Dynamic events score the whole field together: every entry's points depend
  // on the fastest and slowest times set, so rows cannot be scored in isolation.
  const times = page.rows.map((r) => r.resultValue).filter((t): t is number => t !== null && t > 0);
  const scores = DYNAMIC_MODELS[code] ? scoreDynamicEvent(code, times) : new Map<number, number>();
  return {
    code, label, kind, officialPoints: false,
    rows: page.rows.map((r) => {
      const state = classifyResult(r.resultValue, r.status);
      return {
        ...common(r),
        // A pending row's cell still holds the site's "0.000" placeholder;
        // showing it would read as a result.
        raw: state === 'pending' ? null : r.resultRaw,
        points:
          state === 'pending'
            ? null
            : r.resultValue === null
              ? 0
              : (scores.get(r.resultValue) ?? null),
        estimated: true,
        state,
      };
    }),
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

  // Preliminary standings. An entry appears as soon as it is on any grid, so a
  // team that has run nothing yet is listed on zero rather than omitted, and a
  // team that DNF'd an event carries that event as a settled zero. Both counts
  // travel with the total because mid-competition the totals are not
  // comparable on their own: a team on four events and a team on two are not
  // in the same race, and the standing has to say so rather than imply it.
  const totals = new Map<string, LiveOverall>();
  for (const ev of events) {
    for (const row of ev.rows) {
      if (!row.schoolId) continue;
      const t = totals.get(row.schoolId) ?? {
        school: row.school, schoolId: row.schoolId, teamName: row.teamName,
        carNumber: row.carNumber, points: 0, scored: 0, zeroed: 0, pending: 0, rank: 0,
      };
      if (row.state === 'pending') {
        t.pending += 1;
      } else {
        t.points += row.points ?? 0;
        t.scored += 1;
        if (row.state === 'zero' || (row.points ?? 0) === 0) t.zeroed += 1;
      }
      totals.set(row.schoolId, t);
    }
  }
  const overall = [...totals.values()]
    // Points first; among equal totals the entry that got there on fewer events
    // is ahead, since it has more still to score.
    .sort((a, b) => b.points - a.points || a.scored - b.scored)
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
