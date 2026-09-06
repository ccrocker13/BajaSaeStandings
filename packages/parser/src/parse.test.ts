import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArchiveEventMenu, parseLeaderboard, parseNumber, parseDuration } from './parse.js';
import { parseArchiveTable } from './archive.js';
import { parseResultsLanding } from './landing.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.html`), 'utf8');

describe('parseNumber', () => {
  it('reads plain and decimal scores', () => {
    expect(parseNumber('130.00')).toBe(130);
    expect(parseNumber('0.00')).toBe(0);
  });

  it('distinguishes "not scored" from "scored zero"', () => {
    // This is the whole reason the field is nullable. A team that has not run
    // yet must not render as last place on zero points.
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('DNF')).toBeNull();
    expect(parseNumber('N/A')).toBeNull();
  });
});

describe('parseDuration', () => {
  it('reads seconds, mm:ss and hh:mm:ss', () => {
    expect(parseDuration('3.814')).toBeCloseTo(3.814);
    expect(parseDuration('3:35.995')).toBeCloseTo(215.995);
    expect(parseDuration('4:08:17')).toBeCloseTo(14897);
  });
});

describe('static event grid (Design)', () => {
  const { data, warnings } = parseLeaderboard(fixture('leaderboard-DESN'), 'test://DESN');

  it('parses without warnings', () => {
    expect(warnings).toEqual([]);
    expect(data.kind).toBe('static');
  });

  it('reads every entry', () => {
    // 103 table rows = 1 header + 102 teams, matching the reported NY field.
    expect(data.rows).toHaveLength(102);
  });

  it('splits school from team name via the separate labels', () => {
    const cornell = data.rows.find((r) => r.carNumber === 1);
    expect(cornell?.school).toBe('Cornell Univ');
    expect(cornell?.teamName).toBe('Cornell Baja Racing');
    expect(cornell?.schoolId).toBe('cornell');
    expect(cornell?.finalScore).toBe(130);
  });

  it('has no event nav of its own', () => {
    // Leaderboard pages list events in a GUID-keyed dropdown, not as coded
    // links. The code map has to come from the site root or the archive.
    expect(data.events).toEqual([]);
  });
});

describe('event code discovery', () => {
  it('reads codes from the site root nav', () => {
    const { data } = parseLeaderboard(fixture('results-root'), 'test://root');
    const byCode = Object.fromEntries(data.events.map((e) => [e.code, e.label]));
    // TRAC is Hill Climb and SPEC is Suspension & Traction. Inferring meaning
    // from the code string gets both backwards.
    expect(byCode['TRAC']).toBe('Hill Climb');
    expect(byCode['SPEC']).toBe('S&T');
    expect(byCode['DESN']).toBe('Design');
    expect(byCode['ENDUR']).toBe('Endurance');
  });

  it('reads better-spelled labels from an archive competition page', () => {
    const events = parseArchiveEventMenu(fixture('comp-newyork-2026'));
    const byCode = Object.fromEntries(events.map((e) => [e.code, e.label]));
    expect(byCode['TRAC']).toBe('Hill Climb');
    expect(byCode['SPEC']).toBe('Suspension & Traction');
    expect(byCode['MANU']).toBe('Maneuverability');
    expect(byCode['OVR']).toBe('OVERALL');
  });
});

describe('dynamic event grid (Acceleration)', () => {
  const { data, warnings } = parseLeaderboard(fixture('leaderboard-ACCEL'), 'test://ACCEL');

  it('parses without warnings', () => {
    expect(warnings).toEqual([]);
    expect(data.kind).toBe('dynamic');
  });

  it('reads position and raw time but no points', () => {
    const first = data.rows[0]!;
    expect(first.position).toBe(1);
    expect(first.carNumber).toBe(15);
    expect(first.schoolId).toBe('cal-poly-slo');
    expect(first.resultValue).toBeCloseTo(3.814);
    // Upstream simply does not publish points for dynamic events.
    expect(first.finalScore).toBeNull();
  });
});

describe('endurance grid', () => {
  const { data, warnings } = parseLeaderboard(fixture('leaderboard-ENDUR'), 'test://ENDUR');

  it('parses without warnings', () => {
    expect(warnings).toEqual([]);
    expect(data.kind).toBe('endurance');
  });

  it('reads laps and lap times', () => {
    const leader = data.rows[0]!;
    expect(leader.carNumber).toBe(39);
    expect(leader.schoolId).toBe('oregon-state');
    expect(leader.laps).toBe(61);
    expect(leader.lapsRfid).toBe(59);
    expect(leader.bestLapRaw).toContain('3:35.995');
  });

  it('reads live race status', () => {
    expect(data.endurance?.raceFlag).toBe('green');
    expect(data.endurance?.raceTime).toBe('4:08:17');
    expect(data.endurance?.lastDataUpdate).toContain('6/14/2026');
  });
});

