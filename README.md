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

### 1. GitHub Pages

The deploy workflow enables Pages itself and points it at GitHub Actions, so
normally there is nothing to do — push to `main` and the site publishes to
`https://ccrocker13.github.io/bajasaestandings/`.

If the URL returns *"There isn't a GitHub Pages site here"*, Pages is not
serving. Set it by hand at **Settings → Pages → Build and deployment →
Source: GitHub Actions**, then re-run the **Deploy site** workflow.

Note that a green deploy job does not by itself prove the site is up:
`deploy-pages` will create a deployment even when nothing is serving it. Run
the **Probe published site** workflow to see what the URL actually returns —
it reports the status, the body, and whether the served HTML is the built
bundle or something else.

### 2. Deploy the Cloudflare Worker — optional, needed for live scoring

A browser cannot call `results.bajasae.net` directly: it sends no CORS headers.
The Worker fetches and parses on the site's behalf, and caches so upstream sees
one request no matter how many people are watching.

This needs a browser for the login step, so it has to be run by you.

**1. Log in.** From the repository root:

```bash
cd worker
npx wrangler login
```

A browser tab opens asking you to authorise Wrangler. A free Cloudflare account
is enough — no card, no paid plan. Expect `Successfully logged in.`

**2. Deploy.**

```bash
npx wrangler deploy
```

Expect output ending in something like:

```
Uploaded baja-standings-api (1.2 sec)
Published baja-standings-api (0.5 sec)
  https://baja-standings-api.<your-subdomain>.workers.dev
```

Copy that URL.

**3. Check it actually works** — deploying and working are different claims:

```bash
cd ..
pnpm run verify:worker https://baja-standings-api.<your-subdomain>.workers.dev
```

It checks `/health` and `/live`, asserts the CORS and cache headers, and prints
the competition name and current leader. Outside a competition the standings
will be empty; the script says so rather than reporting a failure, because the
results site only publishes grids while an event is running.

**4. Wire it into the site.** Repository **Settings → Secrets and variables →
Actions → Variables → New repository variable**:

- Name: `VITE_WORKER_URL`
- Value: the `https://...workers.dev` URL, no trailing slash

A *variable*, not a secret — it is baked into a public build and is not
sensitive, and secrets are not readable by the build in the way this needs.

**5. Rebuild.** Actions → **Deploy site** → *Run workflow*, or just push to
`main`. The Live tab stops saying it is not connected.

Without the Worker the live tab explains that it is not connected; everything
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

# Loads every route in a real browser and fails if any renders nothing.
# Expects `npx vite preview --port 4173` to be running.
pnpm run smoke
```

`pnpm run smoke` exists because a green type check, passing unit tests and a
successful deploy are all compatible with a page that renders an empty
document — which is exactly what shipped once. It gates CI and the deploy job,
so a blank build cannot reach production.

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
is badged as unverified in the UI. Where a runner-up or third place is known it
is recorded too, including for 2003, whose winner is still unidentified.

**Six seasons have no winner on record: 2003, 2004, 2006, 2007, 2008 and 2011.**
They are deliberately blank rather than inferred. The `researchNotes` block in
that file records what has already been ruled out — RIT won exactly three times,
Cornell only in 2014 and 2025, and Michigan Tech's 2009 win was its first — so
nobody has to repeat that search, and it names the sources most likely to close
the remaining gaps.

A team's own records, banners or newsletters are likely a better source than any
amount of searching. Corrections and additions are very welcome — open an issue
or a pull request against that file.

## Disclaimer

Not affiliated with or endorsed by SAE International. Baja SAE is a trademark of
SAE International.
