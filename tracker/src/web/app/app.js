// Lune Tracker : application du dashboard (JS natif, sans build).
// Navigation par hash (#/agence, #/clipper/12…), données via /api/*.

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONS = {
  funnel: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.7 2.6 3 5.2"/>',
  userPlus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M19 8v6M16 11h6"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M9 20h6M12 14v6"/>',
  pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  coins: '<circle cx="9" cy="9" r="5.5"/><path d="M13.5 13.5A5.5 5.5 0 1 0 20 15"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14.1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5.9z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 13a8 8 0 0 0 14.5 4.5L20 16M4 4v4h4M20 20v-4h-4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  message: '<path d="M4 5h16v11H8l-4 4z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  discord: '<path d="M8 17c-3 0-5-1-5-1 0-5 2-9 2-9s2-1.5 4-1.5l.5 1M16 17c3 0 5-1 5-1 0-5-2-9-2-9s-2-1.5-4-1.5l-.5 1M8 7.5c2.5-.7 5.5-.7 8 0M8 16c2.5 1 5.5 1 8 0"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;

const DAY = 86_400_000;

function fmtK(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  const one = (x) => x.toFixed(1).replace('.', ',').replace(',0', '');
  if (a >= 1e6) return `${one(n / 1e6)} M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)} k`;
  if (a >= 1e3) return `${one(n / 1e3)} k`;
  return String(Math.round(n));
}
const euro = (x) => (x ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: x % 1 ? 2 : 0 });
const dm = (t) => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const dateLong = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
};

function deltaPill(pct, suffix = ' %') {
  if (pct == null) return '<span class="delta flat">—</span>';
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '';
  return `<span class="delta ${cls}">${arrow} ${pct > 0 ? '+' : ''}${pct}${suffix}</span>`;
}

const PALETTE = ['#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6', '#6366f1', '#f97316'];
function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
const initials = (name) =>
  String(name)
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim()
    .slice(0, 2)
    .toUpperCase() || '?';
const avatar = (name, cls = '') =>
  `<span class="avatar ${cls}" style="background:${PALETTE[hash(name) % PALETTE.length]}">${esc(initials(name))}</span>`;
const PLAT_SHORT = { youtube: 'YT', tiktok: 'TT', instagram: 'IG' };
const PLAT_NAME = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };
const plats = (list) =>
  `<span class="plats">${(list ?? []).map((p) => `<span class="plat ${p}">${PLAT_SHORT[p]}</span>`).join('')}</span>`;

const scoreColor = (s) => (s >= 75 ? 'var(--accent)' : s >= 40 ? 'var(--orange)' : 'var(--red)');
function ring(score, size = 26, stroke = 3, label = false) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, score ?? 0));
  return `<span class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="${scoreColor(v)}"
      stroke-dasharray="${(c * v) / 100} ${c}"/></svg>${label ? `<span style="font-size:${size / 3.4}px">${v}</span>` : ''}</span>`;
}

function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = `toast${err ? ' err' : ''}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

async function copy(text, msg = 'Lien copié') {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    prompt('Copie ce lien :', text);
  }
}

// ---------------------------------------------------------------------------
// État (agence + période), mémorisé dans le navigateur
// ---------------------------------------------------------------------------

const store = (() => {
  let s = { client: '', preset: '7d', from: null, to: null };
  try {
    s = { ...s, ...JSON.parse(localStorage.getItem('lune.filters') || '{}') };
  } catch {}
  return s;
})();
function saveStore() {
  try {
    localStorage.setItem('lune.filters', JSON.stringify(store));
  } catch {}
}
function qs(extra = {}, withClient = true) {
  const p = new URLSearchParams();
  if (store.preset === 'custom' && store.from && store.to) {
    p.set('from', store.from);
    p.set('to', store.to);
  } else p.set('preset', store.preset === 'custom' ? '7d' : store.preset);
  if (withClient && store.client) p.set('client', store.client);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  return p.toString();
}
const PRESETS = { today: "Aujourd'hui", '7d': '7 derniers jours', '30d': '30 derniers jours', all: 'All-time' };
const periodLabel = () =>
  store.preset === 'custom' && store.from ? `${dm(+store.from)} – ${dm(+store.to - 1)}` : PRESETS[store.preset] ?? PRESETS['7d'];

let META = { clients: [], settings: {}, status: { bot: { state: 'disabled' } } };
const agencyName = (id) => META.clients.find((c) => c.id === id)?.name ?? 'Sans agence';

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

async function loadMeta() {
  META = await api('/api/meta');
  if (store.client && !META.clients.some((c) => String(c.id) === String(store.client))) {
    store.client = '';
    saveStore();
  }
  renderSidebar();
}

// ---------------------------------------------------------------------------
// Composants
// ---------------------------------------------------------------------------

function agencySelect() {
  return `<select class="select" data-agency aria-label="Agence">
    <option value="">Toutes les agences</option>
    ${META.clients.map((c) => `<option value="${c.id}" ${String(c.id) === String(store.client) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
  </select>`;
}

function periodPicker() {
  return `<div class="picker"><button class="btn" data-picker>${icon('cal')} ${esc(periodLabel())} ${icon('chevron')}</button></div>`;
}

/** Branche les filtres communs (agence + période) d'une page ; `rerender` recharge la page. */
function bindFilters(root, rerender) {
  $$('[data-agency]', root).forEach((sel) =>
    sel.addEventListener('change', () => {
      store.client = sel.value;
      saveStore();
      rerender();
    }),
  );
  $$('[data-picker]', root).forEach((btn) => btn.addEventListener('click', () => openPicker(btn, rerender)));
}

function openPicker(btn, onApply) {
  const host = btn.parentElement;
  const existing = $('.picker-pop', host);
  if (existing) return existing.remove();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let month = new Date(today.getFullYear(), today.getMonth(), 1);
  let sel = { preset: store.preset, from: store.from ? +store.from : null, to: store.to ? +store.to - DAY : null };
  const pop = document.createElement('div');
  pop.className = 'picker-pop';
  host.append(pop);

  const draw = () => {
    const first = (month.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
      const t = new Date(month.getFullYear(), month.getMonth(), d).getTime();
      const inRange = sel.from && sel.to && t > sel.from && t < sel.to;
      const edge = t === sel.from || t === sel.to;
      cells.push(`<button data-day="${t}" class="${edge ? 'edge' : inRange ? 'in' : ''}" ${t > today.getTime() ? 'disabled' : ''}>${d}</button>`);
    }
    const title = month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    pop.innerHTML = `<div class="picker-body">
      <div class="shortcuts"><div class="label" style="padding:0 10px 4px">Raccourcis</div>
        ${Object.entries(PRESETS).map(([k, v]) => `<button data-preset="${k}" class="${sel.preset === k ? 'on' : ''}">${v}</button>`).join('')}
      </div>
      <div><div class="cal-head"><button class="icon-btn" data-m="-1">${icon('left')}</button>
        <span style="text-transform:capitalize">${title}</span><button class="icon-btn" data-m="1">${icon('right')}</button></div>
        <div class="cal">${['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'].map((d) => `<span class="dow">${d}</span>`).join('')}${cells.join('')}</div>
      </div></div>
      <div class="picker-foot"><span>${sel.preset === 'custom' && sel.from ? `${dm(sel.from)} → ${sel.to ? dm(sel.to) : '…'}` : 'Sélectionne une période'}</span>
      <button class="btn dark" data-apply>Appliquer</button></div>`;
  };
  draw();
  pop.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.m) month = new Date(month.getFullYear(), month.getMonth() + Number(t.dataset.m), 1);
    if (t.dataset.preset) sel = { preset: t.dataset.preset, from: null, to: null };
    if (t.dataset.day) {
      const d = Number(t.dataset.day);
      if (sel.preset !== 'custom' || !sel.from || sel.to) sel = { preset: 'custom', from: d, to: null };
      else if (d < sel.from) sel = { preset: 'custom', from: d, to: sel.from };
      else sel.to = d;
    }
    if ('apply' in t.dataset) {
      if (sel.preset === 'custom') {
        if (!sel.from) return toast('Choisis une date de début', true);
        store.preset = 'custom';
        store.from = sel.from;
        store.to = (sel.to ?? sel.from) + DAY;
      } else Object.assign(store, { preset: sel.preset, from: null, to: null });
      saveStore();
      pop.remove();
      return onApply();
    }
    draw();
  });
  setTimeout(() => document.addEventListener('click', function close(e) {
    if (!pop.contains(e.target)) {
      pop.remove();
      document.removeEventListener('click', close);
    }
  }), 0);
}

