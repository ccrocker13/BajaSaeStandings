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
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArchiveTable } from '../../packages/parser/src/archive.js';
import { parseResultsLanding, type ArchivedCompetition } from '../../packages/parser/src/landing.js';
import { buildSeasonStandings, type CompetitionSummary } from '../../packages/parser/src/season.js';
import type { Season } from '../../packages/parser/src/types.js';
import { SCORE_BOOKS, scoreBookToCompetition } from './scorebooks.js';

/**
 * Seasons before this are not carried. The archive's competition pages reach
 * back to 2016 and the score books cover 2013-2015; anything earlier exists
 * only as scattered third-party reporting, which is not a basis for standings.
 */
const EARLIEST_SEASON = 2013;

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
  let competitions: ArchivedCompetition[] = [];
  try {
    const landing = parseResultsLanding(await get(LANDING), LANDING);
    warnings.push(...landing.warnings);
    competitions = landing.data;
    console.log(`Found ${competitions.length} competitions across ${new Set(competitions.map((c) => c.year)).size} seasons`);
  } catch (err) {
    // The score books below do not depend on the landing page, so a failure
    // here degrades the run rather than ending it.
    warnings.push(`landing page unavailable — ${(err as Error).message}; archive seasons were not refreshed`);
    console.log(`  landing page unavailable: ${(err as Error).message}`);
  }

  const byYear = new Map<number, CompetitionSummary[]>();

  for (const comp of competitions) {
    if (comp.year < EARLIEST_SEASON) continue;
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

  // 2013-2015 come from .xlsx score books rather than archive pages.
  for (const book of SCORE_BOOKS) {
    if (book.year < EARLIEST_SEASON) continue;
    console.log(`  ${book.year} ${book.name} (score book)`);
    await sleep(DELAY_MS);
    let buffer: Buffer | null = null;
    try {
      const res = await fetch(book.url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      // Fall back to the committed capture, so a rebuild still works when the
      // score book is temporarily unreachable.
      const fixture = join(process.cwd(), 'packages', 'parser', 'fixtures',
        `scores-${book.year}-${book.name.replace(/^Baja SAE /, '').split(' ')[0]!.toLowerCase()}.xlsx`);
      try {
        buffer = await readFile(fixture);
        warnings.push(`${book.year} ${book.name}: fetch failed (${(err as Error).message}), used the committed capture`);
      } catch {
        warnings.push(`${book.year} ${book.name}: unavailable — ${(err as Error).message}`);
      }
    }
    if (!buffer) continue;
    const { summary, warnings: w } = await scoreBookToCompetition(book, buffer);
    warnings.push(...w);
    const list = byYear.get(book.year) ?? [];
    list.push(summary);
    byYear.set(book.year, list);
  }

  await mkdir(join(OUT, 'seasons'), { recursive: true });

  for (const [year, comps] of [...byYear].sort((a, b) => b[0] - a[0])) {
    const season = buildSeasonStandings(year, comps);
    await writeFile(join(OUT, 'seasons', `${year}.json`), JSON.stringify(season, null, 2) + '\n');
    console.log(`  wrote ${year}: ${comps.length} competitions, ${season.standings.length} teams`);
  }

  // Index every season file present, not just the ones written this run — a
  // partial run must not drop seasons it did not touch.
  const index: { year: number; competitions: number; teams: number }[] = [];
  for (const file of (await readdir(join(OUT, 'seasons'))).filter((f) => f.endsWith('.json')).sort().reverse()) {
    const season = JSON.parse(await readFile(join(OUT, 'seasons', file), 'utf8')) as Season;
    index.push({ year: season.year, competitions: season.competitions.length, teams: season.standings.length });
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
