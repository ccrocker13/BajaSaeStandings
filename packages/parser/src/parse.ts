/**
 * Parsers for the live results site (results.bajasae.net).
 *
 * Shapes confirmed against committed fixtures. Three grid layouts exist:
 *
 *   static     Car No. | School/Team | Status | Report | Eval | Penalty | Final
 *   dynamic    Pos. | Car No. | School/Team | Status | Time
 *   endurance  Pos. | Car No. | School/Team | Laps | Laps (RFID) | Last Lap | Best Lap
 *
 * The important asymmetry: only the static grid publishes points. Dynamic
 * events publish a raw time and endurance publishes lap counts, and
 * Leaderboard.aspx?Event=OVR returns no table at all — there is no overall
 * points leaderboard to read during a competition. Anything resembling live
 * overall standings has to be computed downstream; see scoring.ts.
 */
import { parse as parseHtml, type HTMLElement } from 'node-html-parser';
import { schoolId } from './schools.js';
import type { ParseResult } from './types.js';

export type GridKind = 'static' | 'dynamic' | 'endurance';

const GRID_IDS: Record<GridKind, string> = {
  static: 'MainContent_GridViewStaticResults',
  dynamic: 'MainContent_GridViewDynamicResults',
  endurance: 'MainContent_GridViewEnduranceResults',
};

export interface LeaderboardRow {
  position: number | null;
  carNumber: number | null;
  school: string;
  schoolId: string;
  teamName: string | null;
  status: string | null;
  /** Static events only. */
  reportScore: number | null;
  evalScore: number | null;
  penaltyPoints: number | null;
  finalScore: number | null;
  /** Dynamic events only. Raw text is kept because units vary by event. */
  resultRaw: string | null;
  resultValue: number | null;
  /** Endurance only. */
  laps: number | null;
  lapsRfid: number | null;
  lastLapRaw: string | null;
  bestLapRaw: string | null;
}

export interface EnduranceStatus {
  lastDataUpdate: string | null;
  raceTime: string | null;
  raceFlag: string | null;
  leaderName: string | null;
  leaderLaps: string | null;
  leaderMargin: string | null;
  bestLapBy: string | null;
  bestLapTime: string | null;
}

export interface LeaderboardPage {
  kind: GridKind | null;
  competitionTitle: string | null;
  siteLocation: string | null;
  siteLastUpdate: string | null;
  /** Event code/label pairs discovered from the site's own navigation. */
  events: { code: string; label: string }[];
  rows: LeaderboardRow[];
  endurance: EnduranceStatus | null;
}