/** Graphique en aire (SVG) avec info-bulle au survol. mode : 'views' | 'posts' | 'both'. */
function mountChart(el, series, mode = 'views') {
  const W = 700;
  const H = 250;
  const P = { l: 44, r: 10, t: 12, b: 28 };
  if (!series.length) {
    el.innerHTML = '<div class="empty">Pas encore de données sur cette période.</div>';
    return;
  }
  const keys = mode === 'both' ? ['views', 'posts'] : [mode];
  const x = (i) => P.l + (series.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (series.length - 1));
  const scales = Object.fromEntries(
    keys.map((k) => {
      const max = Math.max(1, ...series.map((d) => d[k]));
      return [k, { max, y: (v) => H - P.b - (Math.max(0, v) / max) * (H - P.t - P.b) }];
    }),
  );
  const main = scales[keys[0]];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: main.max * f, y: main.y(main.max * f) }));
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));
  const paths = keys
    .map((k) => {
      const pts = series.map((d, i) => `${x(i).toFixed(1)},${scales[k].y(d[k]).toFixed(1)}`);
      const cls = k === 'posts' ? 'posts' : '';
      return `<path class="area ${cls}" d="M${pts[0].split(',')[0]},${H - P.b} L${pts.join(' L')} L${x(series.length - 1)},${H - P.b} Z"/>
        <path class="line ${cls}" d="M${pts.join(' L')}"/>`;
    })
    .join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Évolution par jour">
    <defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#16a34a" stop-opacity=".22"/><stop offset="1" stop-color="#16a34a" stop-opacity="0"/></linearGradient>
    <linearGradient id="areaFillBlue" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4f46e5" stop-opacity=".15"/><stop offset="1" stop-color="#4f46e5" stop-opacity="0"/></linearGradient></defs>
    <g class="grid">${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${t.y}" y2="${t.y}"/>`).join('')}</g>
    <g class="axis">${ticks.map((t) => `<text x="${P.l - 8}" y="${t.y + 3}" text-anchor="end">${fmtK(t.v)}</text>`).join('')}
      ${series.map((d, i) => (i % labelEvery === 0 || i === series.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${d.day.slice(8, 10)}/${d.day.slice(5, 7)}</text>` : '')).join('')}</g>
    ${paths}<line class="hover-line" y1="${P.t}" y2="${H - P.b}" stroke="#16a34a" stroke-width="1" opacity="0"/>
    <circle class="hover-dot" r="4" fill="#16a34a" stroke="#fff" stroke-width="2" opacity="0"/></svg><div class="tip"></div>`;
  const svg = $('svg', el);
  const tip = $('.tip', el);
  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(series.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (series.length - 1))));
    const d = series[i];
    $('.hover-line', svg).setAttribute('x1', x(i));
    $('.hover-line', svg).setAttribute('x2', x(i));
    $('.hover-line', svg).setAttribute('opacity', 0.5);
    $('.hover-dot', svg).setAttribute('cx', x(i));
    $('.hover-dot', svg).setAttribute('cy', main.y(d[keys[0]]));
    $('.hover-dot', svg).setAttribute('opacity', 1);
    tip.style.display = 'block';
    tip.innerHTML = `<div class="faint num" style="font-size:10.5px">${d.day.slice(8, 10)}/${d.day.slice(5, 7)}</div>
      ${keys.map((k) => `<b>${fmtK(d[k])}</b> <span class="faint">${k === 'views' ? 'vues' : 'posts'}</span>`).join(' · ')}`;
    const left = (x(i) / W) * rect.width;
    tip.style.left = `${Math.min(rect.width - tip.offsetWidth, Math.max(0, left - tip.offsetWidth / 2)) + 16}px`;
    tip.style.top = `${(main.y(d[keys[0]]) / H) * rect.height - 56}px`;
  });
  svg.addEventListener('mouseleave', () => {
    tip.style.display = 'none';
    $('.hover-line', svg).setAttribute('opacity', 0);
    $('.hover-dot', svg).setAttribute('opacity', 0);
  });
}

function segTabs(name, options, active, cls = 'light') {
  return `<div class="seg ${cls}" data-seg="${name}">${options
    .map(([v, l, disabled]) => `<button data-v="${v}" aria-pressed="${v === active}" ${disabled ? 'disabled title="Bientôt"' : ''}>${l}</button>`)
    .join('')}</div>`;
}
function onSeg(root, name, cb) {
  const seg = $(`[data-seg="${name}"]`, root);
  seg?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.disabled) return;
    $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', x === b));
    cb(b.dataset.v);
  });
}

function leaderboardTable(rows, sort = 'views') {
  const key = { views: (r) => r.views, posts: (r) => r.posts, score: (r) => r.score.total }[sort];
  const sorted = [...rows].sort((a, b) => key(b) - key(a) || b.views - a.views);
  if (!sorted.length) return '<div class="empty">Aucun clipper pour ce filtre.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Clipper</th><th class="r">Vues</th><th class="r">Posts</th>
    <th class="r">Évol.</th><th class="r">À verser</th><th>Score</th><th></th></tr></thead><tbody>
    ${sorted
      .map(
        (r, i) => `<tr class="link" data-clipper="${r.id}">
      <td><span class="rank ${i < 3 ? `r${i + 1}` : ''}">${i + 1}</span></td>
      <td><div class="who">${avatar(r.username)}<div><b>${esc(r.username)}</b>${plats(r.platforms)}</div></div></td>
      <td class="r num">${fmtK(r.views)}</td><td class="r num faint">${r.posts}</td>
      <td class="r">${deltaPill(r.viewsDeltaPercent)}</td><td class="r num">${euro(r.reward.total)}</td>
      <td><span class="score-cell">${ring(r.score.total)}<b>${r.score.total}</b></span></td>
      <td class="r"><button class="icon-btn" data-share="${r.id}" title="Copier le lien du profil">${icon('share')}</button></td></tr>`,
      )
      .join('')}</tbody></table></div>`;
}
function bindRows(root) {
  root.addEventListener('click', (e) => {
    const share = e.target.closest('[data-share]');
    if (share) {
      e.stopPropagation();
      return copy(`${location.origin}/#/clipper/${share.dataset.share}`);
    }
    const row = e.target.closest('[data-clipper]');
    if (row) location.hash = `#/clipper/${row.dataset.clipper}`;
  });
}

