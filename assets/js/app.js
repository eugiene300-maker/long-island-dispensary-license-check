/* License lookup + directory (homepage only). Data: /data/licenses.json, refreshed weekly
   from the NY Office of Cannabis Management open-data API. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const input = $('#q'), list = $('#suggest'), form = $('#search-form'), scopeSel = $('#scope');
  const out = $('#result'), dirGrid = $('#dir-grid'), townsEl = $('#towns');
  const SPONSOR_LICENSE = 'OCM-CAURD-24-000069';
  const OCM_VERIFY = 'https://cannabis.ny.gov/dispensary-location-verification';
  let DATA = [], active = -1, current = [];

  const STOP = new Set(['llc', 'inc', 'corp', 'corporation', 'co', 'company', 'the', 'dispensary', 'dispensaries', 'cannabis', 'weed', 'ny', 'new', 'york', 'of', 'and', 'ltd', 'store', 'shop']);
  const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const toks = (s) => norm(s).split(' ').filter((t) => t && !STOP.has(t));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (iso) => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null);

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  }

  function index(rec) {
    rec._name = norm(rec.name); rec._nameT = toks(rec.name + ' ' + (rec.dba || ''));
    rec._entT = toks(rec.entity); rec._locT = toks([rec.address, rec.city, rec.zip].join(' '));
    rec._lic = norm(rec.license).replace(/ /g, '');
    return rec;
  }

  function score(rec, q) {
    const nq = norm(q); if (!nq) return 0;
    const qt = toks(q); const qc = nq.replace(/ /g, '');
    if (rec._lic && qc.length >= 4 && rec._lic.includes(qc)) return 95;
    if (rec._name === nq) return 100;
    if (rec._name.startsWith(nq)) return 85;
    if (!qt.length) return 0;
    let s = 0;
    const hit = (pool, t) => pool.some((p) => p.startsWith(t)) ? 1 : (t.length >= 4 && pool.some((p) => lev(p.slice(0, t.length + 1), t) <= 1 || lev(p, t) <= 1)) ? 0.6 : 0;
    const nameHits = qt.map((t) => hit(rec._nameT, t)), entHits = qt.map((t) => hit(rec._entT, t)), locHits = qt.map((t) => hit(rec._locT, t));
    const all = qt.map((t, i) => Math.max(nameHits[i], entHits[i] * 0.9, locHits[i] * 0.7));
    if (all.every((v) => v > 0)) s = 40 + 35 * (all.reduce((a, b) => a + b, 0) / qt.length) + 10 * (nameHits.reduce((a, b) => a + b, 0) / qt.length);
    else if (all.some((v) => v >= 1) && qt.length > 1) s = 20 * (all.filter((v) => v > 0).length / qt.length);
    return s;
  }

  function search(q) {
    const scope = scopeSel ? scopeSel.value : 'all';
    return DATA.filter((r) => scope === 'all' || r.county.toLowerCase() === scope)
      .map((r) => ({ r, s: score(r, q) })).filter((x) => x.s >= 30)
      .sort((a, b) => b.s - a.s || rank(a.r) - rank(b.r)).slice(0, 8).map((x) => x.r);
  }
  const rank = (x) => (x.status === 'Active' && x.operational === 'Active' ? 0 : x.status === 'Active' ? 1 : x.status === 'In-Process' ? 2 : 3);

  function statusOf(r) {
    if (r.status === 'Active' && r.medical) return { cls: 'ok', pill: 'pill-ok', short: 'Licensed · Medical', title: 'Licensed medical dispensary', text: `Holds an active New York Registered Organization license (medical cannabis).` };
    if (r.status === 'Active' && r.operational === 'Active' && r.storefront) return { cls: 'ok', pill: 'pill-ok', short: 'Licensed · Open', title: 'Licensed & open', text: `Holds an active New York State cannabis license and is listed as open to the public.` };
    if (r.status === 'Active' && r.operational === 'Active') return { cls: 'ok', pill: 'pill-ok', short: 'Licensed', title: 'Licensed operator', text: `Holds an active license (${r.type}). This license type may not include a retail storefront.` };
    if (r.status === 'Active') return { cls: 'info', pill: 'pill-info', short: 'Licensed · Not open yet', title: 'Licensed — not yet open', text: `Holds an active license, but New York lists this location as not yet operating. It should not be selling cannabis to the public yet.` };
    if (r.status === 'In-Process') return { cls: 'warn', pill: 'pill-warn', short: 'Application pending', title: 'Not licensed yet — application in process', text: `New York shows a license application in process for this business. It is not yet authorized to sell cannabis.` };
    return { cls: 'bad', pill: 'pill-bad', short: 'License inactive', title: 'License inactive', text: `This license is listed as inactive by the Office of Cannabis Management. The business is not currently authorized to sell cannabis.` };
  }

  const ICON = {
    ok: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    info: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/></svg>',
    warn: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
    bad: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  };

  function hl(text, q) {
    const t = esc(text); const qt = toks(q).sort((a, b) => b.length - a.length);
    if (!qt.length) return t;
    return t.replace(new RegExp('\\b(' + qt.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig'), '<mark>$1</mark>');
  }

  function renderSuggest(q) {
    current = search(q); active = -1;
    if (!q.trim()) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    list.innerHTML = current.length ? current.map((r, i) => {
      const st = statusOf(r);
      return `<li role="option" id="opt-${i}" data-i="${i}" aria-selected="false"><div><div class="s-name">${hl(r.name, q)}</div><div class="s-sub">${esc([r.address, r.city].filter(Boolean).join(', ') || r.county + ' County')}${r.dba && r.entity && norm(r.dba) !== norm(r.entity) ? ' · ' + esc(r.entity) : ''}</div></div><span class="pill ${st.pill}">${st.short}</span></li>`;
    }).join('') : `<li class="s-empty">No Long Island match yet — press <b>Enter</b> to search all of New York.</li>`;
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
  }

  function hoursList(h) {
    if (!h) return '';
    return `<details class="res-hours"><summary>Hours on file with OCM</summary><ul>${h.split(';').map((x) => `<li>${esc(x.trim())}</li>`).join('')}</ul></details>`;
  }

  function sponsorStrip() {
    return `<div class="res-note" style="margin:0 0 1.2rem;padding:.7rem 1rem;background:var(--g50);border-radius:12px;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;color:var(--ink2)">
      <span class="pill pill-spon">Sponsored</span><span><b style="color:var(--g800)">Dispensary of the Week:</b> Planet Nugg, Farmingdale — 4.9★ on Google, licensed (OCM-CAURD-24-000069).</span>
      <a href="#dispensary-of-the-week" style="font-weight:600">See details →</a></div>`;
  }

  function showRecord(r, fromQuery) {
    const st = statusOf(r);
    const mapQ = encodeURIComponent([r.address, r.city, 'NY', r.zip].filter(Boolean).join(', '));
    const rows = [
      ['License number', r.license || 'Not issued yet'],
      ['License type', r.type],
      ['Business name', r.dba || r.name],
      ['Legal entity', r.entity],
      ['Address', r.address ? `${r.address}, ${r.city}, NY ${r.zip || ''}` : `${r.county} County (no public storefront address on file)`],
      ['Opened to public', fmt(r.opened) || (r.status === 'Active' && r.operational === 'Active' ? 'Date not reported' : 'Not open yet')],
      ['License issued', fmt(r.issued) || '—'],
      ['License expires', fmt(r.expires) || '—'],
    ];
    if (r.ownership) rows.push(['Social equity category', r.ownership]);
    out.innerHTML = `${r.license !== SPONSOR_LICENSE ? sponsorStrip() : ''}
      <div class="res-head"><div class="res-status"><div class="res-icon ${st.cls}">${ICON[st.cls]}</div><div><h2>${esc(r.name)}</h2><p><b>${st.title}.</b> ${st.text}</p></div></div>
      <span class="pill ${st.pill}" style="font-size:.8rem;padding:.45rem .9rem">${st.short}</span></div>
      <dl class="res-grid">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${hoursList(r.hours)}
      <div class="res-actions">
        ${r.address ? `<a class="btn btn-primary" href="https://www.google.com/maps/search/?api=1&query=${mapQ}" target="_blank" rel="noopener">Get directions</a>` : ''}
        <a class="btn btn-light" href="${OCM_VERIFY}" target="_blank" rel="noopener">Verify with NY OCM</a>
        <button class="btn btn-light" type="button" data-copy>Copy link to this result</button>
      </div>
      <p class="res-note">Source: New York State Office of Cannabis Management, Current OCM Licenses dataset. Checked <!-- -->${esc(window.__checked || '')}. Confirm in person too: every licensed dispensary must post OCM’s Dispensary Verification Tool (a sign with a QR code) near its main entrance.</p>`;
    out.hidden = false;
    const url = new URL(location.href); url.searchParams.set('check', r.id); url.searchParams.delete('q'); history.replaceState(null, '', url);
    out.querySelector('[data-copy]').addEventListener('click', (e) => { navigator.clipboard?.writeText(location.href); e.target.textContent = 'Link copied ✓'; });
    list.hidden = true;
    if (!fromQuery) out.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function showNoMatch(q) {
    out.innerHTML = `${sponsorStrip()}
      <div class="res-head"><div class="res-status"><div class="res-icon bad">${ICON.bad}</div><div><h2>No license found on Long Island for “${esc(q)}”</h2>
      <p>We couldn't find an active or pending New York cannabis license under that name in Nassau or Suffolk County.</p></div></div></div>
      <div class="prose" style="max-width:none"><p><b>That doesn't automatically mean the shop is illegal</b> — some stores trade under a name that differs from the one on their license. Try searching the street address, the town, or the business's legal name. If you still can't find it, treat the shop as <b>unverified</b> and check the official <a href="${OCM_VERIFY}" target="_blank" rel="noopener">OCM dispensary verification tool</a> before you buy.</p></div>
      <div id="statewide" class="res-note">Searching the rest of New York State…</div>`;
    out.hidden = false; list.hidden = true;
    out.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const url = new URL(location.href); url.searchParams.set('q', q); url.searchParams.delete('check'); history.replaceState(null, '', url);
    const box = $('#statewide');
    try {
      const safe = q.toUpperCase().replace(/[^A-Z0-9 &-]/g, '').trim().slice(0, 60);
      if (safe.length < 3) { box.textContent = ''; return; }
      const where = `(upper(dba) like '%${safe}%' OR upper(entity_name) like '%${safe}%') AND license_type like '%Dispensary%'`;
      const rows = await fetch('https://data.ny.gov/resource/jskf-tt3q.json?$select=license_number,dba,entity_name,city,county,license_status,operational_status&$limit=6&$where=' + encodeURIComponent(where)).then((r) => r.json());
      if (!Array.isArray(rows) || !rows.length) { box.innerHTML = 'No matching dispensary license anywhere in New York State either.'; return; }
      box.innerHTML = `<b>Found elsewhere in New York (not on Long Island):</b><ul style="margin:.5rem 0 0;padding-left:1.1rem">${rows.map((x) => `<li>${esc(x.dba || x.entity_name)} — ${esc(x.city || x.county)} · ${esc(x.license_number || 'application pending')} · ${esc(x.license_status)}</li>`).join('')}</ul>`;
    } catch (e) { box.innerHTML = `Couldn't reach the statewide database right now — check the <a href="${OCM_VERIFY}" target="_blank" rel="noopener">OCM verification tool</a>.`; }
  }

  function submit(q) {
    q = (q ?? input.value).trim(); if (!q) { input.focus(); return; }
    const res = active >= 0 ? [current[active]] : search(q);
    if (res.length) showRecord(res[0]); else showNoMatch(q);
  }

  // ---- directory ----
  function renderDirectory(town) {
    const open = DATA.filter((r) => r.status === 'Active' && r.operational === 'Active' && r.storefront && !r.medical)
      .sort((a, b) => (b.license === SPONSOR_LICENSE) - (a.license === SPONSOR_LICENSE) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    const shown = town ? open.filter((r) => r.city === town) : open;
    dirGrid.innerHTML = shown.map((r) => `
      <article class="dir-card${r.license === SPONSOR_LICENSE ? ' is-sponsor' : ''}" data-id="${esc(r.id)}" tabindex="0">
        <div class="dir-top"><h3>${esc(r.name)}</h3>${r.license === SPONSOR_LICENSE ? '<span class="pill pill-spon">Dispensary of the Week</span>' : '<span class="pill pill-ok">Licensed · Open</span>'}</div>
        <p class="dir-addr">${esc(r.address)}, ${esc(r.city)}, NY ${esc(r.zip)}</p>
        <dl class="dir-meta"><div><dt>License</dt><dd>${esc(r.license)}</dd></div><div><dt>Opened</dt><dd>${esc(fmt(r.opened)?.replace(/ \d+,/, '') || '—')}</dd></div></dl>
      </article>`).join('');
    if (townsEl && !townsEl.dataset.ready) {
      const towns = [...new Set(open.map((r) => r.city))].sort();
      townsEl.innerHTML = `<button class="town" aria-pressed="true" data-town="">All towns (${open.length})</button>` + towns.map((t) => `<button class="town" aria-pressed="false" data-town="${esc(t)}">${esc(t)}</button>`).join('');
      townsEl.dataset.ready = '1';
      townsEl.addEventListener('click', (e) => {
        const b = e.target.closest('.town'); if (!b) return;
        townsEl.querySelectorAll('.town').forEach((x) => x.setAttribute('aria-pressed', x === b));
        renderDirectory(b.dataset.town);
      });
    }
  }
  dirGrid?.addEventListener('click', (e) => { const c = e.target.closest('.dir-card'); if (c) { const r = DATA.find((x) => x.id === c.dataset.id); if (r) { input.value = r.name; showRecord(r); } } });
  dirGrid?.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.click(); });

  // ---- events ----
  input.addEventListener('input', () => renderSuggest(input.value));
  input.addEventListener('focus', () => input.value && renderSuggest(input.value));
  input.addEventListener('keydown', (e) => {
    const n = current.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); active = (active + 1) % n; }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); active = (active - 1 + n) % n; }
    else if (e.key === 'Escape') { list.hidden = true; return; }
    else return;
    list.querySelectorAll('li[role=option]').forEach((li, i) => li.setAttribute('aria-selected', i === active));
    input.setAttribute('aria-activedescendant', 'opt-' + active);
  });
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); const r = current[+li.dataset.i]; input.value = r.name; showRecord(r); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) list.hidden = true; });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  scopeSel?.addEventListener('change', () => input.value && renderSuggest(input.value));
  document.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.try; submit(b.dataset.try); }));

  // ---- load ----
  (window.__LICENSES ? Promise.resolve(window.__LICENSES) : fetch('data/licenses.json', { cache: 'no-cache' }).then((r) => r.json())).then((j) => {
    DATA = j.licenses.map(index);
    window.__checked = new Date(j.checkedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    renderDirectory('');
    const p = new URLSearchParams(location.search);
    if (p.get('check')) { const r = DATA.find((x) => x.id === p.get('check')); if (r) { input.value = r.name; showRecord(r, true); } }
    else if (p.get('q')) { input.value = p.get('q'); submit(p.get('q')); }
  }).catch(() => { /* baked static directory stays visible */ });
})();
