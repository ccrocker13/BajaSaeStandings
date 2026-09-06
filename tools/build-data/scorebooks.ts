/**
 * Reads the final score books published for the 2013-2015 seasons.
 *
 * Those three seasons predate the archive's HTML competition pages, which only
 * reach back to 2016. They are published instead as .xlsx workbooks linked from
 * the results site's "previous years" page, so this is the only route to them.
 *
 * Each workbook has an "Overall" sheet whose real header row is row 4, with the
 * data beneath it. The column maxima differ from the current rules — design was
 * worth 200 in 2013 and is 150 now — which is exactly why nothing here assumes
 * a scale; only the rank, the identity and the overall total are read.
 */
import ExcelJS from 'exceljs';
import { schoolId } from '../../packages/parser/src/schools.js';
import type { CompetitionEntry, CompetitionSummary } from '../../packages/parser/src/season.js';

export interface ScoreBook {
  year: number;
  name: string;
  url: string;
}

/** Linked from bajasae.net's "previous years" results page. */
export const SCORE_BOOKS: ScoreBook[] = [
  { year: 2015, name: 'Baja SAE Auburn', url: 'https://www.bajasae.net/content/2015_Auburn_Scores3.xlsx' },
  { year: 2015, name: 'Baja SAE Maryland', url: 'https://www.bajasae.net/content/2015_Maryland_Scores2.xlsx' },
  { year: 2015, name: 'Baja SAE Oregon', url: 'https://www.bajasae.net/content/2015_Oregon_Scores1.xlsx' },
  { year: 2014, name: 'Baja SAE UTEP', url: 'https://www.bajasae.net/content/2014_BajaUTEP_Final.xlsx' },
  { year: 2014, name: 'Baja SAE Kansas', url: 'https://www.bajasae.net/content/2014_Kansas_Scores3.xlsx' },
  { year: 2014, name: 'Baja SAE Illinois', url: 'https://www.bajasae.net/content/2014_Illinois_Scores2.xlsx' },
  { year: 2013, name: 'Baja SAE Tennessee Tech', url: 'https://www.bajasae.net/content/2013_Tennessee_Scores3.xlsx' },
  { year: 2013, name: 'Baja SAE Washington', url: 'https://www.bajasae.net/content/2013_Washington_Scores_Final2.xlsx' },
  { year: 2013, name: 'Baja SAE Rochester', url: 'https://www.bajasae.net/content/2013_Rochester_Scores1.xlsx' },
];

/** Cell values arrive as strings, numbers, or formula objects. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const r = (value as { result?: unknown }).result;
    if (r !== undefined && r !== null) return String(r);
    const t = (value as { text?: unknown }).text;
    if (t !== undefined && t !== null) return String(t);
    return '';
  }
  return String(value);
}

function cellNumber(value: unknown): number | null {
  const t = cellText(value).trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export interface ParsedScoreBook {
  entries: CompetitionEntry[];
  warnings: string[];
}

export async function parseScoreBook(buffer: ArrayBuffer | Uint8Array): Promise<ParsedScoreBook> {
  const warnings: string[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as Parameters<typeof wb.xlsx.load>[0]);

  const sheet = wb.worksheets.find((w) => norm(w.name) === 'overall') ?? wb.worksheets[0];
  if (!sheet) return { entries: [], warnings: ['workbook has no sheets'] };

  // The header row is not row 1: these books carry a title block above it.
  // Find it by content rather than by a fixed offset, so a book laid out
  // slightly differently still parses.
  let headerRow = -1;
  for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
    const cells = [];
    for (let c = 1; c <= sheet.columnCount; c++) cells.push(norm(cellText(sheet.getRow(r).getCell(c).value)));
    if (cells.includes('rank') && cells.includes('school') && cells.some((h) => h.startsWith('overall'))) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) return { entries: [], warnings: ['no header row found on the overall sheet'] };

  const headers: string[] = [];
  for (let c = 1; c <= sheet.columnCount; c++) headers[c] = norm(cellText(sheet.getRow(headerRow).getCell(c).value));

  const col = (...names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h === n);
      if (i > 0) return i;
    }
    return -1;
  };
  const iRank = col('rank');
  const iSchool = col('school');
  const iTeam = col('team');
  // "Overall (1000)" normalises to "overall"; take the bare one, not the
  // "overall dynamic" / "overall static" subtotals.
  const iOverall = col('overall');
  if (iSchool < 0 || iOverall < 0) return { entries: [], warnings: ['overall sheet is missing school or overall columns'] };

  const entries: CompetitionEntry[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const school = cellText(row.getCell(iSchool).value).trim();
    if (!school) continue;
    const overall = cellNumber(row.getCell(iOverall).value);
    if (overall === null) {
      warnings.push(`row ${r} (${school}): no overall score`);
      continue;
    }
    entries.push({
      schoolId: schoolId(school),
      school,
      teamName: iTeam > 0 ? cellText(row.getCell(iTeam).value).trim() || null : null,
      overallPoints: overall,
      overallRank: iRank > 0 ? cellNumber(row.getCell(iRank).value) : null,
    });
  }

  if (entries.length === 0) warnings.push('overall sheet produced no entries');
  return { entries, warnings };
}

export async function scoreBookToCompetition(book: ScoreBook, buffer: Uint8Array): Promise<{ summary: CompetitionSummary; warnings: string[] }> {
  const { entries, warnings } = await parseScoreBook(buffer);
  return {
    summary: { id: book.url, name: book.name, entries },
    warnings: warnings.map((w) => `${book.year} ${book.name}: ${w}`),
  };
}