function modal(title, bodyHtml, { confirm = 'Enregistrer', danger = false, onConfirm } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<form class="modal"><h3>${esc(title)}</h3>${bodyHtml}
    <footer><button type="button" class="btn" data-cancel>Annuler</button>
    <button class="btn ${danger ? 'danger' : 'dark'}" type="submit">${esc(confirm)}</button></footer></form>`;
  document.body.append(bg);
  const form = $('form', bg);
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => {
    if (e.target === bg || e.target.closest('[data-cancel]')) close();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      if ((await onConfirm?.(new FormData(form), form)) !== false) close();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
  $('input, textarea, select', form)?.focus();
  return form;
}

// ---------------------------------------------------------------------------
// Cadre : barre latérale + barre du haut
// ---------------------------------------------------------------------------

const NAV = [
  ['Pilotage', [['funnel', 'Funnel', 'funnel', true], ['agence', 'Agence', 'grid'], ['clippers', 'Clippers', 'users'], ['recruteurs', 'Recruteurs', 'userPlus', true], ['classement', 'Classement', 'trophy']]],
  ['Automatisations', [['suivi', 'Suivi', 'pulse', true]], true],
  ['Découvrir', [['inspiration', 'Inspiration', 'spark']]],
  ['Gestion', [['management', 'Management', 'sliders'], ['remuneration', 'Rémunération', 'coins'], ['parametres', 'Paramètres', 'gear']]],
];

function renderSidebar() {
  const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'agence';
  const b = META.status.bot;
  const botLine =
    b.state === 'ready'
      ? '<span class="pill ok"><span class="dot"></span>En ligne</span>'
      : b.state === 'error'
        ? `<span class="pill ko" title="${esc(b.error)}"><span class="dot"></span>Erreur</span>`
        : b.state === 'connecting'
          ? '<span class="pill wait"><span class="dot"></span>Connexion…</span>'
          : '<span class="pill gray"><span class="dot"></span>Désactivé</span>';
  $('#sidebar').innerHTML = `
    <div class="brand"><div class="brand-logo">LT</div><div><div class="brand-name">Lune Tracker</div><div class="brand-sub">Clipping OS</div></div></div>
    <div class="box" style="padding:8px"><div class="label" style="margin:0 0 6px 4px">Vision</div>
      <div class="seg"><button aria-pressed="true">Complète</button><button disabled title="Vue Client : bientôt">Client</button></div></div>
    <div class="box admin"><span class="av">AD</span><div><b style="font-size:13px">Compte admin</b><small>Accès total : agences, clippers, rémunération</small></div></div>
    <nav class="nav">${NAV.map(
      ([group, items, live]) => `<div class="nav-group"><div class="label">${group}${live ? '<span class="dot" style="color:var(--accent)"></span>' : ''}</div>
      ${items.map(([id, label, ic, soon]) => `<a href="#/${id}" class="${route === id || (id === 'clippers' && route === 'clipper') ? 'active' : ''}">${icon(ic)}${label}${soon ? '<span class="soon">bientôt</span>' : ''}</a>`).join('')}</div>`,
    ).join('')}</nav>
    <div class="box bot-box"><b>Bot Discord ${b.state === 'ready' ? 'actif' : 'inactif'}</b>
      <small>${b.tag ? esc(b.tag) : 'Clipping Tracker'}${b.guilds != null ? ` · ${b.guilds} serveur(s)` : ''}</small>
      <small>Dernière synchro : ${META.status.startedAt ? new Date(META.status.startedAt).toLocaleDateString('fr-FR') : '—'}</small>
      <div style="margin-top:6px">${botLine}</div></div>`;
}

let SEARCH_CACHE = null;
function renderTopbar() {
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#topbar').innerHTML = `<div class="today"><span class="dot"></span><span style="text-transform:capitalize">${today}</span></div>
    <div class="search">${icon('search')}<input id="search" placeholder="Rechercher un clipper…" autocomplete="off"><div class="search-results" id="search-results"></div></div>
    <a class="icon-btn" href="#/agence" title="Alertes">${icon('bell')}<span class="badge-count" id="alert-count" hidden></span></a>`;
  const input = $('#search');
  const results = $('#search-results');
  input.addEventListener('input', async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return results.classList.remove('open');
    SEARCH_CACHE ??= await api('/api/management').catch(() => []);
    const hits = SEARCH_CACHE.filter(
      (c) => c.username.toLowerCase().includes(q) || c.accounts.some((a) => a.handle.includes(q)),
    ).slice(0, 8);
    results.innerHTML = hits.length
      ? hits.map((c) => `<a href="#/clipper/${c.id}">${avatar(c.username)}<div><b>${esc(c.username)}</b><div class="faint" style="font-size:12px">${esc(c.agency ?? 'Sans agence')}</div></div></a>`).join('')
      : '<div class="empty" style="padding:12px">Aucun résultat</div>';
    results.classList.add('open');
  });
  results.addEventListener('click', () => {
    results.classList.remove('open');
    input.value = '';
  });
  input.addEventListener('blur', () => setTimeout(() => results.classList.remove('open'), 150));
}
function setAlertCount(n) {
  const el = $('#alert-count');
  if (!el) return;
  el.hidden = !n;
  el.textContent = n > 99 ? '99+' : n;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const main = () => $('#main');
/** Repart d'un <main> neuf (sans les écouteurs de la page précédente) et affiche le chargement. */
function loading() {
  const fresh = main().cloneNode(false);
  main().replaceWith(fresh);
  fresh.innerHTML = '<div class="empty">Chargement…</div>';
}

async function pageAgence() {
  loading();
  const d = await api(`/api/overview?${qs()}`);
  setAlertCount(d.alerts.length);
  const k = d.kpis;
  const scoreAvg = d.leaderboard.length ? Math.round(d.leaderboard.reduce((a, r) => a + r.score.total, 0) / d.leaderboard.length) : 0;
  const actives = d.leaderboard.filter((r) => r.posts > 0).length;
  const strikes = d.leaderboard.reduce((a, r) => a + r.strikes, 0);
  const agencyLabel = store.client ? agencyName(Number(store.client)) : 'Toutes les agences';
  main().innerHTML = `
    <div class="page-head"><div><h1>Vue Agence</h1><p>${esc(agencyLabel)} · ${META.clients.length} au total</p></div>
      <div class="actions">${agencySelect()}${periodPicker()}
        <button class="btn" data-refresh>${icon('refresh')} Actualiser</button>
        <a class="btn dark" href="/api/export.csv?${qs()}">${icon('download')} Exporter CSV</a></div></div>
    <div class="stack">
      <div class="kpis">
        <div class="card kpi"><div class="k-label">Vues totales</div><div class="k-value num">${fmtK(k.views.value)}</div>
          <div class="k-foot"><span>${k.views.clippers} clippers</span>${deltaPill(k.views.deltaPercent)}</div></div>
        <div class="card kpi"><div class="k-label">Posts publiés</div><div class="k-value num">${k.posts.value}</div>
          <div class="k-foot"><span>obj. ${k.posts.objectivePerDay}/j</span>${deltaPill(k.posts.deltaPercent)}</div></div>
        <div class="card kpi"><div class="k-label">CA généré</div><div class="k-value num">${euro(k.revenue.value)}</div>
          <div class="k-foot"><span>marge ${euro(k.revenue.margin)}</span></div></div>
        <div class="card kpi"><div class="k-label">À verser aux clippers</div><div class="k-value num">${euro(k.payout.value)}</div>
          <div class="k-foot"><span>${esc(periodLabel())}</span></div></div>
      </div>
      <details class="card collapse"><summary>Détails de performance ${icon('chevron')}</summary>
        <div class="mini-stats">
          <div><b class="num">${scoreAvg}/100</b><span>Score moyen</span></div>
          <div><b class="num">${k.posts.value ? fmtK(Math.round(k.views.value / k.posts.value)) : '—'}</b><span>Vues gagnées / post</span></div>
          <div><b class="num">${actives} / ${d.leaderboard.length}</b><span>Clippers ayant posté</span></div>
          <div><b class="num">${(k.posts.value / Math.max(1, d.leaderboard.length) / d.range.days).toFixed(1).replace('.', ',')}</b><span>Posts / clipper / jour</span></div>
          <div><b class="num">${strikes}</b><span>Strikes sur la période</span></div>
        </div></details>
      <div class="two-col">
        <div class="card"><div class="card-head"><div><h2>Évolution de l'agence</h2><p>${esc(periodLabel())}</p></div>
          ${segTabs('chart', [['views', 'Vues'], ['posts', 'Posts'], ['both', 'Tout']], 'views')}</div>
          <div class="chart" id="chart"></div></div>
        <div class="card"><div class="card-head"><div><h2>Alertes <span class="tag">${d.alerts.length}</span></h2><p>Selon la période et le filtre en cours</p></div></div>
          <div class="alerts">${
            d.alerts.length
              ? d.alerts
                  .map(
                    (a) => `<a class="alert" href="#/clipper/${a.clipperId}"><span class="dot"></span><div><b>${esc(a.username)}</b>
                <small>${[a.inactiveDays !== null ? `inactif · ${a.inactiveDays} j sans post` : null, a.dropPercent !== null ? `vues −${a.dropPercent} %` : null].filter(Boolean).join(' · ')}</small></div></a>`,
                  )
                  .join('')
              : '<div class="empty">Aucune alerte 🎉</div>'
          }</div></div>
      </div>
      <div class="card" id="lb"><div class="card-head"><div><h2>Classement des clippers</h2><p>${d.leaderboard.length} clippers · ${esc(periodLabel())}</p></div>
        <div class="actions"><span class="faint" style="font-size:12px">Trier par</span>${segTabs('sort', [['views', 'Vues'], ['posts', 'Posts'], ['score', 'Score']], 'views')}</div></div>
        <div id="lb-body">${leaderboardTable(d.leaderboard)}</div></div>
    </div>`;
  const root = main();
  bindFilters(root, pageAgence);
  $('[data-refresh]', root).addEventListener('click', pageAgence);
  mountChart($('#chart', root), d.series, 'views');
  onSeg(root, 'chart', (v) => mountChart($('#chart', root), d.series, v));
  onSeg(root, 'sort', (v) => ($('#lb-body', root).innerHTML = leaderboardTable(d.leaderboard, v)));
  bindRows($('#lb', root));
}

async function pageClippers() {
  loading();
  const d = await api(`/api/leaderboard?${qs()}`);
  const draw = (q = '') => {
    const rows = d.rows.filter((r) => r.username.toLowerCase().includes(q.toLowerCase()));
    $('#cards').innerHTML = rows.length
      ? rows
          .map(
            (r) => `<a class="card clip-card" href="#/clipper/${r.id}">
        <div class="top">${avatar(r.username)}<div class="grow"><b>${esc(r.username)}</b>
          <span class="status-dot"><span class="dot"></span>Actif</span> ${plats(r.platforms)}</div>
          ${ring(r.score.total, 28, 3)}<button class="icon-btn" data-share="${r.id}" title="Copier le lien">${icon('share')}</button></div>
        <div class="nums"><div><small>VUES</small><b>${fmtK(r.views)}</b></div><div><small>POSTS</small><b>${r.posts}</b></div></div></a>`,
          )
          .join('')
      : '<div class="empty">Aucun clipper.</div>';
  };
  main().innerHTML = `<div class="page-head"><div><h1>Clippers</h1>
      <p>${d.rows.length} créateurs · ${esc(store.client ? agencyName(Number(store.client)) : 'Toutes les agences')} · ${esc(periodLabel())}</p></div>
      <div class="actions">${agencySelect()}${periodPicker()}<input class="input" id="q" placeholder="Rechercher…"></div></div>
    <div class="cards" id="cards"></div>`;
  const root = main();
  bindFilters(root, pageClippers);
  draw();
  $('#q', root).addEventListener('input', (e) => draw(e.target.value));
  $('#cards', root).addEventListener('click', (e) => {
    const share = e.target.closest('[data-share]');
    if (share) {
      e.preventDefault();
      copy(`${location.origin}/#/clipper/${share.dataset.share}`);
    }
  });
}

