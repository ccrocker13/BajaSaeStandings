/**
 * Parser for the archive landing page (bajasae.net/res/ResultsLanding.aspx).
 *
 * The page groups competitions under "<year> Competitions" headings, which is
 * the only place the year of a competition is stated — the links themselves
 * are inconsistent, with older entries carrying the year in the link text
 * ("Baja SAE Oregon 2018") and recent ones not ("Baja SAE Oregon"). Year is
 * therefore taken from the heading a link sits under, never from its text.
 */
import { parse as parseHtml } from 'node-html-parser';
import type { ParseResult } from './types.js';

export interface ArchivedCompetition {
  id: string;
  name: string;
  year: number;
  url: string;
}

const clean = (s: string | undefined | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

export function parseResultsLanding(html: string, sourceUrl: string): ParseResult<ArchivedCompetition[]> {
  const warnings: string[] = [];
  const root = parseHtml(html);
  const out: ArchivedCompetition[] = [];

  // Walk the document in order so each link inherits the most recent heading.
  let currentYear: number | null = null;
  for (const el of root.querySelectorAll('h3, a[href*="CompetitionResults.aspx"]')) {
    if (el.rawTagName?.toLowerCase() === 'h3') {
      const m = clean(el.text).match(/(\d{4})\s+Competitions/i);
      currentYear = m ? Number(m[1]) : null;
      continue;
    }
    const href = el.getAttribute('href') ?? '';
    const id = href.match(/competitionid=([0-9a-fA-F-]{36})/)?.[1];
    if (!id) continue;
    if (currentYear === null) {
      warnings.push(`competition link with no year heading: ${clean(el.text)}`);
      continue;
    }
    // Strip a trailing year from names that carry one, so naming is uniform.
    const name = clean(el.text).replace(/\s+\d{4}$/, '');
    out.push({
      id,
      name,
      year: currentYear,
      url: new URL(href, sourceUrl).toString(),
    });
  }

  if (out.length === 0) warnings.push('no competitions found on landing page');
  return { data: out, sourceUrl, parsedAt: new Date().toISOString(), warnings };
}
