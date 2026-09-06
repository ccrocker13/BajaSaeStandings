import { Link } from 'react-router-dom';
import { useSummary } from '../lib/data.js';
import award from '../../data/schmidt-award.json';
import { Badge, Empty, Medal, SectionTitle } from '../components/ui.js';

/**
 * The award recognises the top three teams by cumulative points across a
 * season's three North American events. That definition is the whole design of
 * this page: the podium shown is computed from SAE's published results, and the
 * third-party reporting in schmidt-award.json is only used to corroborate it.
 */
interface Placing {
  year: number;
  place: number | null;
  school: string | null;
  schoolId: string | null;
  confidence: string;
  source: string;
  note?: string;
}

const PLACINGS: Placing[] = (award as { placings: Placing[] }).placings;

export default function History() {
  const { data: summary, error, loading } = useSummary();

  if (loading) return <Empty title="Loading history…" />;
  if (error) return <Empty title="Could not load season data.">{error}</Empty>;

  const seasons = summary?.seasons ?? [];

  // First places, counted from the computed standings rather than from award
  // claims. A team appearing in a source is not evidence it finished first.
  const firsts = new Map<string, { school: string; schoolId: string; n: number; years: number[] }>();
  const podiums = new Map<string, number>();
  for (const s of seasons) {
    s.podium.forEach((p) => {
      podiums.set(p.schoolId, (podiums.get(p.schoolId) ?? 0) + 1);
      if (p.rank !== 1) return;
      const t = firsts.get(p.schoolId) ?? { school: p.school, schoolId: p.schoolId, n: 0, years: [] };
      t.n += 1;
      t.years.push(s.year);
      firsts.set(p.schoolId, t);
    });
  }
  const leaderboard = [...firsts.values()].sort((a, b) => b.n - a.n || a.school.localeCompare(b.school));

  /** Reported placings for a season, for the corroboration column. */
  const reportedFor = (year: number) => PLACINGS.filter((p) => p.year === year && p.school);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mike Schmidt Memorial Iron Team Award</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-400">
          Awarded since 2001 to the <strong className="font-medium text-ink-300">top three teams</strong> by
          cumulative score across the three North American Baja SAE events in a season. It is named for Mike
          Schmidt, a founding member of the revived RIT Baja team, who was killed in a car accident in 2001.
        </p>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-500">
          The podiums below are computed from SAE's published results by total points, which is the award's
          own definition — so a team listed here in second or third received the award without winning it.
        </p>
      </div>

      <div>
        <SectionTitle hint="Counted from the computed standings, not from award claims">
          Most first places
        </SectionTitle>
        <div className="flex flex-wrap gap-2">
          {leaderboard.map((t) => (
            <Link key={t.schoolId} to={`/team/${t.schoolId}`} className="card px-3 py-2 text-sm hover:border-ink-700">
              <span className="font-medium">{t.school}</span>
              <span className="nums ml-2 text-ink-400">×{t.n}</span>
              <span className="nums ml-2 text-xs text-ink-600">{t.years.sort().join(' ')}</span>
            </Link>
          ))}
        </div>
        {leaderboard.length === 0 && <p className="text-sm text-ink-400">No season data loaded.</p>}
      </div>

      <div>
        <SectionTitle hint="Ranked by cumulative points across the season">Season podiums</SectionTitle>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem]">
              <thead>
                <tr>
                  <th className="th w-20">Season</th>
                  <th className="th">First</th>
                  <th className="th">Second</th>
                  <th className="th">Third</th>
                  <th className="th w-40">Reported</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => {
                  const reported = reportedFor(s.year);
                  const computedFirst = s.podium.find((p) => p.rank === 1);
                  const reportedFirst = reported.find((r) => r.place === 1);
                  const disagrees =
                    reportedFirst && computedFirst && reportedFirst.schoolId !== computedFirst.schoolId;
                  const agrees =
                    reportedFirst && computedFirst && reportedFirst.schoolId === computedFirst.schoolId;

                  return (
                    <tr key={s.year} className="row align-top">
                      <td className="td">
                        <Link to={`/season/${s.year}`} className="nums font-medium hover:text-accent">{s.year}</Link>
                        {s.podium.length === 0 && <div className="text-xs text-ink-600">no data</div>}
                      </td>
                      {[1, 2, 3].map((place) => {
                        const p = s.podium.find((x) => x.rank === place);
                        return (
                          <td key={place} className="td">
                            {p ? (
                              <span className="flex flex-wrap items-baseline gap-2">
                                <Medal rank={place} />
                                <Link to={`/team/${p.schoolId}`} className="font-medium hover:text-accent">
                                  {p.school}
                                </Link>
                                <span className="nums text-xs text-ink-500">{p.totalPoints.toFixed(2)}</span>
                              </span>
                            ) : (
                              <span className="text-ink-600">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="td">
                        {reported.length === 0 ? (
                          <span className="text-xs text-ink-600">no reporting</span>
                        ) : (
                          <div className="space-y-1">
                            {agrees && <Badge tone="green">corroborated</Badge>}
                            {disagrees && <Badge tone="amber">differs</Badge>}
                            {reported.map((r, i) => (
                              <div key={i} className="text-xs text-ink-500">
                                <a
                                  href={r.source}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="underline underline-offset-2 hover:text-ink-300"
                                >
                                  {r.place ? `${r.place}${['st', 'nd', 'rd'][r.place - 1]}` : 'placed'}
                                </a>{' '}
                                {r.school}
                                {r.confidence !== 'confirmed' && <span className="ml-1 text-flag-amber">?</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="max-w-prose text-xs leading-relaxed text-ink-500">
        The <span className="text-ink-400">Reported</span> column is third-party reporting, kept only to
        cross-check the computed podium — a <span className="text-flag-amber">?</span> marks a placing that
        rests on a single unverified source. Where the two agree the season is marked corroborated; 2014's
        computed podium matches its independently sourced one exactly. Podium counts come from the computed
        standings, so a team credited with the award in second or third place is not counted as a first.
        Corrections to the reported data are welcome against{' '}
        <code className="text-ink-400">data/schmidt-award.json</code>.
      </p>
    </div>
  );
}
