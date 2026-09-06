/**
 * Confirms a deployed Cloudflare Worker is actually serving usable live data.
 *
 * Run this straight after `wrangler deploy`, before wiring the URL into the
 * site. "It deployed" and "it works" are different claims, and the difference
 * matters most on a race weekend when there is no time to debug.
 *
 *   node tools/verify/worker.mjs https://baja-standings-api.<you>.workers.dev
 */
const url = (process.argv[2] ?? '').replace(/\/$/, '');
if (!url) {
  console.error('Usage: node tools/verify/worker.mjs <worker-url>');
  process.exit(2);
}

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  const health = await fetch(`${url}/health`);
  check(health.ok, '/health responds', `HTTP ${health.status}`);

  const started = Date.now();
  const res = await fetch(`${url}/live`);
  const ms = Date.now() - started;
  check(res.ok, '/live responds', `HTTP ${res.status} in ${ms}ms`);

  // Without this the browser cannot read the response at all, which is the
  // entire reason the Worker exists.
  const cors = res.headers.get('access-control-allow-origin');
  check(cors === '*', 'CORS header present', cors ?? 'missing');

  const cache = res.headers.get('cache-control') ?? '';
  check(/max-age=\d+/.test(cache), 'Cache-Control set', cache || 'missing');

  const body = await res.json();
  check(typeof body === 'object' && body !== null, 'payload is JSON');
  check(Array.isArray(body.events), 'events array present', `${body.events?.length ?? 0} events`);
  check(Array.isArray(body.overall), 'overall standings present', `${body.overall?.length ?? 0} teams`);
  check(typeof body.disclaimer === 'string', 'estimate disclaimer present');

  console.log('');
  console.log(`  competition : ${body.competition ?? '(none reported)'}`);
  console.log(`  location    : ${body.siteLocation ?? '—'}`);
  console.log(`  upstream    : ${body.siteLastUpdate ?? '—'}`);
  if (body.endurance?.raceFlag) console.log(`  race flag   : ${body.endurance.raceFlag}`);
  if (body.overall?.length) {
    console.log('  leader      : ' +
      `${body.overall[0].school} — ${body.overall[0].points.toFixed(2)} pts (estimated)`);
  }
  if (body.warnings?.length) {
    console.log(`\n  ${body.warnings.length} parser warning(s):`);
    for (const w of body.warnings.slice(0, 5)) console.log(`    · ${w}`);
  }

  // Between competitions the results site has no live grids, so an empty feed
  // is correct rather than broken. Say so instead of implying a failure.
  if (!body.overall?.length) {
    console.log('\n  No standings in the feed. That is expected outside a competition —');
    console.log('  the results site only publishes grids while an event is running.');
  }
} catch (err) {
  check(false, 'request failed', err.message);
}

console.log(failures === 0 ? '\nWorker looks healthy.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
