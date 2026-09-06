import { type ReactNode } from 'react';

export function Medal({ rank }: { rank: number }) {
  // Rank is never conveyed by colour alone — the number is always present and
  // the medal tint is an additional cue, not the signal itself.
  const tint =
    rank === 1 ? 'text-gold' : rank === 2 ? 'text-silver' : rank === 3 ? 'text-bronze' : 'text-ink-400';
  return <span className={`nums font-semibold ${tint}`}>{rank}</span>;
}

export function Points({ value, estimated = false }: { value: number | null; estimated?: boolean }) {
  if (value === null) {
    // A dash, not a zero: "has not run" and "scored nothing" are different.
    return <span className="text-ink-600" title="No score recorded">—</span>;
  }
  return (
    <span className={`nums ${estimated ? 'text-ink-300' : ''}`}>
      {value.toFixed(2)}
      {estimated && <span className="ml-0.5 align-super text-[9px] text-accent" title="Computed by this site, not published by SAE">~</span>}
    </span>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'amber' | 'red' | 'accent'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-ink-800 text-ink-300',
    green: 'bg-flag-green/15 text-flag-green',
    amber: 'bg-flag-amber/15 text-flag-amber',
    red: 'bg-flag-red/15 text-flag-red',
    accent: 'bg-accent/15 text-accent',
  } as const;
  return <span className={`pill ${tones[tone]}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <p className="text-base font-medium text-ink-300">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-prose text-sm text-ink-400">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {hint && <p className="text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
