import { Link, useParams } from 'react-router-dom';
import { teamFrom, useSummary } from '../lib/data.js';
import award from '../../data/schmidt-award.json';
import { Badge, Empty, Medal, Points, SectionTitle } from '../components/ui.js';

const WINNERS = (award as { winners: { year: number; schoolId: string; confidence: string }[] }).winners;

export default function Team() {
  const { schoolId = '' } = useParams();
  const { data: summary, error, loading } = useSummary();

  if (loading) return <Empty title="Loading team…" />;
  if (error) return <Empty title="Could not load team data.">{error}</Empty>;

  const team = summary ? teamFrom(summary, schoolId) : undefined;
  const school = team?.school ?? schoolId;
  const teamName = team?.teamName ?? null;
  const rows = team?.seasons ?? [];

  if (rows.length === 0) {
    return (
      <Empty title="No recorded results for this team.">
        <Link className="text-accent underline underline-offset-2" to="/teams">Back to all teams</Link>
      </Empty>
    );
  }

  const titles = WINNERS.filter((w) => w.schoolId === schoolId);
  const bestRank = Math.min(...rows.map((r) => r.rank));
  const bestSeason = rows.find((r) => r.rank === bestRank);
  // A season-best trend line, drawn from ranks so lower is better.
  const worstRank = Math.max(...rows.map((r) => r.rank), 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{school}</h1>
        {teamName && <p className="mt-1 text-sm text-ink-400">{teamName}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {titles.length > 0 && (
            <Badge tone="accent">
              {titles.length} Iron Team title{titles.length > 1 ? 's' : ''} ·{' '}
              {titles.map((t) => t.year).sort().join(', ')}
            </Badge>
          )}
          <Badge>Best season finish: {bestRank}{bestSeason ? ` (${bestSeason.year})` : ''}</Badge>
          <Badge>{rows.length} seasons on record</Badge>
        </div>
        {titles.some((t) => t.confidence !== 'confirmed') && (
          <p className="mt-2 text-xs text-ink-500">
            Some titles listed here come from a single third-party source and are marked unverified on the{' '}
            <Link to="/history" className="underline underline-offset-2 hover:text-ink-300">history page</Link>.
          </p>
        )}
      </div>

      <div>
        <SectionTitle hint="Season finishing position, lower is better">Form</SectionTitle>
        <div className="card p-4">
          <svg viewBox={`0 0 ${Math.max(rows.length * 60, 120)} 120`} className="h-32 w-full" role="img"
               aria-label={`Season finishing positions for ${school}`}>
            {[...rows].reverse().map((r, i, arr) => {
              const x = i * 60 + 30;
              const y = 15 + ((r.rank - 1) / Math.max(worstRank - 1, 1)) * 85;
              const next = arr[i + 1];
              return (
                <g key={r.year}>
                  {next && (
                    <line
                      x1={x} y1={y}
                      x2={(i + 1) * 60 + 30}
                      y2={15 + ((next.rank - 1) / Math.max(worstRank - 1, 1)) * 85}
                      stroke="#4da3ff" strokeWidth="1.5" opacity="0.5"
                    />
                  )}
                  <circle cx={x} cy={y} r="4" fill="#4da3ff" />
                  <text x={x} y={y - 10} textAnchor="middle" className="fill-ink-300 text-[10px]">{r.rank}</text>
                  <text x={x} y="114" textAnchor="middle" className="fill-ink-500 text-[10px]">{r.year}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div>
        <SectionTitle>Season results</SectionTitle>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr>
                  <th className="th w-20">Season</th>
                  <th className="th w-20">Finish</th>
                  <th className="th">Competitions</th>
                  <th className="th w-32 text-right">Season points</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.year} className="row">
                    <td className="td">
                      <Link to={`/season/${r.year}`} className="nums font-medium hover:text-accent">{r.year}</Link>
                    </td>
                    <td className="td"><Medal rank={r.rank} /></td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1.5">
                        {r.results.map((res) => (
                          <span key={res.name}
                                className="rounded bg-ink-850 px-2 py-0.5 text-xs text-ink-300">
                            {res.name.replace('Baja SAE ', '')}
                            <span className="nums ml-1.5 text-ink-500">
                              {res.points === null ? '—' : res.points.toFixed(0)}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="td text-right font-semibold"><Points value={r.totalPoints} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
