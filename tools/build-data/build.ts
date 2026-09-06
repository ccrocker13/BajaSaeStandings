/**
 * Backfills season data from the Baja SAE archive into committed JSON.
 *
 * Runs on a GitHub Actions runner, which has the network access this project's
 * development environment does not. Output lands in data/ and is read by the
 * site at build time, so the published pages need no runtime archive access.
 *
 * Politeness: requests are sequential with a delay between them and carry an
 * identifying User-Agent. A backfill of every season is roughly 35 requests, so
 * there is no reason to go faster.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArchiveTable } from '../../packages/parser/src/archive.js';
import { parseResultsLanding, type ArchivedCompetition } from '../../packages/parser/src/landing.js';
import { buildSeasonStandings, type CompetitionSummary } from '../../packages/parser/src/season.js';

const LANDING = 'https://www.bajasae.net/res/ResultsLanding.aspx';
const UA = 'BajaSaeStandings/0.1 (+https://github.com/ccrocker13/BajaSaeStandings) archive-backfill';
const DELAY_MS = 1200;
const OUT = join(process.cwd(), 'data');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 4) throw err;
      // Back off rather than retrying immediately; a struggling upstream should
      // not be hit harder.
      await sleep(DELAY_MS * 2 ** attempt);
    }
  }
  throw new Error('unreachable');
}

function overallUrl(comp: ArchivedCompetition): string {
  return `https://www.bajasae.net/res/EventResults.aspx?competitionid=${comp.id}&eventkey=OVR`;
}

async function main() {
  const warnings: string[] = [];

  console.log(`Fetching ${LANDING}`);
  const landing = parseResultsLanding(await get(LANDING), LANDING);
  warnings.push(...landing.warnings);
  const competitions = landing.data;
  console.log(`Found ${competitions.length} competitions across ${new Set(competitions.map((c) => c.year)).size} seasons`);

  const byYear = new Map<number, CompetitionSummary[]>();

  for (const comp of competitions) {
    const url = overallUrl(comp);
    console.log(`  ${comp.year} ${comp.name}`);
    await sleep(DELAY_MS);

    let summary: CompetitionSummary;
    try {
      const parsed = parseArchiveTable(await get(url), url);
      for (const w of parsed.warnings) warnings.push(`${comp.year} ${comp.name}: ${w}`);
      summary = {
        id: comp.id,
        name: comp.name,
        entries: parsed.data.rows.map((r) => ({
          schoolId: r.schoolId,
          school: r.school,
          teamName: r.teamName,
          overallPoints: r.numbers['overall'] ?? null,
          overallRank: r.rank,
        })),
      };
      if (summary.entries.length === 0) warnings.push(`${comp.year} ${comp.name}: no entries parsed`);
    } catch (err) {
      // One unreachable competition must not abort a whole backfill; record it
      // and carry on so the rest of the archive still lands.
      warnings.push(`${comp.year} ${comp.name}: fetch failed — ${(err as Error).message}`);
      summary = { id: comp.id, name: comp.name, entries: [] };
    }

    const list = byYear.get(comp.year) ?? [];
    list.push(summary);
    byYear.set(comp.year, list);
  }

  await mkdir(join(OUT, 'seasons'), { recursive: true });
  const index: { year: number; competitions: number; teams: number }[] = [];

  for (const [year, comps] of [...byYear].sort((a, b) => b[0] - a[0])) {
    const season = buildSeasonStandings(year, comps);
    await writeFile(join(OUT, 'seasons', `${year}.json`), JSON.stringify(season, null, 2) + '\n');
    index.push({ year, competitions: comps.length, teams: season.standings.length });
    console.log(`  wrote ${year}: ${comps.length} competitions, ${season.standings.length} teams`);
  }

  await writeFile(
    join(OUT, 'index.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), seasons: index, warnings }, null, 2) + '\n',
  );

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
