import { Link, useParams } from 'react-router-dom';
import { SEASONS, SEASON_BY_YEAR } from '../lib/data.js';
import { useLive } from '../lib/live.js';
import { Badge, Empty, Medal, Points, SectionTitle } from '../components/ui.js';

/** Three North American events decide the Mike Schmidt Memorial Iron Team Award. */
const EVENTS_PER_SEASON = 3;
const MAX_POINTS_PER_EVENT = 1000;

export default function SeasonPage() {
  const { year } = useParams();
  const season = SEASON_BY_YEAR.get(Number(year));
  const live = useLive();

  if (!season) return <Empty title={`No data for ${year}.`} />;

  const isCurrent = season.year === SEASONS[0]?.year;
  const raced = season.competitions.length;
  const remaining = Math.max(0, EVENTS_PER_SEASON - raced);

  // While a competition is running, fold its computed running total into the
  // season to show the championship as it actually stands right now. This is
  // the number the official site cannot show, and the reason the site exists.
  const liveByTeam = new Map(live.data?.overall.map((o) => [o.schoolId, o]) ?? []);
  const projecting = isCurrent && liveByTeam.size > 0;

  const rows = season.standings
    .map((s) => {
      const liveEntry = projecting ? liveByTeam.get(s.schoolId) : undefined;
      return {
        ...s,
        livePoints: liveEntry?.points ?? null,
        projected: s.totalPoints + (liveEntry?.points ?? 0),
      };
    })
    .sort((a, b) => b.projected - a.projected);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{season.year} season</h1>
          {isCurrent && <Badge tone="accent">Current</Badge>}
          {projecting && <Badge tone="green">Live projection</Badge>}
        </div>
        <p className="mt-1.5 max-w-prose text-sm text-ink-400">
          Cumulative points across the season's competitions — the race for the{' '}
          <strong className="font-medium text-ink-300">Mike Schmidt Memorial Iron Team Award</strong>, given to the team
          with the highest combined score at the three North American events.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {season.competitions.map((c) => (
          <Badge key={c.id ?? c.name}>{c.name}</Badge>
        ))}
        {remaining > 0 && (
          <Badge tone="amber">
            {remaining} event{remaining > 1 ? 's' : ''} still to run · up to {(remaining * MAX_POINTS_PER_EVENT).toLocaleString()} points available
          </Badge>
        )}
      </div>

      {projecting && (
        <p className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-ink-300">
          Includes the in-progress competition, scored by this site from published times and lap counts.
          SAE does not publish live points, so those figures are estimates until official results are posted.
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem]">
            <thead>
              <tr>
                <th className="th w-14">#</th>
                <th className="th">Team</th>
                {season.competitions.map((c) => (
                  <th key={c.id ?? c.name} className="th text-right">{c.name.replace('Baja SAE ', '')}</th>
                ))}
                {projecting && <th className="th text-right text-accent">Live</th>}
                <th className="th text-right">Total</th>
                <th className="th w-16 text-right">Events</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.schoolId} className="row">
                  <td className="td"><Medal rank={i + 1} /></td>
                  <td className="td">
                    <Link to={`/team/${s.schoolId}`} className="hover:text-accent">
                      <span className="font-medium">{s.school}</span>
                      {s.teamName && <span className="ml-2 text-xs text-ink-400">{s.teamName}</span>}
                    </Link>
                  </td>
                  {season.competitions.map((c) => {
                    const r = s.results.find((x) => x.competitionId === c.id);
                    return (
                      <td key={c.id ?? c.name} className="td text-right">
                        <Points value={r?.points ?? null} />
                      </td>
                    );
                  })}
                  {projecting && (
                    <td className="td text-right">
                      <Points value={s.livePoints} estimated />
                    </td>
                  )}
                  <td className="td text-right font-semibold">
                    <Points value={s.projected} estimated={projecting && s.livePoints !== null} />
                  </td>
                  <td className="td text-right text-ink-400">
                    {/* Surfaced because a team on two events is not "behind" a
                        team on three in the same sense. */}
                    <span className="nums">{s.eventsAttended}</span>
                    <span className="text-ink-600">/{Math.max(raced, EVENTS_PER_SEASON)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SectionTitle hint="Jump to another season">Other seasons</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {SEASONS.map((s) => (
          <Link
            key={s.year}
            to={`/season/${s.year}`}
            className={`tab ${s.year === season.year ? 'tab-active' : ''}`}
          >
            {s.year}
          </Link>
        ))}
      </div>
    </div>
  );
}
