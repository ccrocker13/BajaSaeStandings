/**
 * Canonical school identity.
 *
 * Upstream prints school names inconsistently across seasons ("Univ of
 * Michigan - Ann Arbor", "University of Michigan"), and the whole point of a
 * cross-season standings site is that one school reconciles to one row. This
 * normalises to a slug, expanding the abbreviations SAE's registration system
 * actually uses.
 */

/**
 * Abbreviations as they appear in upstream school names.
 *
 * Deliberately minimal. An expansion that fires on the wrong word merges two
 * distinct schools into one row, which is a much worse failure than leaving a
 * school unmerged — so "tech" is NOT expanded (Virginia Tech is genuinely named
 * that), and neither is "st" (it collides with "St. Louis"). Anything an
 * expansion cannot safely handle is handled by ALIASES below instead.
 */
const EXPANSIONS: [RegExp, string][] = [
  [/^univ$/, 'university'],
  [/^inst$/, 'institute'],
  [/^coll$/, 'college'],
  [/^polytech$/, 'polytechnic'],
];

/**
 * Schools whose printed name varies enough that normalisation alone will not
 * merge them. Keys are already-normalised forms; values are the canonical slug.
 *
 * Deliberately small. Every entry is a claim that two differently-printed names
 * are the same team, so entries get added only when a real mismatch is observed
 * in the fixtures, never speculatively.
 */
const ALIASES: Record<string, string> = {
  'rochester-institute-of-technology': 'rit',
  'rit': 'rit',
  'ecole-de-technologie-superieure': 'ets',
  'ets': 'ets',
  'universite-du-quebec-ecole-de-technologie-superieure': 'ets',
  'california-polytechnic-state-university-slo': 'cal-poly-slo',
  'california-polytechnic-state-university-san-luis-obispo': 'cal-poly-slo',
  'university-of-michigan-ann-arbor': 'michigan',
  'university-of-michigan': 'michigan',
  'case-western-reserve-university': 'case-western',
  'michigan-technological-university': 'michigan-tech',
  'michigan-tech': 'michigan-tech',
  'virginia-polytechnic-institute-and-state-university': 'virginia-tech',
  'virginia-tech': 'virginia-tech',
  'cornell-university': 'cornell',
  'oregon-state-university': 'oregon-state',
};

/**
 * Strip diacritics so "Ecole" and "École" agree. Baja SAE has a lot of Quebec
 * and Brazilian teams, so this is not a corner case.
 */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeSchoolName(raw: string): string {
  return stripDiacritics(raw)
    .toLowerCase()
    .replace(/[.,'’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => {
      for (const [pattern, replacement] of EXPANSIONS) {
        if (pattern.test(word)) return replacement;
      }
      return word;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function schoolId(raw: string): string {
  const slug = normalizeSchoolName(raw).replace(/\s+/g, '-');
  return ALIASES[slug] ?? slug;
}
