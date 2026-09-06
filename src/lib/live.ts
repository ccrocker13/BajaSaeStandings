/**
 * Live feed client.
 *
 * Reads the Cloudflare Worker, which is the only component able to fetch
 * results.bajasae.net from a browser context — that origin sends no CORS
 * headers, so the page cannot call it directly.
 *
 * Polling is deliberately considerate of both the phone and the server:
 * it pauses entirely while the tab is hidden, and backs off exponentially
 * when the feed errors instead of hammering a struggling upstream. People read
 * this standing at a track with bad signal, so a stale-but-labelled payload is
 * kept on screen rather than replaced by an error.
 */
import { useEffect, useRef, useState } from 'react';

export interface LiveRow {
  position: number | null;
  carNumber: number | null;
  school: string;
  schoolId: string;
  teamName: string | null;
  status: string | null;
  raw: string | null;
  points: number | null;
  estimated: boolean;
}

export interface LiveEvent {
  code: string;
  label: string;
  kind: 'static' | 'dynamic' | 'endurance' | null;
  officialPoints: boolean;
  rows: LiveRow[];
}

export interface LiveOverall {
  school: string;
  schoolId: string;
  teamName: string | null;
  carNumber: number | null;
  points: number;
  scored: number;
  rank: number;
}

export interface LivePayload {
  competition: string | null;
  siteLocation: string | null;
  siteLastUpdate: string | null;
  fetchedAt: string;
  endurance: {
    lastDataUpdate: string | null;
    raceTime: string | null;
    raceFlag: string | null;
    leaderName: string | null;
    leaderLaps: string | null;
    leaderMargin: string | null;
    bestLapBy: string | null;
    bestLapTime: string | null;
  } | null;
  events: LiveEvent[];
  overall: LiveOverall[];
  warnings: string[];
  disclaimer: string;
}

/** Set at build time; empty until the Worker is deployed. */
const WORKER_URL = (import.meta.env.VITE_WORKER_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/**
 * Fallback feed, published by the live-poll workflow. Slower than the Worker —
 * raw.githubusercontent caches for a few minutes — but it means race weekend
 * does not hinge on a single component.
 */
const FALLBACK_URL =
  'https://raw.githubusercontent.com/ccrocker13/BajaSaeStandings/live-feed/live.json';

const SOURCES = [WORKER_URL ? `${WORKER_URL}/live` : null, FALLBACK_URL].filter(
  (u): u is string => u !== null,
);

const BASE_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 120_000;

export type LiveState = {
  data: LivePayload | null;
  error: string | null;
  /** Time of the last successful fetch, for the freshness badge. */
  updatedAt: number | null;
  configured: boolean;
  loading: boolean;
  /** Which feed answered, so the UI can say when it is on the slower one. */
  source: 'worker' | 'fallback' | null;
};

export function useLive(): LiveState {
  const [state, setState] = useState<LiveState>({
    data: null,
    error: null,
    updatedAt: null,
    configured: SOURCES.length > 0,
    loading: SOURCES.length > 0,
    source: null,
  });
  const failures = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (SOURCES.length === 0) return;
    let cancelled = false;

    const schedule = (ms: number) => {
      if (cancelled) return;
      timer.current = window.setTimeout(tick, ms);
    };

    const tick = async () => {
      if (cancelled) return;
      // Nothing to show while hidden; check back when the tab returns.
      if (document.hidden) return schedule(BASE_INTERVAL_MS);

      // Try each feed in turn; the Worker first when it is configured.
      let lastError = 'no feed available';
      for (const [i, url] of SOURCES.entries()) {
        try {
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`feed returned ${res.status}`);
          const data = (await res.json()) as LivePayload;
          if (cancelled) return;
          failures.current = 0;
          setState({
            data,
            error: null,
            updatedAt: Date.now(),
            configured: true,
            loading: false,
            source: WORKER_URL && i === 0 ? 'worker' : 'fallback',
          });
          return schedule(BASE_INTERVAL_MS);
        } catch (err) {
          lastError = (err as Error).message;
        }
      }

      if (cancelled) return;
      failures.current += 1;
      // Keep the last good payload on screen; the freshness badge shows its age.
      setState((prev) => ({ ...prev, error: lastError, loading: false }));
      schedule(Math.min(BASE_INTERVAL_MS * 2 ** failures.current, MAX_BACKOFF_MS));
    };

    const onVisible = () => {
      if (document.hidden) return;
      if (timer.current) window.clearTimeout(timer.current);
      void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    void tick();

    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return state;
}

export const LIVE_CONFIGURED = SOURCES.length > 0;
