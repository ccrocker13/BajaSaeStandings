/**
 * Browser smoke test: loads every route in a real browser and fails if any of
 * them renders nothing.
 *
 * This exists because unit tests and a green build did not catch a blank site.
 * Type checking, 39 passing tests and a successful deploy are all compatible
 * with a page that renders an empty document, and only actually opening it
 * catches that.
 *
 * The last check is the important one: it blocks the JavaScript bundle and
 * asserts the page still paints a background and explains itself. A page with
 * no background of its own falls through to the browser's canvas, which in
 * dark mode is black — which is exactly what a visitor reported seeing.
 *
 * Usage: pnpm run smoke   (expects `vite preview` on :4173)
 */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.SMOKE_BASE ?? 'http://localhost:4173/bajasaestandings';

/**
 * Some environments ship a pre-installed Chromium at a fixed path and block the
 * download Playwright would otherwise do; CI installs it in Playwright's own
 * default location. Point at the former only when it is actually there, so the
 * same script runs in both.
 */
const preinstalled = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const launchOptions = existsSync(preinstalled) ? { executablePath: preinstalled } : {};
const browser = await chromium.launch(launchOptions);
let failures = 0;

// 1. Every route renders real content with no page errors.
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
for (const [name, path] of [['live','/live'],['season','/season'],['history','/history'],['teams','/teams'],['team','/team/rit']]) {
  errs.length = 0;
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const txt = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g,' ').trim();
  const stuck = txt.includes('If this message stays on screen');
  const ok = txt.length > 60 && !stuck && errs.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(7)} len=${String(txt.length).padStart(6)} bootStuck=${stuck} errs=${errs.length}`);
  if (errs.length) console.log('      ' + errs[0]);
}

// 2. Bundle blocked entirely -> readable boot message on a painted background,
//    never a black void. This is the failure the user actually saw.
const p2 = await browser.newPage({ viewport: { width: 900, height: 500 }, colorScheme: 'dark' });
await p2.route('**/assets/*.js', r => r.abort());
await p2.goto(base + '/live', { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(700);
const bg = await p2.evaluate(() => getComputedStyle(document.body).backgroundColor);
const txt2 = (await p2.evaluate(() => document.body.innerText)).replace(/\s+/g,' ').trim();
const painted = bg !== 'rgba(0, 0, 0, 0)';
const explains = txt2.includes('failed to start');
console.log(`${painted && explains ? 'PASS' : 'FAIL'} no-JS   bg=${bg} explains=${explains}`);
if (!(painted && explains)) failures++;

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
