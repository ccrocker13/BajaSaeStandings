import { describe, expect, it } from 'vitest';
import { buildSeasonStandings, type CompetitionSummary } from './season.js';

const comp = (name: string, entries: [string, number][]): CompetitionSummary => ({
  id: name,
  name,
  entries: entries.map(([schoolId, overallPoints], i) => ({
    schoolId,
    school: schoolId,
    teamName: null,
    overallPoints,
    overallRank: i + 1,
  })),
});

describe('buildSeasonStandings', () => {
  it('sums a team across the season', () => {
    const s = buildSeasonStandings(2026, [
      comp('A', [['x', 900], ['y', 800]]),
      comp('B', [['x', 850], ['y', 880]]),
    ]);
    expect(s.standings[0]).toMatchObject({ schoolId: 'x', totalPoints: 1750, eventsAttended: 2, rank: 1 });
    expect(s.standings[1]).toMatchObject({ schoolId: 'y', totalPoints: 1680, rank: 2 });
  });

  it('counts only a school\'s best car at each competition', () => {
    // A two-car programme must not bank both cars' points for one event.
    const s = buildSeasonStandings(2026, [
      comp('A', [['multi', 900], ['multi', 700], ['single', 850]]),
      comp('B', [['multi', 800], ['single', 860]]),
    ]);
    const multi = s.standings.find((x) => x.schoolId === 'multi')!;
    expect(multi.totalPoints).toBe(1700);
    expect(multi.eventsAttended).toBe(2);
    // Summing both cars would have put "multi" on 2400 and first overall.
    expect(s.standings[0]!.schoolId).toBe('single');
  });

  it('does not zero-fill a team that skipped an event', () => {
    const s = buildSeasonStandings(2026, [
      comp('A', [['x', 900], ['y', 500]]),
      comp('B', [['x', 900]]),
    ]);
    const y = s.standings.find((v) => v.schoolId === 'y')!;
    expect(y.eventsAttended).toBe(1);
    expect(y.totalPoints).toBe(500);
  });

  it('shares a rank on equal points and skips the next', () => {
    const s = buildSeasonStandings(2026, [comp('A', [['a', 900], ['b', 900], ['c', 100]])]);
    expect(s.standings.map((x) => x.rank)).toEqual([1, 1, 3]);
  });

  it('marks a season provisional while a competition is in progress', () => {
    const live = { ...comp('B', [['x', 400]]), inProgress: true };
    const s = buildSeasonStandings(2026, [comp('A', [['x', 900]]), live]);
    expect(s.standings[0]!.provisional).toBe(true);
  });
});
