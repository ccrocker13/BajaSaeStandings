/**
 * Turns the scraped season files into what the site actually loads.
 *
 * Bundling every season into the JavaScript produced a megabyte of payload,
 * which is the wrong trade for an audience standing at a track on bad signal.
 * Instead:
 *
 *   public/data/summary.json     small; everything the history, teams and team
 *                                pages need, imported eagerly
 *   public/data/seasons/<y>.json full standings, fetched only when a season
 *                                page is opened
 */
import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Season } from '../../packages/parser/src/types.js';

const DATA = join(process.cwd(), 'data');
const OUT = join(process.cwd(), 'public', 'data');

interface TeamSeason {
  year: number;
  rank: number;
  totalPoints: number;
  eventsAttended: number;
  results: { name: string; points: number | null }[];
}

async function main() {
  const files = (await readdir(join(DATA, 'seasons'))).filter((f) => f.endsWith('.json'));
  const seasons: Season[] = [];
  for (const f of files) {
    seasons.push(JSON.parse(await readFile(join(DATA, 'seasons', f), 'utf8')) as Season);
  }
  seasons.sort((a, b) => b.year - a.year);

  const teams = new Map<string, { schoolId: string; school: string; teamName: string | null; seasons: TeamSeason[] }>();

  for (const season of seasons) {
    for (const s of season.standings) {
      const entry = teams.get(s.schoolId) ?? {
        schoolId: s.schoolId,
        school: s.school,
        teamName: s.teamName,
        seasons: [] as TeamSeason[],
      };
      entry.school = entry.school || s.school;
      entry.teamName = entry.teamName ?? s.teamName;
      entry.seasons.push({
        year: season.year,
        rank: s.rank,
        totalPoints: s.totalPoints,
        eventsAttended: s.eventsAttended,
        results: s.results.map((r) => ({ name: r.competitionName, points: r.points })),
      });
      teams.set(s.schoolId, entry);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    seasons: seasons.map((s) => ({
      year: s.year,
      competitions: s.competitions.map((c) => ({ id: c.id, name: c.name })),
      teamCount: s.standings.length,
      champion: s.standings[0]
        ? {
            schoolId: s.standings[0].schoolId,
            school: s.standings[0].school,
            teamName: s.standings[0].teamName,
            totalPoints: s.standings[0].totalPoints,
          }
        : null,
    })),
    teams: [...teams.values()].sort((a, b) => a.school.localeCompare(b.school)),
  };

  await mkdir(join(OUT, 'seasons'), { recursive: true });
  await writeFile(join(OUT, 'summary.json'), JSON.stringify(summary));
  for (const f of files) {
    await copyFile(join(DATA, 'seasons', f), join(OUT, 'seasons', f));
  }

  const bytes = JSON.stringify(summary).length;
  console.log(`summary.json: ${(bytes / 1024).toFixed(0)} KiB, ${summary.teams.length} teams, ${summary.seasons.length} seasons`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
