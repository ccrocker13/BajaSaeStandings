/**
 * Produce a compact structural digest of a captured HTML page.
 *
 * The upstream pages are ASP.NET WebForms, so the raw HTML is dominated by
 * __VIEWSTATE blobs that tell us nothing. This strips the noise and reports
 * only what a parser author needs: table shapes, element ids, nav links, and
 * whether the page is postback-driven.
 *
 * Usage: node outline.mjs <input.html> <sourceUrl>
 */
import { readFileSync } from 'node:fs';
import { parse } from 'node-html-parser';

const [, , file, sourceUrl] = process.argv;
const html = readFileSync(file, 'utf8');
const out = [];
const say = (s = '') => out.push(s);

say(`SOURCE: ${sourceUrl}`);
say(`BYTES: ${html.length}`);

// robots.txt and other non-HTML land here too; just echo them.
if (!/<html/i.test(html)) {
  say('NOT HTML — verbatim content follows:');
  say(html.slice(0, 4000));
  console.log(out.join('\n'));
  process.exit(0);
}

const root = parse(html, { blockTextElements: { script: false, style: false } });
const text = (el) => (el?.text ?? '').replace(/\s+/g, ' ').trim();

say(`TITLE: ${text(root.querySelector('title'))}`);

const refresh = root.querySelector('meta[http-equiv="refresh" i]');
say(`META REFRESH: ${refresh ? refresh.getAttribute('content') : 'none'}`);

// --- postback / VIEWSTATE detection -----------------------------------
const viewstate = root.querySelector('#__VIEWSTATE');
const eventTarget = root.querySelector('#__EVENTTARGET');
say(`__VIEWSTATE: ${viewstate ? `present (${(viewstate.getAttribute('value') || '').length} chars)` : 'absent'}`);
say(`__EVENTTARGET: ${eventTarget ? 'present' : 'absent'}`);
say(`__doPostBack refs: ${(html.match(/__doPostBack/g) || []).length}`);
for (const form of root.querySelectorAll('form')) {
  say(`FORM: id=${form.getAttribute('id')} method=${form.getAttribute('method')} action=${form.getAttribute('action')}`);
}

// --- tables: the payload ----------------------------------------------
const tables = root.querySelectorAll('table');
say(`\nTABLES: ${tables.length}`);
tables.forEach((t, i) => {
  const rows = t.querySelectorAll('tr');
  if (rows.length === 0) return;
  const cellsOf = (r) => r.querySelectorAll('th,td').map(text);
  say(`\n--- table[${i}] id=${t.getAttribute('id') || '-'} class=${t.getAttribute('class') || '-'} rows=${rows.length}`);
  // A layout table (WebForms uses many) has 1-2 cells; a data grid has many.
  const widths = rows.slice(0, 20).map((r) => r.querySelectorAll('th,td').length);
  say(`    col counts (first 20 rows): ${widths.join(',')}`);
  rows.slice(0, 4).forEach((r, ri) => {
    const c = cellsOf(r);
    if (c.length) say(`    row[${ri}]: ${JSON.stringify(c).slice(0, 600)}`);
  });
  // Links inside the first data row reveal drill-down URL shapes.
  const firstLink = t.querySelector('a[href]');
  if (firstLink) say(`    sample cell link: ${firstLink.getAttribute('href')}`);
});

// --- ids and classes, which is what selectors will key off -------------
const ids = [...new Set(root.querySelectorAll('[id]').map((e) => e.getAttribute('id')))]
  .filter((id) => !id.startsWith('__'));
say(`\nELEMENT IDS (${ids.length}): ${ids.slice(0, 120).join(', ')}`);

const classes = [...new Set(root.querySelectorAll('[class]').flatMap((e) => (e.getAttribute('class') || '').split(/\s+/)))]
  .filter(Boolean);
say(`\nCLASSES (${classes.length}): ${classes.slice(0, 120).join(', ')}`);

// --- navigation links: how we discover event codes ---------------------
const links = [...new Set(root.querySelectorAll('a[href]').map((a) => `${text(a)} -> ${a.getAttribute('href')}`))];
say(`\nLINKS (${links.length}):`);
links.slice(0, 150).forEach((l) => say(`  ${l.slice(0, 220)}`));

// --- selects: year/event pickers on archive pages ----------------------
for (const sel of root.querySelectorAll('select')) {
  const opts = sel.querySelectorAll('option').map((o) => `${o.getAttribute('value')}=${text(o)}`);
  say(`\nSELECT id=${sel.getAttribute('id')} name=${sel.getAttribute('name')} options=${opts.length}`);
  opts.slice(0, 60).forEach((o) => say(`  ${o.slice(0, 160)}`));
}

// --- scripts: any XHR/JSON endpoint we could use instead of scraping ---
const scriptSrcs = root.querySelectorAll('script[src]').map((s) => s.getAttribute('src'));
say(`\nSCRIPT SRCS: ${scriptSrcs.join(', ')}`);
const endpointHints = [...new Set(html.match(/["'][^"']*\.(?:asmx|ashx|svc|json)(?:\/[A-Za-z0-9_]+)?["']/g) || [])];
say(`ENDPOINT HINTS: ${endpointHints.slice(0, 40).join(', ') || 'none'}`);
const ajaxHints = [...new Set(html.match(/(?:UpdatePanel|ScriptResource|PageMethods|\$\.ajax|XMLHttpRequest|setInterval)\w*/g) || [])];
say(`AJAX/REFRESH HINTS: ${ajaxHints.join(', ') || 'none'}`);

console.log(out.join('\n'));
