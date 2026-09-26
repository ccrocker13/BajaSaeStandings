import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLive, LIVE_CONFIGURED, type LiveRow } from '../lib/live.js';
import { Badge, Empty, Medal, Points, SectionTitle } from '../components/ui.js';

const FOLLOW_KEY = 'baja.followedTeams';

function useFollowed() {
  const [followed, setFollowed] = useState<string[]>(() => {
    // Browser storage can throw outright in private modes; a decorative
    // preference must never take the page down with it.
    try {
      return JSON.parse(localStorage.getItem(FOLLOW_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const toggle = (schoolId: string) => {
    setFollowed((prev) => {
      const next = prev.includes(schoolId) ? prev.filter((s) => s !== schoolId) : [...prev, schoolId];
      try {
        localStorage.setItem(FOLLOW_KEY, JSON.stringify(next));
      } catch {
        /* not worth surfacing */
      }
      return next;
    });
  };
  return { followed, toggle };
}

/**
 * "updated 12s ago", going amber then red as the data ages.
 *
 * Ages from when the feed last read the results site, not from when we last
 * downloaded the feed. Those are the same number only while the feed is being
 * written. If the poller stops, the browser goes on fetching the last file it
 * published, every download succeeds, and a badge counting downloads would sit
 * at "3s ago" over standings that stopped hours earlier — the one failure this
 * badge exists to make visible.
 */
function Freshness({
  fetchedAt,
  error,
}: {
  fetchedAt: string | null;
  error: string | null;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const at = fetchedAt ? Date.parse(fetchedAt) : NaN;
  if (!Number.isFinite(at)) return <Badge tone="neutral">connecting…</Badge>;
  // A viewer's clock can sit ahead of the runner's; never report a negative age.
  const age = Math.max(0, Math.round((Date.now() - at) / 1000));
  const tone = error || age > 120 ? 'red' : age > 45 ? 'amber' : 'green';
  const label = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;
  return (
    <Badge tone={tone}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      updated {label}
      {error && ' · retrying'}
    </Badge>
  );
}

function flagTone(flag: string | null | undefined) {
  const f = (flag ?? '').toLowerCase();
  if (f.includes('green')) return 'green' as const;
  if (f.includes('red')) return 'red' as const;
  if (f.includes('yellow') || f.includes('caution')) return 'amber' as const;
  return 'neutral' as const;
}

export default function Live() {
  const { data, error, loading, source } = useLive();
  const [tab, setTab] = useState<string>('OVR');
  const { followed, toggle } = useFollowed();

  // Remember the previous ordering so a car that gains places can be flashed.
  const previousRanks = useRef<Map<string, number>>(new Map());
  const movedUp = useRef<Set<string>>(new Set());

  const overall = data?.overall ?? [];
  useEffect(() => {
    if (!overall.length) return;
    const next = new Map<string, number>();
    const gained = new Set<string>();
    for (const row of overall) {
      const prev = previousRanks.current.get(row.schoolId);
      if (prev !== undefined && row.rank < prev) gained.add(row.schoolId);
      next.set(row.schoolId, row.rank);
    }
    previousRanks.current = next;
    movedUp.current = gained;
  }, [overall]);

  const events = data?.events ?? [];
  const active = useMemo(() => events.find((e) => e.code === tab), [events, tab]);

  if (!LIVE_CONFIGURED) {
    return (
      <Empty title="Live feed not connected yet">
        <p>
          The live leaderboard needs the Cloudflare Worker deployed — it is the piece that can read
          results.bajasae.net from a browser, since that site sends no CORS headers. Setup is one
          command and is documented in the repository README.
        </p>
        <p className="mt-3">
          Everything historical works without it: <Link className="text-accent underline underline-offset-2" to="/history">browse past seasons</Link>.
        </p>
      </Empty>
    );
  }

  if (loading && !data) return <Empty title="Loading live results…" />;
  if (!data) {
    return (
      <Empty title="Live feed unavailable">
        <p>{error ?? 'The results feed could not be reached.'} Retrying automatically.</p>
      </Empty>
    );
  }

  const sortRows = (rows: LiveRow[]) => {
    const pinned = rows.filter((r) => followed.includes(r.schoolId));
    const rest = rows.filter((r) => !followed.includes(r.schoolId));
    return [...pinned, ...rest];
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{data.competition ?? 'Current competition'}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {data.siteLocation}
            {data.siteLastUpdate && <span className="ml-2 text-ink-500">· source updated {data.siteLastUpdate}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.endurance?.raceFlag && (
            <Badge tone={flagTone(data.endurance.raceFlag)}>{data.endurance.raceFlag} flag</Badge>
          )}
          {source === 'fallback' && (
            <Badge tone="amber" >backup feed · slower</Badge>
          )}
          <Freshness fetchedAt={data.fetchedAt} error={error} />
        </div>
      </div>

      {data.endurance && (data.endurance.raceTime || data.endurance.leaderName) && (
        <div className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Race time', data.endurance.raceTime],
            ['Leader', data.endurance.leaderName],
            ['Leader laps', data.endurance.leaderLaps],
            ['Best lap', data.endurance.bestLapTime && `${data.endurance.bestLapTime}${data.endurance.bestLapBy ? ` · ${data.endurance.bestLapBy}` : ''}`],
          ].map(([label, value]) =>
            value ? (
              <div key={label as string}>
                <p className="text-[11px] uppercase tracking-wider text-ink-500">{label}</p>
                <p className="nums mt-0.5 truncate text-sm font-medium" title={String(value)}>{value}</p>
              </div>
            ) : null,
          )}
        </div>
      )}

      {data.warnings.length > 0 && (
        <details className="card px-3 py-2 text-xs text-ink-400">
          <summary className="cursor-pointer">
            {data.warnings.length} parser warning{data.warnings.length > 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-1">
            {data.warnings.map((w, i) => <li key={i}>· {w}</li>)}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-1">
        <button onClick={() => setTab('OVR')} className={`tab ${tab === 'OVR' ? 'tab-active' : ''}`}>
          Overall
        </button>
        {events.map((e) => (
          <button key={e.code} onClick={() => setTab(e.code)} className={`tab ${tab === e.code ? 'tab-active' : ''}`}>
            {e.label}
          </button>
        ))}
      </div>

      {tab === 'OVR' ? (
        <>
          <SectionTitle hint="Events shows results settled, +N still to come. Static events use published points; everything else is computed here">
            Overall standings
          </SectionTitle>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem]">
                <thead>
                  <tr>
                    <th className="th w-14">#</th>
                    <th className="th w-16">Car</th>
                    <th className="th">Team</th>
                    <th className="th w-28 text-right">Events</th>
                    <th className="th w-32 text-right">Points</th>
                    <th className="th w-12" />
                  </tr>
                </thead>
                <tbody>
                  {sortRows(overall as unknown as LiveRow[]).map((r) => {
                    const row = r as unknown as (typeof overall)[number];
                    const isFollowed = followed.includes(row.schoolId);
                    return (
                      <tr
                        key={row.schoolId}
                        className={`row ${movedUp.current.has(row.schoolId) ? 'flash-up' : ''} ${isFollowed ? 'bg-accent/5' : ''}`}
                      >
                        <td className="td"><Medal rank={row.rank} /></td>
                        <td className="td nums text-ink-400">{row.carNumber ?? '—'}</td>
                        <td className="td">
                          <Link to={`/team/${row.schoolId}`} className="hover:text-accent">
                            <span className="font-medium">{row.school}</span>
                            {row.teamName && <span className="ml-2 text-xs text-ink-400">{row.teamName}</span>}
                          </Link>
                        </td>
                        <td className="td nums text-right text-ink-400">
                          {/*
                            Mid-competition the totals are not comparable on
                            their own: a team on five events and a team on three
                            are not in the same race. Showing both counts is the
                            difference between a standing and a misleading one.
                          */}
                          <span title={`${row.scored} settled, ${row.pending} still to come`}>
                            {row.scored}
                            {row.pending > 0 && (
                              <span className="text-ink-600">{` +${row.pending}`}</span>
                            )}
                          </span>
                        </td>
                        <td className="td text-right font-semibold"><Points value={row.points} estimated /></td>
                        <td className="td text-right">
                          <button
                            onClick={() => toggle(row.schoolId)}
                            aria-pressed={isFollowed}
                            aria-label={isFollowed ? `Unfollow ${row.school}` : `Follow ${row.school}`}
                            className={`rounded px-1.5 py-0.5 text-xs ${isFollowed ? 'text-accent' : 'text-ink-600 hover:text-ink-300'}`}
                          >
                            {isFollowed ? '★' : '☆'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-ink-500">{data.disclaimer}</p>
        </>
      ) : active ? (
        <>
          <SectionTitle
            hint={active.officialPoints ? 'Points published by SAE' : 'Points computed from published times'}
          >
            {active.label}
          </SectionTitle>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem]">
                <thead>
                  <tr>
                    <th className="th w-14">#</th>
                    <th className="th w-16">Car</th>
                    <th className="th">Team</th>
                    <th className="th w-28">Status</th>
                    <th className="th w-40 text-right">Result</th>
                    <th className="th w-28 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {sortRows(active.rows).map((row, i) => (
                    <tr
                      key={`${row.carNumber}-${row.schoolId}-${i}`}
                      className={`row ${followed.includes(row.schoolId) ? 'bg-accent/5' : ''}`}
                    >
                      <td className="td"><Medal rank={row.position ?? i + 1} /></td>
                      <td className="td nums text-ink-400">{row.carNumber ?? '—'}</td>
                      <td className="td">
                        <Link to={`/team/${row.schoolId}`} className="hover:text-accent">
                          <span className="font-medium">{row.school}</span>
                          {row.teamName && <span className="ml-2 text-xs text-ink-400">{row.teamName}</span>}
                        </Link>
                      </td>
                      <td className="td text-xs text-ink-400">
                        {/*
                          The site's own status cell reads "OK" for an entry
                          that has not run yet, so state is what actually says
                          whether this line is a result or a blank.
                        */}
                        {row.state === 'pending'
                          ? 'To run'
                          : row.state === 'zero'
                            ? (row.status ?? 'No score')
                            : (row.status ?? '—')}
                      </td>
                      <td className="td nums text-right text-ink-300">{row.raw ?? '—'}</td>
                      <td className="td text-right">
                        {row.state === 'pending' ? (
                          <span className="text-ink-600">—</span>
                        ) : (
                          <Points value={row.points} estimated={row.estimated} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <Empty title="No data for this event yet." />
      )}
    </div>
  );
}
