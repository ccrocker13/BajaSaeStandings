import { Link } from 'react-router-dom';
import { useSummary } from '../lib/data.js';
import award from '../../data/schmidt-award.json';
import { Badge, Empty, SectionTitle } from '../components/ui.js';

interface Winner {
  year: number;
  school: string;
  schoolId: string;
  confidence: 'confirmed' | 'unverified';
  source: string;
  note?: string;
}

const WINNERS: Winner[] = (award as { winners: Winner[] }).winners;
const UNKNOWN: number[] = (award as { unknownYears: number[] }).unknownYears;

export default function History() {
  const { data: summary, error, loading } = useSummary();

  const byYear = new Map(WINNERS.map((w) => [w.year, w]));
  const seasons = summary?.seasons ?? [];
  const computedByYear = new Map(seasons.map((s) => [s.year, s.champion]));

  const years = [...new Set([...WINNERS.map((w) => w.year), ...UNKNOWN, ...seasons.map((s) => s.year)])]
    .sort((a, b) => b - a);

  // Count only wins we are confident in, so the tally is not built on guesses.
  const tally = new Map<string, { school: string; schoolId: string; n: number }>();
  for (const w of WINNERS) {
    if (w.confidence !== 'confirmed') continue;
    const t = tally.get(w.schoolId) ?? { school: w.school, schoolId: w.schoolId, n: 0 };
    t.n += 1;
    tally.set(w.schoolId, t);
  }
  const leaderboard = [...tally.values()].sort((a, b) => b.n - a.n);

  if (loading) return <Empty title="Loading history…" />;
  if (error) return <Empty title="Could not load season index.">{error}</Empty>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mike Schmidt Memorial Iron Team Award</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-400">
          Awarded since 2001 to the team with the highest cumulative score across the three North American
          Baja SAE events in a season. It is named for Mike Schmidt, a founding member of the revived RIT
          Baja team, who was killed in a car accident in 2001.
        </p>
      </div>

      <div>
        <SectionTitle hint="Confirmed wins only">Most titles</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {leaderboard.map((t) => (
            <Link key={t.schoolId} to={`/team/${t.schoolId}`} className="card px-3 py-2 text-sm hover:border-ink-700">
              <span className="font-medium">{t.school}</span>
              <span className="nums ml-2 text-ink-400">×{t.n}</span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle hint="Computed standings come from SAE's own archive; award winners come from third-party reporting">
          Season by season
        </SectionTitle>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem]">
              <thead>
                <tr>
                  <th className="th w-20">Season</th>
                  <th className="th">Award winner (reported)</th>
                  <th className="th">Top of computed standings</th>
                  <th className="th w-28">Source</th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => {
                  const w = byYear.get(year);
                  const computed = computedByYear.get(year);
                  const season = seasons.find((s) => s.year === year);
                  // Flag rather than hide a disagreement between the reported
                  // winner and what the archive actually adds up to.
                  const disagrees =
                    w && computed && w.schoolId !== computed.schoolId;

                  return (
                    <tr key={year} className="row">
                      <td className="td">
                        {season ? (
                          <Link to={`/season/${year}`} className="nums font-medium hover:text-accent">{year}</Link>
                        ) : (
                          <span className="nums text-ink-400">{year}</span>
                        )}
                      </td>
                      <td className="td">
                        {w ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Link to={`/team/${w.schoolId}`} className="font-medium hover:text-accent">{w.school}</Link>
                            {w.confidence === 'unverified' && <Badge tone="amber">unverified</Badge>}
                            {w.note && <span className="text-xs text-ink-500">{w.note}</span>}
                          </span>
                        ) : (
                          <span className="text-ink-600">not recorded</span>
                        )}
                      </td>
                      <td className="td">
                        {computed ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Link to={`/team/${computed.schoolId}`} className="hover:text-accent">{computed.school}</Link>
                            <span className="nums text-xs text-ink-500">{computed.totalPoints.toFixed(2)}</span>
                            {disagrees && <Badge tone="amber">differs</Badge>}
                          </span>
                        ) : (
                          <span className="text-ink-600">no archive data</span>
                        )}
                      </td>
                      <td className="td">
                        {w && (
                          <a href={w.source} target="_blank" rel="noreferrer noopener"
                             className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-300">
                            reference
                          </a>
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
        Rows marked <span className="text-flag-amber">unverified</span> come from a single third-party source
        and have not been checked against SAE's own award records. Where the reported winner differs from the
        top of the computed standings, both are shown — the computed figure sums each season's archived
        competitions and can legitimately differ if a season ran an irregular schedule. Corrections are
        welcome via an issue or pull request against <code className="text-ink-400">data/schmidt-award.json</code>.
      </p>
    </div>
  );
}
