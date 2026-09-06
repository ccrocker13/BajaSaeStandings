/**
 * Season data access.
 *
 * Fetched rather than bundled. Inlining every season put a megabyte of JSON
 * into the JavaScript, which is the wrong trade for people reading this at a
 * track on poor signal — as separate files these are cacheable, compressible,
 * and only the season actually being viewed is downloaded.
 */
import { useEffect, useState } from 'react';
import type { Season } from '@baja/parser';

export interface TeamSeason {
  year: number;
  rank: number;
  totalPoints: number;
  eventsAttended: number;
  results: { name: string; points: number | null }[];
}

export interface SummaryTeam {
  schoolId: string;
  school: string;
  teamName: string | null;
  seasons: TeamSeason[];
}

export interface Summary {
  generatedAt: string;
  seasons: {
    year: number;
    competitions: { id: string | null; name: string }[];
    teamCount: number;
    /** Top three by cumulative points — the Mike Schmidt Award podium. */
    podium: {
      rank: number;
      schoolId: string;
      school: string;
      teamName: string | null;
      totalPoints: number;
      eventsAttended: number;
    }[];
  }[];
  teams: SummaryTeam[];
}

const base = import.meta.env.BASE_URL;

/** Module-level caches so navigating between pages refetches nothing. */
const cache = new Map<string, Promise<unknown>>();

function loadJson<T>(path: string): Promise<T> {
  const existing = cache.get(path);
  if (existing) return existing as Promise<T>;
  const promise = fetch(`${base}${path}`).then((res) => {
    if (!res.ok) throw new Error(`could not load ${path} (${res.status})`);
    return res.json() as Promise<T>;
  });
  // Do not cache a rejection: a failed load should be retried on remount
  // rather than poisoning the page for the rest of the session.
  promise.catch(() => cache.delete(path));
  cache.set(path, promise);
  return promise;
}

export const loadSummary = () => loadJson<Summary>('data/summary.json');
export const loadSeason = (year: number) => loadJson<Season>(`data/seasons/${year}.json`);

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

function useAsync<T>(factory: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null, loading: true });
    factory().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (err: Error) => !cancelled && setState({ data: null, error: err.message, loading: false }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const useSummary = () => useAsync(loadSummary, []);
export const useSeason = (year: number) => useAsync(() => loadSeason(year), [year]);

export function teamFrom(summary: Summary, schoolId: string): SummaryTeam | undefined {
  return summary.teams.find((t) => t.schoolId === schoolId);
}
