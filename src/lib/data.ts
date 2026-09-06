/**
 * Season data, baked in at build time.
 *
 * The archive is scraped by a scheduled workflow into data/seasons/*.json and
 * committed, so the published site needs no runtime access to bajasae.net for
 * anything historical. Only the in-progress competition is fetched live.
 */
import type { Season } from '@baja/parser';

const modules = import.meta.glob<{ default: Season }>('/data/seasons/*.json', { eager: true });

export const SEASONS: Season[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => b.year - a.year);

export const SEASON_BY_YEAR = new Map(SEASONS.map((s) => [s.year, s]));

export const LATEST_SEASON = SEASONS[0];

export interface TeamHistoryRow {
  year: number;
  rank: number;
  totalPoints: number;
  eventsAttended: number;
  results: Season['standings'][number]['results'];
}

/** Every season a school has a recorded result in, newest first. */
export function teamHistory(schoolId: string): { school: string; teamName: string | null; rows: TeamHistoryRow[] } {
  const rows: TeamHistoryRow[] = [];
  let school = schoolId;
  let teamName: string | null = null;

  for (const season of SEASONS) {
    const standing = season.standings.find((s) => s.schoolId === schoolId);
    if (!standing) continue;
    school = standing.school;
    teamName = standing.teamName ?? teamName;
    rows.push({
      year: season.year,
      rank: standing.rank,
      totalPoints: standing.totalPoints,
      eventsAttended: standing.eventsAttended,
      results: standing.results,
    });
  }
  return { school, teamName, rows };
}

/** All schools that appear in any season, for the team index and search. */
export function allTeams(): { schoolId: string; school: string; teamName: string | null; seasons: number; best: number }[] {
  const map = new Map<string, { schoolId: string; school: string; teamName: string | null; seasons: number; best: number }>();
  for (const season of SEASONS) {
    for (const s of season.standings) {
      const existing = map.get(s.schoolId);
      if (existing) {
        existing.seasons += 1;
        existing.best = Math.min(existing.best, s.rank);
        existing.teamName = existing.teamName ?? s.teamName;
      } else {
        map.set(s.schoolId, { schoolId: s.schoolId, school: s.school, teamName: s.teamName, seasons: 1, best: s.rank });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.school.localeCompare(b.school));
}
