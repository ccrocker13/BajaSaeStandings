/**
 * Season aggregation — the Mike Schmidt Memorial Iron Team Award race.
 *
 * The award goes to the team with the highest cumulative points across the
 * season's three North American events. Aggregation is a plain sum of each
 * competition's overall score, which already includes any penalty carried in
 * that competition's adjustments column.
 *
 * Teams that skip an event are not excluded and are not zero-filled; they
 * simply have fewer contributing results, which is why `eventsAttended` is
 * surfaced alongside the total. A team on two events is not "losing" to a team
 * on three in the same sense, and the UI needs to be able to say so.
 *
 * A school may enter more than one car at the same competition, so only its
 * best-scoring entry counts toward the season. Summing every car instead
 * inflates multi-car programmes — with that bug the 2017 and 2021 seasons came
 * out with the wrong winner, each showing four contributing results across a
 * three-competition season.
 */
import type { Season, SeasonEventResult, SeasonStanding } from './types.js';

export interface CompetitionEntry {
  schoolId: string;
  school: string;
  teamName: string | null;
  overallPoints: number | null;
  overallRank: number | null;
}

export interface CompetitionSummary {
  id: string | null;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  /** True while the competition is still running, making its points provisional. */
  inProgress?: boolean;
  entries: CompetitionEntry[];
}

export function buildSeasonStandings(year: number, competitions: CompetitionSummary[]): Season {
  const byTeam = new Map<string, SeasonStanding>();

  for (const comp of competitions) {
    // Collapse multiple cars from one school at this competition down to their
    // best result before it reaches the season total.
    const bestPerSchool = new Map<string, CompetitionEntry>();
    for (const entry of comp.entries) {
      if (!entry.schoolId) continue;
      const existing = bestPerSchool.get(entry.schoolId);
      const better =
        !existing ||
        (entry.overallPoints ?? -Infinity) > (existing.overallPoints ?? -Infinity);
      if (better) bestPerSchool.set(entry.schoolId, entry);
    }

    for (const entry of bestPerSchool.values()) {

      let standing = byTeam.get(entry.schoolId);
      if (!standing) {
        standing = {
          schoolId: entry.schoolId,
          school: entry.school,
          teamName: entry.teamName,
          results: [],
          totalPoints: 0,
          eventsAttended: 0,
          rank: 0,
          provisional: false,
        };
        byTeam.set(entry.schoolId, standing);
      }

      // Prefer the most recent spelling of the school and team name; upstream
      // occasionally retitles a team mid-season.
      standing.school = entry.school || standing.school;
      standing.teamName = entry.teamName ?? standing.teamName;

      const result: SeasonEventResult = {
        competitionName: comp.name,
        competitionId: comp.id,
        points: entry.overallPoints,
        overallRank: entry.overallRank,
        provisional: comp.inProgress === true,
      };
      standing.results.push(result);

      if (entry.overallPoints !== null) {
        standing.totalPoints += entry.overallPoints;
        standing.eventsAttended += 1;
      }
      if (result.provisional) standing.provisional = true;
    }
  }

  const standings = [...byTeam.values()].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    // A tie on points goes to the team that scored it over fewer events.
    if (a.eventsAttended !== b.eventsAttended) return a.eventsAttended - b.eventsAttended;
    return a.school.localeCompare(b.school);
  });

  // Standard competition ranking: equal totals share a rank, and the next rank
  // skips accordingly.
  let previousPoints: number | null = null;
  let previousRank = 0;
  standings.forEach((standing, i) => {
    if (previousPoints !== null && Math.abs(standing.totalPoints - previousPoints) < 1e-9) {
      standing.rank = previousRank;
    } else {
      standing.rank = i + 1;
      previousRank = standing.rank;
      previousPoints = standing.totalPoints;
    }
  });

  return {
    year,
    competitions: competitions.map((c) => ({
      id: c.id,
      name: c.name,
      startDate: c.startDate ?? null,
      endDate: c.endDate ?? null,
      location: c.location ?? null,
    })),
    standings,
  };
}
