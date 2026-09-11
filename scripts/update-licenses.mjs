// Refreshes data/licenses.json from the official NY Office of Cannabis Management
// "Current OCM Licenses" dataset (data.ny.gov, id jskf-tt3q), then re-bakes the
// static directory + "last updated" stamps into index.html and sitemap.xml.
// Run: node scripts/update-licenses.mjs            (live fetch)
//      node scripts/update-licenses.mjs --from raw.json   (offline, from a saved API response)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATASET = 'jskf-tt3q';
const COUNTIES = ['Nassau', 'Suffolk'];
const TYPES = [
  'Adult-Use Conditional Retail Dispensary License',
  'Adult-Use Retail Dispensary License',
  'Adult-Use Microbusiness License',
  'Registered Organization',
  'Adult-Use Registered Organization Dispensary License',
];
const TYPE_SHORT = {
  'Adult-Use Conditional Retail Dispensary License': 'CAURD (Conditional Adult-Use Retail Dispensary)',
  'Adult-Use Retail Dispensary License': 'Adult-Use Retail Dispensary',
  'Adult-Use Microbusiness License': 'Adult-Use Microbusiness',
  'Registered Organization': 'Registered Organization (Medical)',
  'Adult-Use Registered Organization Dispensary License': 'Registered Organization Dispensary (ROD)',
};

const SMALL = new Set(['of', 'and', 'the', 'at', 'by', 'in', 'on', '&']);
const WORDS = new Set(['the','high','life','new','york','farm','farms','leaf','bud','buds','nugg','club','shop','main','road','park','east','west','top','co','one','stop','gold','zen','big','bay','cann','hub','den','bliss','blue','sea','deep','star','stars','weed','boss','lab','labs','care','green','grow','city']);
function pretty(s) {
  if (!s) return '';
  s = s.trim().replace(/\s+/g, ' ');
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters && letters !== letters.toUpperCase()) return s; // already mixed case
  return s.toLowerCase().split(' ').map((w, i) =>
    (i && SMALL.has(w)) ? w : /^(llc|inc\.?|ny|nyc|ii|iii|usa)$/.test(w) || ((/^[a-z]{2,3}$/.test(w) || /^[^aeiou]{2,5}$/.test(w)) && !WORDS.has(w)) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}
const d = (v) => (v ? v.slice(0, 10) : null);

function transform(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = (r.license_number || r.application_number || r.entity_name) + '|' + (r.address_line_1 || r.county);
    if (seen.has(key)) continue;
    seen.add(key);
    const medical = /Registered Organization/.test(r.license_type);
    out.push({
      id: (r.license_number || r.application_number || r.location_id || r.entity_name).replace(/[^A-Za-z0-9-]/g, ''),
      license: r.license_number || null,
      type: TYPE_SHORT[r.license_type] || r.license_type,
      typeFull: r.license_type,
      status: r.license_status,              // Active | In-Process | Inactive
      operational: r.operational_status,     // Active | Non-Operational
      name: r.dba ? pretty(r.dba) : pretty(r.entity_name).replace(/,?\s+(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?)$/i, ''),
      dba: r.dba ? pretty(r.dba) : null,
      entity: r.entity_name,
      address: [r.address_line_1, r.address_line_2].filter(Boolean).join(', ') || null,
      city: r.city ? pretty(r.city) : null,
      zip: r.zip_code || null,
      county: r.county,
      issued: d(r.issued_date),
      expires: d(r.expiration_date),
      opened: d(r.retail_date_opened_to_public),
      hours: r.hours_of_operation || null,
      website: r.business_website || null,
      ownership: r.see_category || null,
      medical,
      storefront: !!r.address_line_1,
    });
  }
  // open stores first, then licensed, then pending; alpha within
  const rank = (x) => (x.status === 'Active' && x.operational === 'Active' ? 0 : x.status === 'Active' ? 1 : x.status === 'In-Process' ? 2 : 3);
  out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (iso) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';

function bakeDirectory(list) {
  const open = list.filter((x) => x.status === 'Active' && x.operational === 'Active' && x.storefront && !x.medical);
  return open.map((x) => `
        <article class="dir-card" data-town="${esc(x.city)}">
          <div class="dir-top"><h3>${esc(x.name)}</h3><span class="pill pill-ok">Licensed · Open</span></div>
          <p class="dir-addr">${esc(x.address)}, ${esc(x.city)}, NY ${esc(x.zip)}</p>
          <dl class="dir-meta"><div><dt>License</dt><dd>${esc(x.license)}</dd></div><div><dt>Opened</dt><dd>${fmt(x.opened)}</dd></div></dl>
        </article>`).join('') + '\n        ';
}

