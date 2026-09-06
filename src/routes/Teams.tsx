import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allTeams } from '../lib/data.js';
import { Medal } from '../components/ui.js';

export default function Teams() {
  const [query, setQuery] = useState('');
  const teams = useMemo(() => allTeams(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) => t.school.toLowerCase().includes(q) || (t.teamName ?? '').toLowerCase().includes(q),
    );
  }, [teams, query]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
        <p className="mt-1 text-sm text-ink-400">{teams.length} schools with a recorded result since 2016.</p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search schools or team names…"
        aria-label="Search teams"
        className="w-full max-w-md rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-sm
                   placeholder:text-ink-600 focus:border-accent focus:outline-none"
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem]">
            <thead>
              <tr>
                <th className="th">School</th>
                <th className="th">Team</th>
                <th className="th w-24 text-right">Seasons</th>
                <th className="th w-28 text-right">Best finish</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.schoolId} className="row">
                  <td className="td">
                    <Link to={`/team/${t.schoolId}`} className="font-medium hover:text-accent">{t.school}</Link>
                  </td>
                  <td className="td text-ink-400">{t.teamName ?? '—'}</td>
                  <td className="td nums text-right text-ink-400">{t.seasons}</td>
                  <td className="td text-right"><Medal rank={t.best} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length === 0 && <p className="text-sm text-ink-400">No teams match “{query}”.</p>}
    </div>
  );
}