async function pageClassement() {
  loading();
  const d = await api(`/api/leaderboard?${qs({}, false)}`);
  let tab = 'clippers';
  let sort = 'views';
  const agencies = () => {
    const by = new Map();
    for (const r of d.rows) {
      const key = r.clientId ?? 0;
      const a = by.get(key) ?? { name: agencyName(r.clientId), views: 0, posts: 0, clippers: 0, score: 0, payout: 0 };
      a.views += r.views;
      a.posts += r.posts;
      a.clippers += 1;
      a.score += r.score.total;
      a.payout += r.reward.total;
      by.set(key, a);
    }
    const list = [...by.values()].sort((a, b) => b.views - a.views);
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Agence</th><th class="r">Clippers</th><th class="r">Vues</th><th class="r">Posts</th><th class="r">Score moyen</th><th class="r">À verser</th></tr></thead>
      <tbody>${list.map((a, i) => `<tr><td><span class="rank ${i < 3 ? `r${i + 1}` : ''}">${i + 1}</span></td><td><div class="who">${avatar(a.name)}<b>${esc(a.name)}</b></div></td>
      <td class="r num">${a.clippers}</td><td class="r num">${fmtK(a.views)}</td><td class="r num">${a.posts}</td><td class="r num">${Math.round(a.score / a.clippers)}</td><td class="r num">${euro(a.payout)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const draw = () => {
    $('#board').innerHTML =
      tab === 'clippers'
        ? `<div class="card-head"><div><h2>Classement des clippers</h2><p>${d.rows.length} clippers · ${esc(periodLabel())}</p></div>
          <div class="actions"><span class="faint" style="font-size:12px">Trier par</span>${segTabs('sort', [['views', 'Vues'], ['posts', 'Posts'], ['score', 'Score']], sort)}</div></div>
          ${leaderboardTable(d.rows, sort)}`
        : `<div class="card-head"><div><h2>Classement des agences</h2><p>${esc(periodLabel())}</p></div></div>${agencies()}`;
    onSeg($('#board'), 'sort', (v) => {
      sort = v;
      draw();
    });
  };
  main().innerHTML = `<div class="page-head"><div><h1>Classement</h1><p>${d.rows.length} clippers · ${esc(periodLabel())}</p></div>
    <div class="actions">${segTabs('tab', [['agences', 'Agences'], ['clippers', 'Clippers'], ['recruteurs', 'Recruteurs', true]], tab)}${periodPicker()}</div></div>
    <div class="card" id="board"></div>`;
  const root = main();
  bindFilters(root, pageClassement);
  onSeg(root, 'tab', (v) => {
    tab = v;
    draw();
  });
  draw();
  bindRows($('#board', root));
}

async function pageClipper(id) {
  loading();
  const d = await api(`/api/clippers/${id}?${qs({}, false)}`);
  const c = d.clipper;
  const k = d.kpis;
  let vFilter = 'all';
  const drawVideos = () => {
    const list = d.videos.filter((v) => vFilter === 'all' || v.platform === vFilter);
    $('#videos').innerHTML = list.length
      ? list
          .map(
            (v) => `<div class="video"><a class="thumb ${v.platform}" href="${esc(v.url ?? '#')}" target="_blank" rel="noopener">
          ${v.thumbnailUrl ? `<img src="${esc(v.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
          <span class="plat-tag">${PLAT_NAME[v.platform]}</span><span class="play"></span>
          <span class="views">${icon('eye').replace('<svg', '<svg width="12" height="12" stroke="#fff"')} ${fmtK(v.views)}</span></a>
          <span class="date">${dm(v.publishedAt)}${v.feedbackCount ? ` · <span class="fb-count">${v.feedbackCount} retour(s)</span>` : ''}</span>
          <button class="btn blue" data-feedback="${v.id}">${icon('message')} Faire un retour</button></div>`,
          )
          .join('')
      : '<div class="empty" style="width:100%">Aucune vidéo publiée sur cette période.</div>';
  };
  const statusPill = c.status === 'actif' ? '<span class="pill ok"><span class="dot"></span>Actif</span>' : '<span class="pill gray"><span class="dot"></span>Inactif</span>';
  main().innerHTML = `
    <a class="back" href="#/agence">${icon('left')} Retour à l'agence</a>
    <div class="profile-head"><div class="id">${avatar(c.username, 'lg')}<div>
      <h1>${esc(c.username)} ${statusPill} ${plats(d.accounts.map((a) => a.platform))}</h1>
      <div class="meta">${esc(c.agency ?? 'Sans agence')} · ${c.discordId.startsWith('manual:') ? 'pas de Discord lié' : `discord · ${esc(c.discordId)}`}</div>
      <div class="handles">${d.accounts.map((a) => `<a class="handle ${a.platform}" href="${esc(a.url)}" target="_blank" rel="noopener" title="${a.lastError ? esc(`Erreur : ${a.lastError}`) : a.lastCheckedAt ? `Vérifié ${ago(a.lastCheckedAt)}` : 'Jamais vérifié'}">${PLAT_SHORT[a.platform]} @${esc(a.handle)}${a.lastError ? ' ⚠️' : ''}</a>`).join('') || '<span class="faint">Aucun compte suivi</span>'}</div>
    </div></div>
    <div class="actions">${periodPicker()}<button class="btn" data-share-profile>${icon('share')} Partager</button></div></div>
    <div class="stack">
      <div class="kpis">
        <div class="card kpi"><div class="k-label">Vues</div><div class="k-value num">${fmtK(k.views)}</div><div class="k-foot"><span>sur la période</span>${deltaPill(k.viewsDeltaPercent)}</div></div>
        <div class="card kpi"><div class="k-label">Posts</div><div class="k-value num">${k.posts}</div><div class="k-foot"><span>obj. ${k.postsObjectivePerDay}/jour</span>${k.postsDelta == null ? '' : deltaPill(k.postsDelta, '')}</div></div>
        <div class="card kpi"><div class="k-label">Moy/vidéo</div><div class="k-value num">${fmtK(k.avgPerVideo)}</div><div class="k-foot"><span>vues</span></div></div>
        <div class="card kpi"><div class="k-label">Strikes</div><div class="k-value num">${k.strikes}</div><div class="k-foot"><span>disciplinaires</span></div></div>
        <div class="card kpi"><div class="k-label">Montant dû</div><div class="k-value num" style="color:var(--accent)">${euro(k.due)}</div><div class="k-foot"><span>${esc(periodLabel())}</span></div></div>
      </div>
      <div class="card"><div class="card-head"><div><h2>${icon('play').replace('<svg', '<svg width="16" style="vertical-align:-3px"')} Dernières vidéos <span class="faint" style="font-weight:500;font-size:12px">· ${d.videos.length} vidéos</span></h2></div>
        ${segTabs('vf', [['all', 'Tout'], ['tiktok', 'TikTok'], ['instagram', 'Reels'], ['youtube', 'Shorts']], 'all', '')}</div>
        <div class="videos" id="videos"></div></div>
      <div class="two-col">
        <div class="card"><div class="card-head"><h2>Historique</h2>${segTabs('hist', [['views', 'Vues'], ['posts', 'Posts'], ['both', 'Tout']], 'views')}</div>
          <div class="history"><div class="chart" id="hchart"></div>
          <div class="side-stats"><div><small>Meilleur jour</small><b class="num">${d.bestDay ? fmtK(d.bestDay.views) : '—'}</b>
            <small class="num faint">${d.bestDay ? `${d.bestDay.day.slice(8, 10)}/${d.bestDay.day.slice(5, 7)}` : ''}</small></div>
            <div><small>Jours actifs</small><b class="num">${d.activeDays}</b><span class="faint num"> / ${d.days}</span>
            <small class="faint">${Math.round((d.activeDays / d.days) * 100)} % d'assiduité</small></div></div></div></div>
        <div class="card"><div class="card-head"><h2>Score de la période</h2></div>
          <div style="display:grid;place-items:center;padding:4px 0 14px">${ring(d.score.total, 132, 12, true)}<span class="faint" style="margin-top:-4px">/ 100</span></div>
          <div class="bars">${[
            ['Production', d.score.production, 40],
            ['Performance', d.score.performance, 30],
            ['Régularité', d.score.regularite, 20],
            ['Discipline', d.score.discipline, 10],
          ]
            .map(([l, v, m]) => `<div class="bar-row"><header>${l}<span><b>${v}</b> / ${m}</span></header><div class="bar"><i style="width:${(v / m) * 100}%"></i></div></div>`)
            .join('')}</div></div>
      </div>
      <div class="card"><div class="card-head"><h2>${icon('bulb').replace('<svg', '<svg width="16" style="vertical-align:-3px"')} Lecture automatique</h2></div>
        <div class="alerts" style="max-height:none">${
          d.insights.length
            ? d.insights.map((i) => `<div class="alert ${i.level === 'alert' ? '' : i.level}"><span class="dot"></span><div><b>${esc(i.title)}${i.level === 'alert' ? '<span class="tag">ALERT</span>' : ''}</b><small>${esc(i.text)}</small></div></div>`).join('')
            : '<div class="empty">Rien à signaler.</div>'
        }</div></div>
      <div class="card"><div class="card-head"><h2>${icon('shield').replace('<svg', '<svg width="16" style="vertical-align:-3px"')} Discipline & strikes</h2>
        <div class="actions">${d.strikes.length ? `<span class="pill ko">${d.strikes.length} strike(s)</span>` : '<span class="pill ok">Aucun strike</span>'}
        <button class="btn sm" data-add-strike>${icon('plus')} Ajouter un strike</button></div></div>
        <div class="alerts" style="max-height:none">${
          d.strikes.length
            ? d.strikes.map((s) => `<div class="alert"><span class="dot"></span><div style="flex:1"><b>${esc(s.reason)}</b><small>${dateLong(s.createdAt)}</small></div><button class="btn sm danger" data-del-strike="${s.id}">Retirer</button></div>`).join('')
            : '<div class="alert good"><span class="dot"></span><div><b>Aucun strike : discipline irréprochable.</b></div></div>'
        }</div></div>
      <div class="card"><div class="card-head"><h2>Rapport de synthèse</h2><span class="faint" style="font-size:12px">All-time</span></div>
        <div class="synth">${ring(d.summary.score, 70, 7, true)}<div><b style="font-size:14px">Score moyen</b><small>All-time</small></div><span class="sep"></span>
          <div><small>Posts</small><b class="num">${d.summary.posts}</b></div><div><small>Vues</small><b class="num">${fmtK(d.summary.views)}</b></div>
          <div><small>Strikes</small><b class="num">${d.summary.strikes}</b></div>
          <div><small>Rémunération (période)</small><b class="num">${euro(d.reward.total)}</b></div></div></div>
    </div>`;
  const root = main();
  bindFilters(root, () => pageClipper(id));
  drawVideos();
  mountChart($('#hchart', root), d.series, 'views');
  onSeg(root, 'hist', (v) => mountChart($('#hchart', root), d.series, v));
  onSeg(root, 'vf', (v) => {
    vFilter = v;
    drawVideos();
  });
  $('[data-share-profile]', root).addEventListener('click', () => copy(location.href));
  root.addEventListener('click', (e) => {
    const fb = e.target.closest('[data-feedback]');
    if (fb) {
      const video = d.videos.find((v) => v.id === Number(fb.dataset.feedback));
      modal(
        `Retour à ${c.username}`,
        `<p class="muted" style="margin:0">Vidéo du ${dm(video.publishedAt)} · ${PLAT_NAME[video.platform]} · ${fmtK(video.views)} vues</p>
        <label class="field"><span>Ton retour</span><textarea class="input" name="message" rows="5" required placeholder="Hook trop long, sous-titres à grossir…"></textarea>
        <small>Envoyé au clipper sur Discord (salon de son agence, sinon en DM).</small></label>`,
        {
          confirm: 'Envoyer',
          onConfirm: async (fd) => {
            const r = await api(`/api/videos/${video.id}/feedback`, { method: 'POST', body: { message: fd.get('message') } });
            toast(r.sent ? 'Retour envoyé sur Discord ✅' : 'Retour enregistré (bot indisponible : non envoyé sur Discord)', !r.sent);
            pageClipper(id);
          },
        },
      );
    }
    if (e.target.closest('[data-add-strike]')) {
      modal(
        `Strike pour ${c.username}`,
        `<label class="field"><span>Motif</span><input class="input" name="reason" required placeholder="Absent au call du lundi sans prévenir"></label>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="notify" checked> Prévenir le clipper sur Discord</label>`,
        {
          confirm: 'Ajouter le strike',
          danger: true,
          onConfirm: async (fd) => {
            const r = await api(`/api/clippers/${c.id}/strikes`, { method: 'POST', body: { reason: fd.get('reason'), notify: fd.get('notify') === 'on' } });
            toast(fd.get('notify') === 'on' && !r.sent ? 'Strike ajouté (message Discord non envoyé)' : 'Strike ajouté');
            pageClipper(id);
          },
        },
      );
    }
    const del = e.target.closest('[data-del-strike]');
    if (del && confirm('Retirer ce strike ?')) {
      api(`/api/strikes/${del.dataset.delStrike}`, { method: 'DELETE' }).then(() => pageClipper(id));
    }
  });
}

let INSPI_WEEK = null;
async function pageInspiration() {
  loading();
  const d = await api(`/api/inspiration?${new URLSearchParams({ ...(INSPI_WEEK ? { week: INSPI_WEEK } : {}), ...(store.client ? { client: store.client } : {}) })}`);
  const weekLabel = `${new Date(d.week.from).getDate()} – ${dateLong(d.week.to - DAY)}`;
  const list = (items) =>
    items.length
      ? `<div class="top-list">${items
          .map(
            (v, i) => `<a class="top-item" href="${esc(v.url ?? '#')}" target="_blank" rel="noopener">
        ${i < 3 ? `<span class="rank r${i + 1}">${i + 1}</span>` : `<span class="faint num" style="text-align:center">${i + 1}</span>`}
        <span class="mini-thumb ${v.platform}">${v.thumbnailUrl ? `<img src="${esc(v.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
        <div><b>${esc(v.username)}</b><small>${v.publishedAt ? dm(v.publishedAt) : ''}</small></div>
        <b class="num">${fmtK(v.views)}</b>${icon('arrow')}</a>`,
          )
          .join('')}</div>`
      : '<div class="empty">Aucune vidéo.</div>';
  const block = (data, title) =>
    ['tiktok', 'instagram', 'youtube']
      .map((p) => `<div class="card"><div class="card-head"><h2><span class="plat-title ${p}">${PLAT_NAME[p]}</span>${title}</h2></div>${list(data[p])}</div>`)
      .join('');
  main().innerHTML = `<div class="page-head"><div><h1>Inspiration</h1><p>Top 10 par vues · ${weekLabel}</p></div>
    <div class="actions">${d.isCurrentWeek ? '<span class="pill ok"><span class="dot"></span>Semaine en cours · mise à jour en direct</span>' : ''}
      ${agencySelect()}<button class="icon-btn" data-w="-1">${icon('left')}</button>
      <span class="btn" style="cursor:default">${icon('cal')} ${weekLabel}</span>
      <button class="icon-btn" data-w="1" ${d.isCurrentWeek ? 'disabled' : ''}>${icon('right')}</button></div></div>
    <div class="three">${block(d.weekly, 'Top 10 de la semaine')}</div>
    <div class="section-title"><h2>Top 10 all-time</h2><p>Meilleurs clips sur tout l'historique</p></div>
    <div class="three">${block(d.allTime, 'Top 10 all-time')}</div>`;
  const root = main();
  bindFilters(root, pageInspiration);
  $$('[data-w]', root).forEach((b) =>
    b.addEventListener('click', () => {
      INSPI_WEEK = d.week.from + Number(b.dataset.w) * 7 * DAY + DAY / 2;
      pageInspiration();
    }),
  );
}

async function pageManagement() {
  loading();
  const list = await api(`/api/management?${store.client ? `client=${store.client}` : ''}`);
  SEARCH_CACHE = null;
  const acc = (c, p) => {
    const a = c.accounts.filter((x) => x.platform === p);
    return a.length ? a.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" style="color:${p === 'tiktok' ? 'inherit' : 'var(--red)'}">@${esc(x.handle)}</a>`).join('<br>') : '<span class="faint">—</span>';
  };
  main().innerHTML = `<div class="page-head"><div><h1>Management</h1><p>${list.length} clippers · comptes, agence & statut</p></div>
    <div class="actions">${agencySelect()}<button class="btn" data-import>${icon('refresh')} Importer depuis Discord</button>
      <button class="btn dark" data-add>${icon('plus')} Ajouter un clipper</button></div></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Clipper</th><th>Instagram</th><th>TikTok</th><th>YouTube</th><th>Discord</th><th>Statut</th><th class="r">Actions</th></tr></thead>
    <tbody>${list
      .map(
        (c) => `<tr><td><a class="who" href="#/clipper/${c.id}">${avatar(c.username)}<div><b>${esc(c.username)}</b><small class="faint">${esc(c.agency ?? 'Sans agence')}</small></div></a></td>
      <td>${acc(c, 'instagram')}</td><td>${acc(c, 'tiktok')}</td><td>${acc(c, 'youtube')}</td>
      <td>${c.hasDiscord ? `<span class="pill gray">${icon('check').replace('<svg', '<svg width="11"')} lié</span>` : '<span class="faint">—</span>'}</td>
      <td><span class="status-dot ${c.status === 'actif' ? '' : 'off'}"><span class="dot"></span>${c.status === 'actif' ? 'Actif' : 'Inactif'}</span></td>
      <td class="r"><button class="icon-btn" data-edit="${c.id}" title="Modifier" style="display:inline-grid">${icon('edit')}</button>
        <button class="icon-btn" data-del="${c.id}" title="Supprimer" style="display:inline-grid">${icon('trash')}</button></td></tr>`,
      )
      .join('') || '<tr><td colspan="7" class="empty">Aucun clipper. Ajoute-en un, ou laisse-les poster leurs liens dans le salon COMPTES.</td></tr>'}</tbody></table></div></div>`;
  const root = main();
  bindFilters(root, pageManagement);
  const form = (c = {}) => {
    const handle = (p) => c.accounts?.find((a) => a.platform === p)?.handle ?? '';
    return `<label class="field"><span>Nom</span><input class="input" name="username" required value="${esc(c.username ?? '')}"></label>
      <div class="grid-form"><label class="field"><span>Agence</span><select class="select" name="clientId"><option value="">Sans agence</option>
        ${META.clients.map((a) => `<option value="${a.id}" ${a.id === c.clientId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Statut</span><select class="select" name="status"><option value="actif">Actif</option><option value="inactif" ${c.status === 'inactif' ? 'selected' : ''}>Inactif</option></select></label></div>
      ${['tiktok', 'instagram', 'youtube'].map((p) => `<label class="field"><span>${PLAT_NAME[p]}</span><input class="input" name="${p}" value="${esc(handle(p))}" placeholder="@pseudo ou lien du profil"></label>`).join('')}
      <small class="faint">Laisser vide pour retirer le compte. Les vues d'un nouveau compte comptent à partir de son ajout.</small>`;
  };
  const payload = (fd) => ({
    username: fd.get('username'),
    clientId: fd.get('clientId') ? Number(fd.get('clientId')) : null,
    status: fd.get('status'),
    accounts: { tiktok: fd.get('tiktok'), instagram: fd.get('instagram'), youtube: fd.get('youtube') },
  });
  const done = (r) => {
    (r.warnings ?? []).forEach((w) => toast(w, true));
    pageManagement();
  };
  $('[data-add]', root).addEventListener('click', () =>
    modal('Ajouter un clipper', form(), { confirm: 'Ajouter', onConfirm: async (fd) => done(await api('/api/clippers', { method: 'POST', body: payload(fd) })) }),
  );
  $('[data-import]', root).addEventListener('click', async () => {
    let roles;
    try {
      roles = await api('/api/discord/roles');
    } catch (err) {
      return toast(err.message, true);
    }
    modal(
      'Importer depuis Discord',
      `<p class="muted" style="margin:0">Crée un clipper pour chaque membre du serveur qui a ce rôle (les clippers déjà connus sont conservés).</p>
      <label class="field"><span>Rôle Discord</span><select class="select" name="roleId" required>${roles.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Agence</span><select class="select" name="clientId"><option value="">Sans agence</option>${META.clients.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>`,
      {
        confirm: 'Importer',
        onConfirm: async (fd) => {
          const r = await api('/api/discord/import', { method: 'POST', body: { roleId: fd.get('roleId'), clientId: fd.get('clientId') ? Number(fd.get('clientId')) : null } });
          toast(`${r.found} membre(s) trouvé(s), ${r.created} nouveau(x) clipper(s)`);
          pageManagement();
        },
      },
    );
  });
  root.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) {
      const c = list.find((x) => x.id === Number(ed.dataset.edit));
      modal(`Modifier ${c.username}`, form(c), { onConfirm: async (fd) => done(await api(`/api/clippers/${c.id}`, { method: 'PATCH', body: payload(fd) })) });
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const c = list.find((x) => x.id === Number(del.dataset.del));
      modal('Supprimer le clipper', `<p style="margin:0">Supprimer <b>${esc(c.username)}</b> et tout son historique (comptes, vues, strikes) ? C'est définitif.</p>`, {
        confirm: 'Supprimer',
        danger: true,
        onConfirm: async () => {
          await api(`/api/clippers/${c.id}`, { method: 'DELETE' });
          pageManagement();
        },
      });
    }
  });
}

