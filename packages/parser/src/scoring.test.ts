import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArchiveTable } from './archive.js';
import { scoreDynamicEvent, scoreEndurance } from './scoring.js';

const fx = (n: string) =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', `${n}.html`), 'utf8');

/**
 * These are the tests that decide whether the live projection is honest.
 * They reproduce official published points from published times alone, which
 * is exactly what has to happen during a live event.
 */
describe.each(['ny2026', 'or2026'])('dynamic scoring reproduces official points (%s)', (comp) => {
  it.each(['ACCEL', 'MANU', 'TRAC', 'SPEC'])('%s', (code) => {
    const { data } = parseArchiveTable(fx(`res-${comp}-${code}`), 'x');
    const rows = data.rows
      .map((r) => ({ t: r.numbers['best time'], s: r.numbers['score'] }))
      .filter((r) => r.t !== null && r.s !== null && r.t! > 0) as { t: number; s: number }[];
    expect(rows.length).toBeGreaterThan(8);

    const scores = scoreDynamicEvent(code, rows.map((r) => r.t));
    const errors = rows
      .filter((r) => r.s > 0)
      .map((r) => Math.abs(scores.get(r.t)! - r.s));

    // Published scores are rounded to two decimals, so anything under a cent
    // is exact agreement.
    expect(Math.max(...errors)).toBeLessThan(0.01);
  });
});

describe.each(['ny2026', 'or2026'])('endurance scoring reproduces official points (%s)', (comp) => {
  it('matches published points from lap counts', () => {
    const { data } = parseArchiveTable(fx(`res-${comp}-ENDUR`), 'x');
    const rows = data.rows
      .map((r) => ({ l: r.numbers['laps'], p: r.numbers['points'] }))
      .filter((r) => r.l !== null && r.p !== null && r.l! > 0) as { l: number; p: number }[];
    const leaderLaps = Math.max(...rows.map((r) => r.l));

    const errors = rows.map((r) => Math.abs(scoreEndurance(r.l, leaderLaps) - r.p));
    // The leader's placement bonus is not modelled, hence a tolerance of a
    // couple of points rather than a cent.
    expect(Math.max(...errors)).toBeLessThanOrEqual(2);
    const median = errors.sort((a, b) => a - b)[Math.floor(errors.length / 2)]!;
    expect(median).toBeLessThan(0.01);
  });
});
