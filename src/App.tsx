import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Live from './routes/Live.js';
import SeasonPage from './routes/Season.js';
import History from './routes/History.js';
import Teams from './routes/Teams.js';
import Team from './routes/Team.js';

const NAV = [
  { to: '/live', label: 'Live' },
  { to: '/season', label: 'Season' },
  { to: '/history', label: 'History' },
  { to: '/teams', label: 'Teams' },
];

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/live" className="flex items-baseline gap-2">
            <span className="text-base font-bold tracking-tight">Baja SAE</span>
            <span className="text-base font-light tracking-tight text-ink-400">Standings</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/live" replace />} />
          <Route path="/live" element={<Live />} />
          <Route path="/season" element={<SeasonPage />} />
          <Route path="/season/:year" element={<SeasonPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/team/:schoolId" element={<Team />} />
          <Route path="*" element={<Navigate to="/live" replace />} />
        </Routes>
      </main>

      <footer className="border-t border-ink-800 px-4 py-6 text-xs leading-relaxed text-ink-500">
        <div className="mx-auto max-w-6xl space-y-1">
          <p>
            Unofficial and community-run. Results are read from{' '}
            <a className="text-ink-400 underline underline-offset-2 hover:text-ink-300" href="https://results.bajasae.net/">
              results.bajasae.net
            </a>{' '}
            and{' '}
            <a className="text-ink-400 underline underline-offset-2 hover:text-ink-300" href="https://www.bajasae.net/res/ResultsLanding.aspx">
              bajasae.net
            </a>
            . Official SAE results always supersede anything shown here.
          </p>
          <p>
            Values marked <span className="text-accent">~</span> are computed by this site rather than published by SAE.
            Baja SAE is a trademark of SAE International; this project is not affiliated with or endorsed by SAE.
          </p>
        </div>
      </footer>
    </div>
  );
}