let REWARD_TAB = 'universal';
let REWARD_TARGET = { client: null, clipper: null };
async function pageRemuneration() {
  loading();
  const [sum, people] = await Promise.all([api(`/api/remuneration?${qs()}`), api('/api/management')]);
  const targets = { client: META.clients, clipper: people.map((p) => ({ id: p.id, name: p.username })) };
  if (REWARD_TAB !== 'universal') REWARD_TARGET[REWARD_TAB] ??= targets[REWARD_TAB][0]?.id ?? null;
  const targetId = REWARD_TAB === 'universal' ? 0 : REWARD_TARGET[REWARD_TAB];
  const rule = targetId === null ? null : await api(`/api/rewards/${REWARD_TAB}/${targetId}`);

  const sw = (name, on) => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></label>`;
  const num = (name, v, step = 'any') => `<input class="input num" type="number" min="0" step="${step}" name="${name}" value="${v ?? ''}">`;
  const block = (key, title, desc, on, params) => `<div class="rule"><header><div><b>${title}</b><span class="state-tag ${on ? 'on' : ''}">${on ? 'Actif' : 'Inactif'}</span>
      <small>${desc}</small></div>${sw(`${key}.enabled`, on)}</header><div class="params">${params}</div></div>`;
  const editor = (cfg) => `
    <div class="sub-label">BASE</div>
    ${block('base', 'Par vue', 'Rémunération de base selon les vues gagnées sur la période', cfg.base.enabled, `<label>${num('base.perView', cfg.base.perView)} € / vue</label><span class="faint" style="font-size:12px">= ${euro(cfg.base.perView * 1000)} pour 1 000 vues</span>`)}
    <div class="sub-label">PRIMES</div>
    ${block('primeVues', 'Prime vues', 'Bonus si le clipper dépasse un seuil de vues sur la période', cfg.primeVues.enabled, `<label>Seuil ${num('primeVues.threshold', cfg.primeVues.threshold, 1)} vues</label><label>Prime ${num('primeVues.amount', cfg.primeVues.amount)} €</label>`)}
    ${block('primePosts', 'Prime posts', 'Bonus basé sur le nombre de posts publiés', cfg.primePosts.enabled, `<label>À partir de ${num('primePosts.minPosts', cfg.primePosts.minPosts, 1)} posts</label><label>${num('primePosts.perPost', cfg.primePosts.perPost)} € / post</label>`)}
    ${block('primeClassement', 'Prime classement', 'Bonus si le clipper est dans le top du classement', cfg.primeClassement.enabled, `<label>Top ${num('primeClassement.topN', cfg.primeClassement.topN, 1)}</label><label>Prime ${num('primeClassement.amount', cfg.primeClassement.amount)} €</label>`)}
    ${block('primeRegularite', 'Prime régularité', 'Cadence de posts tenue en moyenne sur la période. Paliers cumulables, montant proratisé sur la fenêtre.', cfg.primeRegularite.enabled,
      `<div style="display:grid;gap:8px;width:100%" id="tiers">${cfg.primeRegularite.tiers.map((t) => `<div class="params tier"><label>≥ ${num('tier.postsPerDay', t.postsPerDay)} posts/jour</label><label>${num('tier.amountPerWeek', t.amountPerWeek)} € / semaine</label><button type="button" class="btn sm" data-del-tier>Retirer</button></div>`).join('')}
      <button type="button" class="btn sm" data-add-tier style="justify-self:start">${icon('plus')} Palier</button></div>`)}
    <div class="sub-label">MALUS & PLAFOND</div>
    ${block('malusStrikes', 'Malus strikes', 'Pénalité appliquée pour chaque strike reçu', cfg.malusStrikes.enabled, `<label>${num('malusStrikes.perStrike', cfg.malusStrikes.perStrike)} € / strike</label>`)}
    <div class="rule"><header><div><b>Plafond</b><small>Montant maximum par clipper et par période (vide = aucun)</small></div></header><div class="params"><label>${num('cap', cfg.cap)} €</label></div></div>`;

  const tabLabel = { universal: 'Barème universel', client: 'Barème agence', clipper: 'Barème clippers' };
  main().innerHTML = `<div class="page-head"><div><h1>Rémunération</h1><p>Barème en cascade · universel → agence → clipper, le plus précis l'emporte</p></div>
    <div class="actions">${agencySelect()}${periodPicker()}</div></div>
    <p class="lock-note">${icon('lock')} Configuration réservée à l'admin : jamais visible côté clipper.</p>
    <div class="stack">
      <div class="card payout"><header><div><h2 style="margin:0;font-size:15px">À verser sur la période</h2><p class="faint" style="margin:2px 0 0;font-size:12px">${esc(periodLabel())} · recalculé en direct sur la performance réelle</p></div>
        <div class="total"><div class="label">Total</div><b class="num">${euro(sum.total)}</b></div></header>
        <div class="payout-grid"><div><small>Base · vues</small><b class="num">+${euro(sum.base)}</b></div><div><small>Primes</small><b class="num" style="color:var(--accent)">+${euro(sum.primes)}</b></div>
          <div><small>Malus strikes</small><b class="num" style="color:var(--red)">${sum.malus ? `−${euro(sum.malus)}` : '—'}</b></div></div></div>
      <div>${segTabs('rtab', Object.entries(tabLabel), REWARD_TAB)}</div>
      <form class="card card-pad stack" id="rule-form" style="gap:10px;max-width:760px">
        <header style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="avatar" style="background:var(--accent-soft);color:var(--accent)">€</span>
          <div style="flex:1"><b>${tabLabel[REWARD_TAB]}</b> ${REWARD_TAB === 'universal' ? '<span class="state-tag">Défaut de l\'agence</span>' : rule?.exists ? '<span class="state-tag on">Surcharge active</span>' : '<span class="state-tag">Hérite du barème universel</span>'}
            <div class="faint" style="font-size:12px">${REWARD_TAB === 'universal' ? "Appliqué à tous les clippers sans barème d'agence ou individuel" : REWARD_TAB === 'client' ? "S'applique aux clippers de l'agence sans barème individuel" : "S'applique uniquement à ce clipper"}</div></div>
          ${REWARD_TAB !== 'universal' ? `<select class="select" data-target>${targets[REWARD_TAB].map((t) => `<option value="${t.id}" ${t.id === targetId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}
        </header>
        ${rule ? editor(rule.config) : `<div class="empty">${REWARD_TAB === 'client' ? 'Crée une agence dans Paramètres.' : 'Aucun clipper.'}</div>`}
        ${rule ? `<footer style="display:flex;justify-content:flex-end;gap:8px">${rule.exists && REWARD_TAB !== 'universal' ? '<button type="button" class="btn danger" data-reset>Supprimer la surcharge</button>' : ''}<button class="btn green" type="submit">Sauvegarder</button></footer>` : ''}
      </form>
      <div class="card"><div class="card-head"><div><h2>Détail par clipper</h2><p>${esc(periodLabel())}</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Clipper</th><th class="r">Vues</th><th class="r">Posts</th><th>Barème</th><th>Détail</th><th class="r">Total</th></tr></thead><tbody>
        ${sum.rows.map((r) => `<tr class="link" data-clipper="${r.id}"><td><div class="who">${avatar(r.username)}<b>${esc(r.username)}</b></div></td><td class="r num">${fmtK(r.views)}</td><td class="r num">${r.posts}</td>
          <td><span class="pill gray">${{ clipper: 'Individuel', client: 'Agence', universal: 'Universel', default: 'Aucun' }[r.source]}</span></td>
          <td class="faint" style="font-size:12px;white-space:normal">${r.reward.details.map((x) => `${esc(x.label)} ${x.amount < 0 ? '−' : '+'}${euro(Math.abs(x.amount))}`).join(' · ') || '—'}</td>
          <td class="r num"><b>${euro(r.reward.total)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucun clipper.</td></tr>'}</tbody></table></div></div>
    </div>`;
  const root = main();
  bindFilters(root, pageRemuneration);
  bindRows($('table', root).closest('.card'));
  onSeg(root, 'rtab', (v) => {
    REWARD_TAB = v;
    pageRemuneration();
  });
  $('[data-target]', root)?.addEventListener('change', (e) => {
    REWARD_TARGET[REWARD_TAB] = Number(e.target.value);
    pageRemuneration();
  });
  const form = $('#rule-form', root);
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-tier]')) {
      const row = document.createElement('div');
      row.className = 'params tier';
      row.innerHTML = `<label>≥ ${num('tier.postsPerDay', 3)} posts/jour</label><label>${num('tier.amountPerWeek', 20)} € / semaine</label><button type="button" class="btn sm" data-del-tier>Retirer</button>`;
      e.target.closest('[data-add-tier]').before(row);
    }
    if (e.target.closest('[data-del-tier]')) e.target.closest('.tier').remove();
    if (e.target.closest('[data-reset]')) {
      api(`/api/rewards/${REWARD_TAB}/${targetId}`, { method: 'DELETE' }).then(() => {
        toast('Surcharge supprimée');
        pageRemuneration();
      });
    }
  });
  form.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      const tag = e.target.closest('.rule')?.querySelector('.state-tag');
      if (tag) {
        tag.classList.toggle('on', e.target.checked);
        tag.textContent = e.target.checked ? 'Actif' : 'Inactif';
      }
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = (n) => Number(form.elements[n]?.value || 0);
    const on = (n) => !!form.elements[n]?.checked;
    const config = {
      base: { enabled: on('base.enabled'), perView: val('base.perView') },
      primeVues: { enabled: on('primeVues.enabled'), threshold: val('primeVues.threshold'), amount: val('primeVues.amount') },
      primePosts: { enabled: on('primePosts.enabled'), minPosts: val('primePosts.minPosts'), perPost: val('primePosts.perPost') },
      primeClassement: { enabled: on('primeClassement.enabled'), topN: val('primeClassement.topN'), amount: val('primeClassement.amount') },
      primeRegularite: {
        enabled: on('primeRegularite.enabled'),
        tiers: $$('.tier', form).map((t) => ({ postsPerDay: Number($('[name="tier.postsPerDay"]', t).value || 0), amountPerWeek: Number($('[name="tier.amountPerWeek"]', t).value || 0) })),
      },
      malusStrikes: { enabled: on('malusStrikes.enabled'), perStrike: val('malusStrikes.perStrike') },
      cap: form.elements.cap.value === '' ? null : val('cap'),
    };
    try {
      await api(`/api/rewards/${REWARD_TAB}/${targetId}`, { method: 'PUT', body: config });
      toast('Barème sauvegardé ✅');
      pageRemuneration();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

async function pageParametres() {
  loading();
  await loadMeta();
  const s = META.settings;
  const b = META.status.bot;
  main().innerHTML = `<div class="page-head"><div><h1>Paramètres</h1><p>Objectifs, alertes et agences</p></div></div>
    <div class="stack">
      <form class="card card-pad stack" id="settings"><div><h2 style="margin:0;font-size:15px">Objectifs & alertes</h2><p class="faint" style="margin:2px 0 0;font-size:12px">Servent au score, aux alertes et aux relances Discord</p></div>
        <div class="grid-form">
          <label class="field"><span>Posts / jour / clipper</span><input class="input num" type="number" min="0" step="0.5" name="postsPerDay" value="${s.postsPerDay}"><small>Objectif de production (score /40)</small></label>
          <label class="field"><span>Vues / jour visées</span><input class="input num" type="number" min="0" step="100" name="viewsPerDay" value="${s.viewsPerDay}"><small>Pour la note Performance max (/30)</small></label>
          <label class="field"><span>Inactif après (jours)</span><input class="input num" type="number" min="1" name="inactivityDays" value="${s.inactivityDays}"><small>Jours sans post avant alerte</small></label>
          <label class="field"><span>Baisse de vues (%)</span><input class="input num" type="number" min="0" max="100" name="dropThresholdPercent" value="${s.dropThresholdPercent}"><small>Seuil d'alerte vs période précédente</small></label>
          <label class="field"><span>Vues min. pour alerter</span><input class="input num" type="number" min="0" name="dropMinPreviousViews" value="${s.dropMinPreviousViews}"><small>Ignore les baisses sur petits volumes</small></label>
        </div><div><button class="btn green">Sauvegarder</button></div></form>
      <div class="card"><div class="card-head"><div><h2>Agences</h2><p>Chaque agence (client) a son salon COMPTES, son forfait et son barème</p></div><button class="btn dark" data-add-client>${icon('plus')} Nouvelle agence</button></div>
        <div class="table-wrap"><table><thead><tr><th>Agence</th><th>Salon COMPTES (ID)</th><th class="r">Forfait mensuel</th><th class="r">Actions</th></tr></thead><tbody>
        ${META.clients.map((c) => `<tr><td><div class="who">${avatar(c.name)}<div><b>${esc(c.name)}</b><small class="faint">${esc(c.slug)}</small></div></div></td>
          <td class="num">${c.discordChannelId ? esc(c.discordChannelId) : '<span class="faint">—</span>'}</td><td class="r num">${euro(c.monthlyFee)}</td>
          <td class="r"><button class="icon-btn" data-edit-client="${c.id}" style="display:inline-grid">${icon('edit')}</button> <button class="icon-btn" data-del-client="${c.id}" style="display:inline-grid">${icon('trash')}</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Aucune agence. Crée-en une ici ou avec /client sur Discord.</td></tr>'}
        </tbody></table></div></div>
      <div class="card card-pad"><h2 style="margin:0 0 8px;font-size:15px">Bot Discord</h2>
        <div class="muted">État : <b>${{ ready: 'connecté', error: 'erreur', connecting: 'connexion…', disabled: 'désactivé' }[b.state]}</b>${b.tag ? ` · ${esc(b.tag)}` : ''}${b.error ? `<div style="color:var(--red)">${esc(b.error)}</div>` : ''}
        ${b.messageContent === false ? '<div style="color:var(--red)">« Message Content Intent » désactivé : le salon COMPTES ne lit pas les liens.</div>' : ''}
        ${b.commandsRegistered ? `<div>${esc(b.commandsRegistered)}</div>` : ''}
        ${(META.status.lastErrors ?? []).length ? `<details style="margin-top:8px"><summary>${META.status.lastErrors.length} erreur(s) récente(s)</summary><ul>${META.status.lastErrors.map((e) => `<li>${ago(e.at)} : ${esc(e.message)}</li>`).join('')}</ul></details>` : ''}</div></div>
    </div>`;
  const root = main();
  $('#settings', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries([...new FormData(e.target)].map(([k, v]) => [k, Number(v)]));
    try {
      await api('/api/settings', { method: 'PUT', body });
      toast('Paramètres sauvegardés ✅');
      loadMeta();
    } catch (err) {
      toast(err.message, true);
    }
  });
  const clientForm = (c = {}) => `<label class="field"><span>Nom</span><input class="input" name="name" required value="${esc(c.name ?? '')}"></label>
    <label class="field"><span>ID du salon COMPTES</span><input class="input num" name="discordChannelId" value="${esc(c.discordChannelId ?? '')}" placeholder="Clic droit sur le salon → Copier l'identifiant"></label>
    <label class="field"><span>Forfait mensuel (€)</span><input class="input num" type="number" min="0" step="1" name="monthlyFee" value="${c.monthlyFee ?? 0}"><small>Sert au « CA généré » de la Vue Agence</small></label>`;
  const payload = (fd) => ({ name: fd.get('name'), discordChannelId: fd.get('discordChannelId') || null, monthlyFee: Number(fd.get('monthlyFee') || 0) });
  $('[data-add-client]', root).addEventListener('click', () =>
    modal('Nouvelle agence', clientForm(), { confirm: 'Créer', onConfirm: async (fd) => { await api('/api/clients', { method: 'POST', body: payload(fd) }); pageParametres(); } }),
  );
  root.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit-client]');
    if (ed) {
      const c = META.clients.find((x) => x.id === Number(ed.dataset.editClient));
      modal(`Modifier ${c.name}`, clientForm(c), { onConfirm: async (fd) => { await api(`/api/clients/${c.id}`, { method: 'PATCH', body: payload(fd) }); pageParametres(); } });
    }
    const del = e.target.closest('[data-del-client]');
    if (del) {
      const c = META.clients.find((x) => x.id === Number(del.dataset.delClient));
      modal('Supprimer l\'agence', `<p style="margin:0">Supprimer <b>${esc(c.name)}</b> ? Ses clippers passent « Sans agence », leurs données sont conservées.</p>`, {
        confirm: 'Supprimer',
        danger: true,
        onConfirm: async () => {
          await api(`/api/clients/${c.id}`, { method: 'DELETE' });
          pageParametres();
        },
      });
    }
  });
}

function pageSoon(title, text) {
  loading();
  main().innerHTML = `<div class="card placeholder">${icon('spark').replace('<svg', '<svg width="36" stroke="#16a34a"')}<h2>${title}</h2><p>${text}</p>
    <p style="margin-top:12px"><span class="pill wait">Phase 2 · recrutement</span></p></div>`;
}

// ---------------------------------------------------------------------------
// Routeur
// ---------------------------------------------------------------------------

const ROUTES = {
  agence: pageAgence,
  clippers: pageClippers,
  clipper: (id) => pageClipper(id),
  classement: pageClassement,
  inspiration: pageInspiration,
  management: pageManagement,
  remuneration: pageRemuneration,
  parametres: pageParametres,
  funnel: () => pageSoon('Funnel', "Parcours complet des candidats : invités → en test → nouveau → apprenti → confirmé, avec les taux de passage d'une étape à l'autre."),
  recruteurs: () => pageSoon('Recruteurs', 'Suivi des recruteurs : candidats invités, tests validés, clippers confirmés et leur rémunération.'),
  suivi: () => pageSoon('Suivi', 'Tests à valider depuis le dashboard, tickets, messages sans réponse, présence aux calls du lundi et clippers à relancer, remontés automatiquement par le bot Discord.'),
};

async function router() {
  const [route, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const page = ROUTES[route] ?? ROUTES.agence;
  renderSidebar();
  window.scrollTo(0, 0);
  try {
    await page(arg);
  } catch (err) {
    main().innerHTML = `<div class="card placeholder"><h2>Oups</h2><p>${esc(err.message)}</p></div>`;
  }
}

window.addEventListener('hashchange', router);
renderTopbar();
loadMeta()
  .catch(() => {})
  .finally(router);
setInterval(() => loadMeta().catch(() => {}), 60_000);