describe('pages with no grid', () => {
  it('warns rather than throwing when there is no overall leaderboard', () => {
    // Event=OVR is a real code in the archive but returns no table live.
    const { data, warnings } = parseLeaderboard(fixture('leaderboard-OVR'), 'test://OVR');
    expect(data.kind).toBeNull();
    expect(data.rows).toEqual([]);
    expect(warnings).toContain('no results grid on page');
  });
});

describe('archive overall results', () => {
  const { data, warnings } = parseArchiveTable(fixture('res-ny2026-OVR'), 'test://ny-OVR');

  it('parses without warnings', () => {
    expect(warnings).toEqual([]);
    expect(data.rows).toHaveLength(102);
  });

  it('reads maximum points from the column headers', () => {
    const byKey = Object.fromEntries(data.columns.map((c) => [c.key, c.maxPoints]));
    expect(byKey['overall']).toBe(1000);
    expect(byKey['design']).toBe(150);
    expect(byKey['cost']).toBe(100);
    expect(byKey['business']).toBe(50);
    expect(byKey['acceleration']).toBe(75);
    expect(byKey['endurance']).toBe(400);
  });

  it('reads the winner with school and team in separate columns', () => {
    const first = data.rows[0]!;
    expect(first.rank).toBe(1);
    expect(first.school).toBe('Case Western Reserve Univ');
    expect(first.teamName).toBe('CWRU Motorsports');
    expect(first.schoolId).toBe('case-western');
    expect(first.numbers['overall']).toBeCloseTo(927.74);
  });

  it('has subtotals that reconcile to the overall score, penalties included', () => {
    // static + dynamic + endurance + adjustments = overall.
    //
    // The adjustments term is not decoration: McMaster carries a -75 penalty at
    // this competition, and dropping the term silently inflates a penalised
    // team's season total. Tolerance is 0.02 because the published subtotals
    // are each rounded to two decimals before being summed.
    let checked = 0;
    for (const row of data.rows) {
      const s = row.numbers['overall static'] ?? null;
      const d = row.numbers['overall dynamic'] ?? null;
      const e = row.numbers['endurance'] ?? null;
      const adj = row.numbers['adjustments'] ?? 0;
      const o = row.numbers['overall'] ?? null;
      if (s === null || d === null || e === null || o === null) continue;
      expect(Math.abs(s + d + e + adj - o)).toBeLessThanOrEqual(0.02);
      checked++;
    }
    expect(checked).toBeGreaterThan(90);
  });

  it('carries penalties through as negative adjustments', () => {
    const mcmaster = data.rows.find((r) => r.schoolId === 'mcmaster-university');
    expect(mcmaster?.numbers['adjustments']).toBe(-75);
  });
});

describe('archive landing page', () => {
  const { data, warnings } = parseResultsLanding(
    fixture('results-landing'),
    'https://www.bajasae.net/res/ResultsLanding.aspx',
  );

  it('parses without warnings', () => {
    expect(warnings).toEqual([]);
    expect(data.length).toBeGreaterThan(25);
  });

  it('takes the year from the section heading, not the link text', () => {
    // Recent links omit the year entirely; older ones embed it. Only the
    // heading is reliable for both.
    const oregon2026 = data.find((c) => c.year === 2026 && c.name === 'Baja SAE Oregon');
    expect(oregon2026?.id).toBe('6b91e195-df0f-4baf-a4d6-116c03aa704d');

    const oregon2018 = data.find((c) => c.year === 2018 && c.name === 'Baja SAE Oregon');
    expect(oregon2018?.id).toBe('a8d3752f-aee1-4492-94e7-7cf021a11a65');
  });

  it('covers every season the archive lists', () => {
    const years = [...new Set(data.map((c) => c.year))].sort((a, b) => a - b);
    expect(years[0]).toBe(2016);
    expect(years.at(-1)).toBe(2026);
  });

  it('lists only two competitions for 2026, the third being unraced', () => {
    // Ohio 2026 runs 24-27 September and has no archive entry yet.
    expect(data.filter((c) => c.year === 2026)).toHaveLength(2);
  });
});
