# Baja SAE Standings

Live scoring and season standings for the Baja SAE collegiate design series,
including the race for the **Mike Schmidt Memorial Iron Team Award**.

Unofficial and community-run. Official SAE results always supersede anything here.

## Why this exists

SAE publishes results, but not the thing teams most want to know mid-season:
who is winning the season-long championship. Worse, **the live results site
never publishes points at all** during a competition. Only the three static
events (design, cost, business) show scores; acceleration, hill climb,
maneuverability and suspension & traction show a raw *time*, endurance shows
*laps*, and `Leaderboard.aspx?Event=OVR` returns nothing.

So this project computes them.

## How the points are derived

The scoring models were reverse-engineered, not taken from the rulebook, which
is behind a login. For a *finished* competition the archive publishes both the
raw times and the official points, so the models were fitted against Baja SAE
Oregon 2026 and New York 2026 and are asserted in the test suite to reproduce
those published points:

| Event | Model | Agreement with official |
| --- | --- | --- |
| Hill Climb (`TRAC`) | `70 × fastest / t` | under a cent |
| Suspension & Traction (`SPEC`) | `70 × fastest / t` | under a cent |
| Acceleration (`ACCEL`) | linear to `min(1.5 × fastest, slowest)` | under a cent |
| Maneuverability (`MANU`) | linear to `min(2.5 × fastest, slowest)` | under a cent |
| Endurance (`ENDUR`) | `(laps − 1) / (leader laps − 1) × 400` | exact, ±2 for the leader's placement bonus |

The reference-time cutoff is why the same event scores differently at different
competitions: at New York the field was slower than the acceleration cutoff, so
the slowest time governed, while at Oregon the cutoff bound first.

Anything computed this way is labelled an estimate in the UI and marked with a
`~`. Completed seasons use SAE's published points and need none of this.

Two event codes are counterintuitive and worth knowing: **`TRAC` is Hill Climb**
(not traction) and **`SPEC` is Suspension & Traction** (not specifications). The
parser discovers codes from the site's own navigation rather than trusting a
hardcoded list.

## Setup

The site works as soon as Pages is enabled. The Worker is optional and only
affects the live tab.

### 1. Enable GitHub Pages — required

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

The `Deploy site` workflow then publishes on every push to `main`. The site
lands at `https://ccrocker13.github.io/bajasaestandings/`.

### 2. Deploy the Cloudflare Worker — optional, needed for live scoring

A browser cannot call `results.bajasae.net` directly: it sends no CORS headers.
The Worker fetches and parses on the site's behalf, and caches so that upstream
sees one request no matter how many people are watching.

```bash
cd worker
npx wrangler login      # free account, no card required
npx wrangler deploy
```

Copy the printed `https://baja-standings-api.<subdomain>.workers.dev` URL, then
add it in **Settings → Secrets and variables → Actions → Variables** as
`VITE_WORKER_URL`, and re-run the deploy workflow.

Without it the live tab explains that it is not connected; everything
historical works regardless.

### 3. Race weekend — optional backup

Run the **Live poll** workflow manually when a competition starts. It publishes
snapshots to the `live-feed` branch, which the site falls back to if the Worker
is unreachable. Slower than the Worker (raw.githubusercontent caches for a few
minutes) and clearly labelled as the backup feed in the UI.

## Repository layout

```
packages/parser/    HTML → JSON, scoring models, season aggregation
  fixtures/         real captured HTML; the parser's test corpus
worker/             Cloudflare Worker serving /live as JSON with CORS
src/                the site (Vite + React + Tailwind)
tools/capture/      fetches upstream HTML from a runner (see below)
tools/build-data/   archive backfill and the site's data payloads
tools/live-snapshot/ fallback poller
data/               committed season data and the award list
```

### About the fixtures

The development environment this was built in cannot reach `bajasae.net` at
all — its egress proxy returns 403. `capture-fixtures.yml` therefore fetches the
pages from a GitHub-hosted runner and commits the raw HTML, so parsers are
written against real markup rather than guesswork. Committing them also means an
upstream markup change fails a test loudly instead of silently rendering an
empty table.

To re-capture, edit `tools/capture/urls.tsv` and push.

## Development

```bash
pnpm install
pnpm test          # parser and scoring tests, against the committed fixtures
pnpm run build     # generates the site's data payloads, then builds
pnpm dev
```

## Politeness

`robots.txt` on both hosts contains no `Disallow` rules and declares no content
signals, so nothing prohibits fetching — but that is permission by omission
rather than an invitation, and the site sits behind Cloudflare. Requests are
therefore kept deliberately low: each page is refetched no more often than it
actually changes (endurance every 20s, dynamic events 60s, static events and the
root 300s), which is roughly 8 requests a minute at peak and under 2 otherwise,
regardless of how many people are watching. Every request carries a User-Agent
naming this project and linking here.

If SAE would prefer this not to run, open an issue and it stops.

## Contributing data

The Mike Schmidt Award winners in `data/schmidt-award.json` come from
third-party reporting; SAE's own award pages were unreachable when it was
compiled. Entries carry an explicit `confidence`, and anything not `confirmed`
is badged as unverified in the UI. Six seasons (2003, 2004, 2006–2008, 2011)
have no source at all yet.

Corrections and additions are very welcome — open an issue or a PR against that
file.

## Disclaimer

Not affiliated with or endorsed by SAE International. Baja SAE is a trademark of
SAE International.