function replaceBetween(html, tag, content) {
  const re = new RegExp(`(<!-- ${tag}:START -->)[\\s\\S]*?(<!-- ${tag}:END -->)`, 'g');
  return html.replace(re, `$1${content}$2`);
}

async function main() {
  let rows, sourceUpdated;
  const fromIdx = process.argv.indexOf('--from');
  if (fromIdx > -1) {
    const raw = JSON.parse(await readFile(process.argv[fromIdx + 1], 'utf8'));
    rows = raw.rows; sourceUpdated = raw.meta?.rowsUpdatedAt;
  } else {
    const soql = `SELECT * WHERE county in (${COUNTIES.map((c) => `'${c}'`).join(',')}) AND license_type in (${TYPES.map((t) => `'${t}'`).join(',')}) ORDER BY license_number LIMIT 5000`;
    const res = await fetch(`https://data.ny.gov/resource/${DATASET}.json?$query=${encodeURIComponent(soql)}`);
    if (!res.ok) throw new Error('OCM API ' + res.status);
    rows = await res.json();
    const meta = await fetch(`https://data.ny.gov/api/views/${DATASET}.json`).then((r) => r.json()).catch(() => ({}));
    sourceUpdated = meta.rowsUpdatedAt;
  }
  if (!Array.isArray(rows) || rows.length < 10) throw new Error('Suspiciously small result — aborting so the live site keeps its last good data.');

  const list = transform(rows);
  const now = new Date().toISOString();
  const srcDate = sourceUpdated ? new Date(sourceUpdated * 1000).toISOString() : null;
  const stats = {
    open: list.filter((x) => x.status === 'Active' && x.operational === 'Active' && x.storefront && !x.medical).length,
    licensedNotOpen: list.filter((x) => x.status === 'Active' && x.operational !== 'Active' && !x.medical && x.storefront).length,
    inProcess: list.filter((x) => x.status === 'In-Process').length,
    total: list.length,
  };
  const payload = {
    source: 'NY Office of Cannabis Management — Current OCM Licenses (data.ny.gov/d/jskf-tt3q)',
    region: 'Long Island (Nassau & Suffolk counties)', checkedAt: now, sourceUpdatedAt: srcDate, stats, licenses: list,
  };
  await writeFile(path.join(ROOT, 'data/licenses.json'), JSON.stringify(payload, null, 1));
  // same data as a script so the page also works when opened straight from disk (file://)
  await writeFile(path.join(ROOT, 'data/licenses.js'), 'window.__LICENSES=' + JSON.stringify(payload) + ';\n');

  const idxPath = path.join(ROOT, 'index.html');
  let html = await readFile(idxPath, 'utf8');
  const niceDate = new Date(now).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  html = replaceBetween(html, 'DIRECTORY', bakeDirectory(list));
  html = replaceBetween(html, 'UPDATED', niceDate);
  const towns = [...new Set(list.filter((x) => x.status === 'Active' && x.operational === 'Active' && x.storefront && !x.medical).map((x) => x.city))].sort();
  html = replaceBetween(html, 'TOWNS', `<li>${towns.map(esc).join(' · ')}</li>`);
  html = replaceBetween(html, 'STAT_OPEN', String(stats.open));
  html = replaceBetween(html, 'STAT_LICENSED', String(stats.licensedNotOpen));
  html = replaceBetween(html, 'STAT_PENDING', String(stats.inProcess));
  html = html.replace(/"dateModified": "[^"]*"/g, `"dateModified": "${now.slice(0, 10)}"`);
  await writeFile(idxPath, html);

  const smPath = path.join(ROOT, 'sitemap.xml');
  let sm = await readFile(smPath, 'utf8').catch(() => null);
  if (sm) await writeFile(smPath, sm.replace(/(<loc>[^<]*\/<\/loc>\s*<lastmod>)[^<]*/, `$1${now.slice(0, 10)}`));

  console.log(`OK: ${list.length} records (${stats.open} open, ${stats.licensedNotOpen} licensed not open, ${stats.inProcess} in process)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
