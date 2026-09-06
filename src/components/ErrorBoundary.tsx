import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps one broken route from blanking the whole site.
 *
 * Without this, an exception anywhere in the tree unmounts everything and the
 * page renders as an empty document — indistinguishable, to a visitor, from the
 * site being down. Containing it means the header and navigation survive and
 * the other tabs remain usable.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Left in production deliberately: this is the only breadcrumb a visitor
    // can hand back when reporting a problem.
    console.error('Route failed to render:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card p-8 text-center">
        <p className="text-base font-medium text-ink-300">This page failed to load.</p>
        <p className="mx-auto mt-2 max-w-prose text-sm text-ink-400">
          The rest of the site still works — try another tab above. If it keeps happening,
          please{' '}
          <a
            className="text-accent underline underline-offset-2"
            href="https://github.com/ccrocker13/BajaSaeStandings/issues"
          >
            report it
          </a>
          .
        </p>
        <pre className="mx-auto mt-4 max-w-prose overflow-x-auto rounded bg-ink-950 p-3 text-left text-xs text-ink-500">
          {this.state.error.message}
        </pre>
      </div>
    );
  }
}
