/**
 * Points scoring.
 *
 * Necessary because the live site publishes raw performance but not points:
 * dynamic events show a time, endurance shows laps, and there is no overall
 * leaderboard at all during a competition. Season standings for a *finished*
 * competition never need this — the archive publishes official points — so
 * everything here exists solely to drive the live projection.
 *
 * The models below were derived empirically by fitting published times against
 * published scores for Baja SAE Oregon 2026 and New York 2026, then checked to
 * agree to within display rounding on both. They are reverse-engineered, not
 * quoted from the rulebook, so anything computed with them is labelled an
 * estimate in the UI. Official results always supersede them.
 */
import type { EventCode } from './types.js';

/** Best score attainable in a dynamic event by the observed formulas. */
export const DYNAMIC_MAX = 70;
export const ENDURANCE_MAX = 400;

/**
 * How each dynamic event converts a time into points.
 *
 * `ratio`  — score = max * fastest / t.
 * `linear` — score = max * (T - t) / (T - fastest), where the reference time
 *            T is min(cutoffFactor * fastest, slowest time in the field).
 *            The cutoff is what makes the same event score differently at two
 *            competitions: at New York the field was slower than the cutoff so
 *            the slowest time governed, at Oregon the cutoff bound first.
 */
export type DynamicModel =
  | { kind: 'ratio' }
  | { kind: 'linear'; cutoffFactor: number };

export const DYNAMIC_MODELS: Record<EventCode, DynamicModel> = {
  ACCEL: { kind: 'linear', cutoffFactor: 1.5 },
  MANU: { kind: 'linear', cutoffFactor: 2.5 },
  // TRAC is Hill Climb; SPEC is Suspension & Traction.
  TRAC: { kind: 'ratio' },
  SPEC: { kind: 'ratio' },
};

/**
 * Score one dynamic event from the field's times.
 *
 * `times` should contain every entry that set a time, including slow ones —
 * the slowest time is part of the linear model's reference and dropping it
 * changes everyone's score.
 */
export function scoreDynamicEvent(
  code: EventCode,
  times: number[],
  max = DYNAMIC_MAX,
): Map<number, number> {
  const model = DYNAMIC_MODELS[code];
  const valid = times.filter((t) => Number.isFinite(t) && t > 0);
  const out = new Map<number, number>();
  if (!model || valid.length === 0) return out;

  const fastest = Math.min(...valid);
  const slowest = Math.max(...valid);

  for (const t of valid) {
    let score: number;
    if (model.kind === 'ratio') {
      score = max * (fastest / t);
    } else {
      const reference = Math.min(model.cutoffFactor * fastest, slowest);
      score = reference === fastest ? max : (max * (reference - t)) / (reference - fastest);
    }
    // A time past the cutoff scores nothing rather than going negative.
    out.set(t, Math.max(0, Math.min(max, score)));
  }
  return out;
}

/**
 * Endurance points from lap counts.
 *
 * Observed exactly at both 2026 competitions. The leader can finish a point or
 * two above the nominal 400 — a placement bonus this does not model, so the
 * top of the field may read a couple of points low.
 */
export function scoreEndurance(laps: number, leaderLaps: number, max = ENDURANCE_MAX): number {
  if (!Number.isFinite(laps) || laps <= 0 || leaderLaps <= 1) return 0;
  return Math.max(0, ((laps - 1) / (leaderLaps - 1)) * max);
}
