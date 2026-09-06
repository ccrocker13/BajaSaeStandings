/**
 * Parsers for the historical archive (bajasae.net/res/...).
 *
 * Unlike the live site, the archive publishes official points for every event,
 * so completed competitions need no score computation at all. Two conveniences
 * over the live markup: school and team are separate columns, and each column
 * header carries its own maximum in parentheses ("Acceleration (75)"), so the
 * scoring scale is read from the data instead of hardcoded.
 *
 * Archive pages are query-string addressable —
 * res/EventResults.aspx?competitionid=<GUID>&eventkey=<CODE> — with no
 * __VIEWSTATE postback, so backfilling a season is a plain series of GETs.
 */
import { parse as parseHtml } from 'node-html-parser';
import { schoolId } from './schools.js';
import { parseNumber } from './parse.js';
import type { ParseResult } from './types.js';

const clean = (s: string | undefined | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

export interface ArchiveColumn {
  /** Header text with the max stripped, e.g. "Acceleration". */
  label: string;
  /** Normalised lookup key, e.g. "acceleration". */
  key: string;
  /** Max points parsed from the header's parenthetical, when present. */
  maxPoints: number | null;
}

export interface ArchiveRow {
  rank: number | null;
  carNumber: number | null;
  school: string;
  schoolId: string;
  teamName: string | null;
  /** Every remaining column, keyed by normalised header. */
  values: Record<string, string>;
  /** Numeric view of the same columns; null where non-numeric. */
  numbers: Record<string, number | null>;
}

export interface ArchiveTable {
  columns: ArchiveColumn[];
  rows: ArchiveRow[];
}

const keyOf = (label: string): string =>
  clean(label).toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function parseColumns(headerCells: string[]): ArchiveColumn[] {
  return headerCells.map((raw) => {
    const text = clean(raw);
    const max = text.match(/\((\d+(?:\.\d+)?)\)/);
    return {
      label: text.replace(/\s*\([^)]*\)\s*$/, ''),
      key: keyOf(text),
      maxPoints: max ? Number(max[1]) : null,
    };
  });
}

export function parseArchiveTable(html: string, sourceUrl: string): ParseResult<ArchiveTable> {
  const warnings: string[] = [];
  const root = parseHtml(html);

  const table = root.querySelector('table.results-table') ?? root.querySelector('table[id*="GridView"]');
  if (!table) {
    warnings.push('no results table on page');
    return { data: { columns: [], rows: [] }, sourceUrl, parsedAt: new Date().toISOString(), warnings };
  }

  const trs = table.querySelectorAll('tr');
  const columns = parseColumns((trs[0]?.querySelectorAll('th,td') ?? []).map((c) => c.text));
  if (columns.length === 0) {
    warnings.push('results table has no header row');
    return { data: { columns: [], rows: [] }, sourceUrl, parsedAt: new Date().toISOString(), warnings };
  }

  const idx = (...names: string[]): number => {
    for (const n of names) {
      const i = columns.findIndex((c) => c.key === n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iRank = idx('rank', 'pos', 'position');
  const iCar = idx('car', 'car no', 'car number');
  const iSchool = idx('school');
  const iTeam = idx('team', 'team name');

  const rows: ArchiveRow[] = [];
  for (const tr of trs.slice(1)) {
    const cells = tr.querySelectorAll('th,td');
    if (cells.length === 0) continue;
    if (cells.length !== columns.length) {
      warnings.push(`row has ${cells.length} cells, expected ${columns.length}`);
      continue;
    }
    const values: Record<string, string> = {};
    const numbers: Record<string, number | null> = {};
    columns.forEach((col, i) => {
      const text = clean(cells[i]?.text);
      values[col.key] = text;
      numbers[col.key] = parseNumber(text);
    });
    const school = iSchool >= 0 ? clean(cells[iSchool]?.text) : '';
    rows.push({
      rank: iRank >= 0 ? parseNumber(cells[iRank]?.text) : null,
      carNumber: iCar >= 0 ? parseNumber(cells[iCar]?.text) : null,
      school,
      schoolId: school ? schoolId(school) : '',
      teamName: iTeam >= 0 ? clean(cells[iTeam]?.text) || null : null,
      values,
      numbers,
    });
  }

  return { data: { columns, rows }, sourceUrl, parsedAt: new Date().toISOString(), warnings };
}