const clean = (s: string | undefined | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Parse a number from a results cell.
 *
 * Returns null rather than 0 for blanks and non-numeric statuses ("DNF",
 * "DNS", "N/A"). During a live event the difference between "scored zero" and
 * "has not run yet" is the entire story, so it must survive parsing.
 */
export function parseNumber(raw: string | null | undefined): number | null {
  const t = clean(raw);
  if (!t) return null;
  const m = t.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  // Reject cells that merely contain a digit inside a status word.
  if (!/^[-+]?[\d.,\s]+$/.test(t)) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** "3:35.995" | "1:02:03.5" | "3.814" -> seconds. */
export function parseDuration(raw: string | null | undefined): number | null {
  const t = clean(raw);
  if (!t) return null;
  const m = t.match(/(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const [, a, b, c] = m;
  const secs = Number(c);
  if (!Number.isFinite(secs)) return null;
  if (a && b) return Number(a) * 3600 + Number(b) * 60 + secs;
  if (a) return Number(a) * 60 + secs;
  return secs;
}

/** Normalised header key, e.g. "Laps (RFID)" -> "laps rfid". */
const headerKey = (s: string): string => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function textOf(root: HTMLElement, id: string): string | null {
  const el = root.querySelector(`#${id}`);
  const t = clean(el?.text);
  return t || null;
}

/**
 * Event codes come from the site's own markup rather than a hardcoded list.
 *
 * This is load-bearing: the dynamic-event lineup varies by competition, and
 * two codes are counterintuitive — TRAC is Hill Climb, and SPEC is Suspension
 * & Traction. Guessing from the code string gets both wrong.
 *
 * Note the event links live on the site root, not on the leaderboard pages —
 * those carry a dropdown keyed by opaque GUIDs instead. Use
 * parseArchiveEventMenu for the archive pages, which expose code and label
 * together and spell the labels better ("Maneuverability" rather than the
 * root's "Manueverability").
 */
export function parseEventMenu(root: HTMLElement): { code: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const a of root.querySelectorAll('a[href*="Leaderboard.aspx?Event="]')) {
    const href = a.getAttribute('href') ?? '';
    const code = href.match(/Event=([A-Za-z0-9_-]+)/)?.[1];
    const label = clean(a.text);
    if (code && label && !seen.has(code)) seen.set(code, label);
  }
  return [...seen].map(([code, label]) => ({ code, label }));
}

/**
 * Event code/label pairs from an archive competition page's "Jump To Event"
 * dropdown, whose option values are the same codes the live site uses.
 */
export function parseArchiveEventMenu(html: string): { code: string; label: string }[] {
  const root = parseHtml(html);
  const select = root.querySelector('[id$="ddlJumpToEvent"]');
  if (!select) return [];
  const out: { code: string; label: string }[] = [];
  for (const opt of select.querySelectorAll('option')) {
    const code = clean(opt.getAttribute('value'));
    const label = clean(opt.text);
    if (code && label) out.push({ code, label });
  }
  return out;
}

function readRows(table: HTMLElement, kind: GridKind, warnings: string[]): LeaderboardRow[] {
  const trs = table.querySelectorAll('tr');
  if (trs.length === 0) return [];

  const headers = (trs[0]?.querySelectorAll('th,td') ?? []).map((c) => headerKey(c.text));
  if (headers.length === 0) {
    warnings.push(`${kind} grid has no header row`);
    return [];
  }

  const rows: LeaderboardRow[] = [];
  for (const tr of trs.slice(1)) {
    const cells = tr.querySelectorAll('th,td');
    if (cells.length === 0) continue;
    if (cells.length !== headers.length) {
      warnings.push(`${kind} row has ${cells.length} cells, expected ${headers.length}`);
      continue;
    }

    // Address cells by header name so a reordered or inserted column does not
    // silently shift every value one place to the left.
    const get = (...names: string[]): string | null => {
      for (const n of names) {
        const i = headers.indexOf(n);
        if (i >= 0) return clean(cells[i]?.text);
      }
      return null;
    };

    // The school cell holds two separate labels. Reading them individually is
    // the only way to split school from team name — the concatenated cell text
    // gives "Cornell Univ Cornell Baja Racing" with no delimiter.
    const school = clean(tr.querySelector('[id*="_Label1_"]')?.text);
    const teamName = clean(tr.querySelector('[id*="_Label2_"]')?.text) || null;
    const schoolCell = get('school team name', 'school team', 'school');
    if (!school && schoolCell) warnings.push(`row missing school label, falling back to cell text`);
    const schoolFinal = school || schoolCell || '';

    rows.push({
      position: parseNumber(get('pos', 'position', 'rank')),
      carNumber: parseNumber(get('car no', 'car', 'car number')),
      school: schoolFinal,
      schoolId: schoolFinal ? schoolId(schoolFinal) : '',
      teamName,
      status: get('status'),
      reportScore: parseNumber(get('report score')),
      evalScore: parseNumber(get('eval score')),
      penaltyPoints: parseNumber(get('penalty points')),
      finalScore: parseNumber(get('final score')),
      resultRaw: kind === 'dynamic' ? get('time', 'result', 'score') : null,
      resultValue: kind === 'dynamic' ? parseDuration(get('time', 'result', 'score')) : null,
      laps: parseNumber(get('laps')),
      lapsRfid: parseNumber(get('laps rfid')),
      lastLapRaw: get('last lap time'),
      bestLapRaw: get('best lap time'),
    });
  }
  return rows;
}

function readEnduranceStatus(root: HTMLElement): EnduranceStatus | null {
  const panel = root.querySelector('#MainContent_PanelEndInfo');
  if (!panel) return null;
  return {
    lastDataUpdate: textOf(root, 'MainContent_LabelEndLastUpdate'),
    raceTime: textOf(root, 'MainContent_LabelEndRaceTime'),
    // Upstream spells this label with a lowercase "end". Matching their
    // casing rather than correcting it is the point.
    raceFlag: textOf(root, 'MainContent_LabelendFlag'),
    leaderName: textOf(root, 'MainContent_LabelEndLeaderName'),
    leaderLaps: textOf(root, 'MainContent_LabelEndLeaderLaps'),
    leaderMargin: textOf(root, 'MainContent_LabelEndLeaderMargin'),
    bestLapBy: textOf(root, 'MainContent_LabelEndBestLapBy'),
    bestLapTime: textOf(root, 'MainContent_LabelEndBestLapTime'),
  };
}

export function parseLeaderboard(html: string, sourceUrl: string): ParseResult<LeaderboardPage> {
  const warnings: string[] = [];
  const root = parseHtml(html);

  let kind: GridKind | null = null;
  let table: HTMLElement | null = null;
  for (const k of Object.keys(GRID_IDS) as GridKind[]) {
    const found = root.querySelector(`#${GRID_IDS[k]}`);
    if (found) {
      kind = k;
      table = found;
      break;
    }
  }

  if (!table || !kind) {
    // Expected for Leaderboard.aspx with no Event, and for Event=OVR.
    warnings.push('no results grid on page');
  }

  return {
    data: {
      kind,
      competitionTitle: textOf(root, 'lblEventTitle'),
      siteLocation: textOf(root, 'lblSiteLocation'),
      siteLastUpdate: textOf(root, 'lblSiteLocationUpdate'),
      events: parseEventMenu(root),
      rows: table && kind ? readRows(table, kind, warnings) : [],
      endurance: readEnduranceStatus(root),
    },
    sourceUrl,
    parsedAt: new Date().toISOString(),
    warnings,
  };
}
