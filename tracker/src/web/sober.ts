import type { CreatorConfig } from '../creators/index.js';
import { PROSPECTS } from '../creators/prospects.js';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
/** Polices Google à graisse unique (une demande de graisses 400 à 800 serait refusée). */
const SINGLE_WEIGHT = /^(Lilita One|Luckiest Guy|Bowlby One|Bungee)$/;

/** Site fans « sober » / « pop » : couleurs, police et titre injectés côté serveur (pas de flash avant le chargement des données). */
export function soberPage(template: string, cr: CreatorConfig, title: string): string {
  const k = cr.colors;
  const vars = `--bg:${k.bg};--card:${k.card};--line:${k.border};--text:${k.text};--muted:${k.muted};--accent:${k.accent};--accent-ink:${k.accentInk};--accent2:${k.accent2 ?? k.accent};--accent3:${k.accent3 ?? k.accent};${k.highlight ? `--violet:${k.highlight};--spark1:${k.highlight};` : ''}`;
  const font = (cr.font ?? 'Outfit').replace(/[^A-Za-z0-9 ]/g, '');
  return template
    .replaceAll('__TITLE__', esc(title))
    .replace('/*__VARS__*/', vars)
    .replace('__BG__', k.bg)
    .replace('__FONTQ__', font.replace(/ /g, '+') + (SINGLE_WEIGHT.test(font) ? '' : ':wght@400;500;600;700;800'))
    .replace('__FONT__', font)
    .replace('<body>', cr.style === 'ms' ? '<body class="ms">' : cr.theme === 'pop' ? `<body class="pop${cr.style === 'sticker' ? ' sticker' : ''}">` : '<body>')
    // Style « ms » : polices de titres de la charte Merguez Superstar
    .replace('</head>', cr.style === 'ms' ? '<link href="https://fonts.googleapis.com/css2?family=Passion+One:wght@400;700&family=Cal+Sans&display=swap" rel="stylesheet">\n</head>' : '</head>');
}

const DEMO_NAMES = ['kenzo.clips', 'lea_edits', 'nathan.cut', 'ines.shorts', 'yanis_clipz', 'sarah.mp4', 'tom.reels', 'maelle_cut'];

/** Données d'exemple d'une maquette prospect (même forme que /api/fan/public). */
export function demoPublic(cr: CreatorConfig, rewardImage: string) {
  const views = [184_000, 142_500, 97_300, 71_800, 52_400, 38_900, 21_600, 12_300];
  return {
    creator: cr,
    programName: cr.programName,
    pointsPer1000: cr.pointsPer1000,
    discordInviteUrl: null,
    clips: [],
    featured: [],
    items: cr.reward ? [{ id: 1, ref: cr.reward.ref, name: cr.reward.name, description: cr.reward.description, price: cr.reward.price, stock: null, imageUrl: rewardImage || null }] : [],
    leaderboard: DEMO_NAMES.map((name, i) => ({ rank: i + 1, name, avatar: null, views: views[i]!, coins: Math.floor((views[i]! / 1000) * cr.pointsPer1000) })),
  };
}

const DEMO_TAG = '<span style="position:fixed;top:76px;right:14px;z-index:50;background:var(--accent);color:var(--accent-ink);border:2px solid var(--line);border-radius:99px;padding:5px 12px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Maquette</span>';

/** Maquette prospect /demo/<slug> : le vrai site fans à sa charte, données d'exemple, connexion désactivée. url(fichier) = adresse d'un visuel. */
export function demoPage(template: string, slug: string, url: (file: string) => string): string | undefined {
  const p = PROSPECTS[slug];
  if (!p) return undefined;
  const a = (f: string | undefined) => (f ? url(f) : '');
  const cr: CreatorConfig = { ...p.config, images: { banner: p.banner, reward: p.config.style === 'sticker' ? p.reward : undefined } };
  const data = JSON.stringify(demoPublic(cr, a(p.reward))).replace(/</g, '\\u003c');
  return soberPage(template, cr, cr.programName)
    .replaceAll('/fan/assets/creator.png', a(p.photo))
    .replaceAll('/fan/assets/hero-banner', a(p.banner))
    .replaceAll('/fan/assets/reward', a(p.reward))
    .replaceAll('/fan/auth/discord', '#/')
    .replace('</body>', `${DEMO_TAG}</body>`)
    .replace('<script>\ndocument', `<script>window.__DEMO__ = ${data};</script>\n<script>\ndocument`);
}
