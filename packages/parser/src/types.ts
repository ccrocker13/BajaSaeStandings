/**
 * Shape of Baja SAE results data.
 *
 * Deliberately tolerant: upstream is a scraped ASP.NET page, so any individual
 * number can be missing or unparseable. Every numeric field is nullable and the
 * distinction between "zero points" and "no score yet" is preserved — during a
 * live event that difference is the whole story.
 */

/**
 * Sub-event identifier as used in `Leaderboard.aspx?Event=<code>`.
 *
 * Not an enum on purpose. The dynamic-event lineup varies by competition (hill
 * climb at one, sled pull or rock crawl at another), and codes for several of
 * them are unknown. Codes are discovered from the page's own navigation.
 * Known-real codes so far: OVR, DESN, PRES, COST, ACCEL, MANU, ENDUR, SPEC.
 */
export type EventCode = string;

export interface EventDefinition {
  code: EventCode;
  /** Human label as printed upstream, e.g. "Suspension & Traction". */
  label: string;
  /** Maximum points, when we can determine it. See scoring.ts. */
  maxPoints: number | null;
  category: 'static' | 'dynamic' | 'overall' | 'unknown';
}

export interface ScoreCell {
  code: EventCode;
  /** Null means not scored yet, which is different from scoring zero. */
  points: number | null;
  rank: number | null;
  /** Original cell text, retained so a parsing surprise stays diagnosable. */
  raw: string;
}

export interface CarEntry {
  carNumber: number;
  /** School name exactly as printed upstream. */
  school: string;
  /** Canonical id, so one school reconciles across seasons. See schools.ts. */
  schoolId: string;
  /** Team nickname where the page carries one, e.g. "RIOT Racing". */
  teamName: string | null;
  overallPoints: number | null;
  overallRank: number | null;
  scores: Record<EventCode, ScoreCell>;
}

export interface CompetitionResults {
  /** GUID used by the archive URLs, when known. */
  competitionId: string | null;
  /** e.g. "Baja SAE Ohio". */
  name: string;
  year: number | null;
  /** "last data update" stamp printed on the page, verbatim. */
  lastUpdatedUpstream: string | null;
  status: 'live' | 'final' | 'unknown';
  events: EventDefinition[];
  entries: CarEntry[];
}

/**
 * Parser output envelope.
 *
 * `warnings` is not decoration — it is surfaced in the UI. A leaderboard that
 * silently drops half its rows because a column moved is worse than one that
 * says so.
 */
export interface ParseResult<T> {
  data: T;
  sourceUrl: string;
  parsedAt: string;
  warnings: string[];
}

/** One competition's contribution to a team's season total. */
export interface SeasonEventResult {
  competitionName: string;
  competitionId: string | null;
  points: number | null;
  overallRank: number | null;
  /** True when this came from a live, still-running event. */
  provisional: boolean;
}

export interface SeasonStanding {
  schoolId: string;
  school: string;
  teamName: string | null;
  results: SeasonEventResult[];
  /** Sum of overall points across the season's events. */
  totalPoints: number;
  eventsAttended: number;
  rank: number;
  /** True when any contributing result is from an in-progress event. */
  provisional: boolean;
}

export interface Season {
  year: number;
  competitions: { id: string | null; name: string; startDate: string | null; endDate: string | null; location: string | null }[];
  standings: SeasonStanding[];
}
