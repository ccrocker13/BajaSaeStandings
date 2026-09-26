import { describe, expect, it } from 'vitest';
import { classifyResult } from './live.js';
import { parseLeaderboard } from './parse.js';

/**
 * Builds a dynamic-event grid in the shape the results site emits, so these
 * tests exercise the real header-matching and cell-reading path rather than a
 * hand-made row object.
 */
function dynamicGrid(headers: string[], rows: string[][]): string {
  const th = headers.map((h) => `<th>${h}</th>`).join('');
  const tr = rows
    .map(
      (cells, i) =>
        `<tr>${cells
          .map((c, j) =>
            j === 2
              ? `<td><span id="MainContent_GridViewDynamicResults_Label1_${i}">${c}</span>` +
                `<span id="MainContent_GridViewDynamicResults_Label2_${i}"></span></td>`
              : `<td>${c}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return `<html><body><table id="MainContent_GridViewDynamicResults">
    <tr>${th}</tr>${tr}</table></body></html>`;
}

describe('classifyResult', () => {
  it('treats a value as scored', () => {
    expect(classifyResult(12.5, 'OK')).toBe('scored');
    expect(classifyResult(0, 'OK')).toBe('scored');
  });

  it('treats a finished-but-scoreless attempt as a settled zero', () => {
    // The distinction the standings depend on: a team that ran Suspension &
    // Traction and did not finish has settled that event on nothing. Dropping
    // it instead would leave its total looking like a team that has not run.
    for (const s of ['DNF', 'dnf', 'DQ', 'Disqualified', 'Did Not Finish', 'Black Flag']) {
      expect(classifyResult(null, s)).toBe('zero');
    }
  });

  it('treats an absent or unrecognised status as pending', () => {
    expect(classifyResult(null, null)).toBe('pending');
    expect(classifyResult(null, '')).toBe('pending');
    expect(classifyResult(null, 'OK')).toBe('pending');
    // Inventing a zero from a status we do not understand would be worse than
    // admitting the result is unknown.
    expect(classifyResult(null, 'Running')).toBe('pending');
    expect(classifyResult(null, 'N/A')).toBe('pending');
  });
});

describe('dynamic result columns', () => {
  it('reads "Adjusted Time" when there is no plain "Time" column', () => {
    // Maneuverability and Suspension post "Adjusted Time"/"Raw Time" rather
    // than "Time". Before this, every entry in those events parsed as no
    // result, so 53 teams contributed nothing to the Ohio 2026 standings.
    const html = dynamicGrid(
      ['Pos.', 'Car No.', 'School / Team Name', 'Status', 'Adjusted Time', 'Raw Time', 'Whisker'],
      [['1', '2', 'Cornell Univ', 'OK', '45.120', '44.900', '0']],
    );
    const page = parseLeaderboard(html, 'https://results.bajasae.net/Leaderboard.aspx?Event=MANU');
    expect(page.data.kind).toBe('dynamic');
    expect(page.data.rows[0]?.resultValue).toBeCloseTo(45.12, 3);
  });

  it('prefers the plain "Time" column when both are present', () => {
    const html = dynamicGrid(
      ['Pos.', 'Car No.', 'School / Team Name', 'Status', 'Time', 'Raw Time'],
      [['1', '6', 'Cornell Univ', 'OK', '5.248', '9.999']],
    );
    const page = parseLeaderboard(html, 'https://results.bajasae.net/Leaderboard.aspx?Event=ACCEL');
    expect(page.data.rows[0]?.resultValue).toBeCloseTo(5.248, 3);
  });

  it('reads the site\'s "0.000" placeholder as no result', () => {
    // Every Passport Pull row read 0.000 before that event began at Ohio 2026.
    // Scored literally it would hand the entire field a settled result for an
    // event nobody had attempted.
    const html = dynamicGrid(
      ['Pos.', 'Car No.', 'School / Team Name', 'Status', 'Time'],
      [['1', '138', 'Cornell Univ', 'OK', '0.000']],
    );
    const page = parseLeaderboard(html, 'https://results.bajasae.net/Leaderboard.aspx?Event=TRAC');
    expect(page.data.rows[0]?.resultValue).toBeNull();
    expect(classifyResult(page.data.rows[0]?.resultValue ?? null, 'OK')).toBe('pending');
  });
});
