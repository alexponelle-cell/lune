import type { FanRepo, ItemInput, ShopOrder } from '../db/fans.js';
import type { Clipper, Repo } from '../db/repo.js';
import { parseAccountLinks, type AccountLink } from '../domain/links.js';
import type { AgencyService } from './agency.js';

/** Programme fans (bot Neptune) : les fans clippent, gagnent des points avec leurs vues et les échangent en boutique. */
export interface FanSettings {
  /** Agence (client) à laquelle appartiennent les fans (ex. BeOne). */
  clientId: number | null;
  /** Points gagnés pour 1 000 vues. */
  pointsPer1000: number;
  /** Nom affiché sur l'espace fan. */
  programName: string;
  /** Accroche sous le titre de la page d'accueil. */
  tagline: string;
  /** Image ou vidéo (.mp4) de fond de la page d'accueil. */
  heroMediaUrl: string;
  /** Invitation au serveur Discord (bouton « Rejoindre la communauté »). */
  discordInviteUrl: string;
  /** Contenus mis en avant, une ligne par contenu : « type | titre | lien » (type : video, podcast, best). */
  featured: string;
  /** Chaîne YouTube du créateur (@pseudo) : sa photo HD est utilisée sur le site. */
  creatorYoutube: string;
  /** Pseudo Roblox du créateur : son avatar Roblox est utilisé sur le site. */
  creatorRoblox: string;
}

export const DEFAULT_FANS: FanSettings = {
  clientId: null,
  pointsPer1000: 10,
  programName: 'BEONE REWARDS',
  tagline: 'Fais des vues. Gagne des Coins.',
  heroMediaUrl: '',
  discordInviteUrl: '',
  featured: '',
  creatorYoutube: 'BeOnePourcent',
  creatorRoblox: 'BeOnePourcentt',
};

const FEATURED_KINDS = ['video', 'podcast', 'best'] as const;
type FeaturedKind = (typeof FEATURED_KINDS)[number];

/** « type | titre | lien » → contenu (miniature YouTube déduite du lien). */
export function parseFeatured(text: string): Array<{ kind: FeaturedKind; title: string; url: string; thumbnail: string | null }> {
  return text
    .split('\n')
    .map((line) => line.split('|').map((p) => p.trim()))
    .map((parts) => {
      const url = parts.find((p) => /^https?:\/\//i.test(p));
      if (!url) return null;
      const kind = (FEATURED_KINDS as readonly string[]).includes(parts[0]!.toLowerCase()) ? (parts[0]!.toLowerCase() as FeaturedKind) : 'video';
      const title = parts.find((p) => p !== url && !(FEATURED_KINDS as readonly string[]).includes(p.toLowerCase())) ?? '';
      const yt = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
      return { kind, title, url, thumbnail: yt ? `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` : null };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 24);
}

const LOGIN_TTL = 10 * 60_000;
const SESSION_TTL = 30 * 86_400_000;

export interface FanBalance {
  views: number;
  earned: number;
  spent: number;
  balance: number;
}

export class FanService {
  constructor(
    private readonly repo: Repo,
    readonly fans: FanRepo,
    private readonly agency: AgencyService,
    private readonly publicUrl: string,
    /** Résolution pseudo Roblox → ID (API Roblox), remplaçable en test. */
    private readonly resolveRoblox: (username: string) => Promise<{ id: number; name: string } | null> = robloxLookup,
  ) {}

  settings(): FanSettings {
    return { ...DEFAULT_FANS, ...this.repo.getSetting<Partial<FanSettings>>('fans', {}) };
  }

  saveSettings(patch: Partial<FanSettings>): FanSettings {
    const next = { ...this.settings() };
    if (patch.clientId !== undefined) next.clientId = patch.clientId && this.repo.getClient(patch.clientId) ? patch.clientId : null;
    if (patch.pointsPer1000 !== undefined && Number.isFinite(patch.pointsPer1000) && patch.pointsPer1000 >= 0) next.pointsPer1000 = patch.pointsPer1000;
    if (patch.programName !== undefined && patch.programName.trim()) next.programName = patch.programName.trim().slice(0, 60);
    if (patch.tagline !== undefined) next.tagline = patch.tagline.trim().slice(0, 160);
    const url = (v: string) => (v.trim() === '' || /^https:\/\//i.test(v.trim()) ? v.trim().slice(0, 500) : null);
    if (patch.heroMediaUrl !== undefined && url(patch.heroMediaUrl) !== null) next.heroMediaUrl = url(patch.heroMediaUrl)!;
    if (patch.discordInviteUrl !== undefined && url(patch.discordInviteUrl) !== null) next.discordInviteUrl = url(patch.discordInviteUrl)!;
    if (patch.featured !== undefined) next.featured = patch.featured.slice(0, 5000);
    if (patch.creatorYoutube !== undefined) next.creatorYoutube = patch.creatorYoutube.trim().replace(/^@/, '').slice(0, 60);
    if (patch.creatorRoblox !== undefined) next.creatorRoblox = patch.creatorRoblox.trim().replace(/^@/, '').slice(0, 20);
    this.repo.setSetting('fans', next);
    return next;
  }

  /** Crée le fan au premier /site (rattaché à l'agence du programme). */
  ensureFan(discordId: string, username: string, now = Date.now()): Clipper {
    return this.repo.getClipperByDiscordId(discordId) ?? this.repo.upsertClipper(discordId, username, now, this.settings().clientId);
  }

  loginUrl(clipperId: number, now = Date.now()): string {
    const token = this.fans.createToken(clipperId, 'login', LOGIN_TTL, now);
    return `${this.publicUrl.replace(/\/$/, '')}/fan/login?t=${token}`;
  }

  /** Lien de connexion → session (30 jours). */
  login(token: string, now = Date.now()): string | null {
    const clipperId = this.fans.consumeLogin(token, now);
    return clipperId === null ? null : this.fans.createToken(clipperId, 'session', SESSION_TTL, now);
  }

  /** Connexion « Se connecter avec Discord » : crée le fan au besoin et ouvre une session. */
  loginDiscordUser(discordId: string, username: string, now = Date.now(), avatarUrl: string | null = null): string {
    const fan = this.ensureFan(discordId, username, now);
    if (avatarUrl) this.fans.setAvatar(fan.id, avatarUrl);
    return this.fans.createToken(fan.id, 'session', SESSION_TTL, now);
  }

  clipperFromSession(token: string | undefined, now = Date.now()): Clipper | null {
    if (!token) return null;
    const id = this.fans.sessionClipper(token, now);
    return id === null ? null : (this.repo.getClipper(id) ?? null);
  }

  // --- Points ------------------------------------------------------------------------

  private points(views: number): number {
    return Math.floor((views * this.settings().pointsPer1000) / 1000);
  }

  /** Vues depuis l'inscription (les vues déjà faites avant l'ajout d'un compte ne comptent pas). */
  private viewsByClipper(now = Date.now()): Map<number, number> {
    const rows = this.agency.ranked(this.agency.range({ preset: 'all' }, now), this.settings().clientId ?? undefined, now);
    return new Map(rows.map((r) => [r.clipper.id, r.views]));
  }

  balance(clipperId: number, now = Date.now()): FanBalance {
    const views = this.viewsByClipper(now).get(clipperId) ?? 0;
    const earned = this.points(views);
    const spent = this.fans.spent(clipperId);
    return { views, earned, spent, balance: earned - spent };
  }

  // --- Espace fan --------------------------------------------------------------------

  /** Classement de la semaine (7 derniers jours) : pseudo, avatar, vues, coins gagnés. */
  leaderboard(now = Date.now(), limit = 10) {
    const s = this.settings();
    if (!s.clientId) return [];
    const rows = this.agency
      .ranked(this.agency.range({ preset: '7d' }, now), s.clientId, now)
      .filter((r) => r.views > 0)
      .slice(0, limit);
    const avatars = this.fans.avatars(rows.map((r) => r.clipper.id));
    return rows.map((r, i) => ({ rank: i + 1, id: r.clipper.id, name: r.clipper.username, avatar: avatars.get(r.clipper.id) ?? null, views: r.views, coins: this.points(r.views) }));
  }

  me(clipper: Clipper, now = Date.now()) {
    const s = this.settings();
    const clips = this.fans.clips(clipper.id).map((c) => ({ ...c, coins: this.points(c.gained) }));
    return {
      id: clipper.id,
      avatar: this.fans.avatar(clipper.id),
      clips,
      clipCount: this.fans.clipCount(clipper.id),
      weekRank: this.leaderboard(now, 100).find((r) => r.id === clipper.id)?.rank ?? null,
      programName: s.programName,
      pointsPer1000: s.pointsPer1000,
      username: clipper.username,
      roblox: this.fans.roblox(clipper.id),
      accounts: this.repo.listAccountsForClipper(clipper.id).map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, url: a.url })),
      ...this.balance(clipper.id, now),
      items: this.fans.items({ activeOnly: true }),
      orders: this.fans.orders({ clipperId: clipper.id, limit: 50 }),
    };
  }

  addAccounts(clipper: Clipper, text: string) {
    const links = parseAccountLinks(text);
    if (!links.length) throw new Error('Colle un lien de profil TikTok, Instagram ou YouTube');
    const result = { added: [] as AccountLink[], conflicts: [] as AccountLink[] };
    for (const link of links) {
      const r = this.repo.registerAccount({ clipperId: clipper.id, clientId: clipper.clientId, ...link });
      if (r.conflict) result.conflicts.push(link);
      else result.added.push(link);
    }
    return result;
  }

  removeAccount(clipper: Clipper, accountId: number): void {
    const account = this.repo.listAccountsForClipper(clipper.id).find((a) => a.id === accountId);
    if (!account) throw new Error('Compte introuvable');
    this.repo.deactivateAccount(account.id);
  }

  async linkRoblox(clipper: Clipper, username: string): Promise<{ username: string; userId: number }> {
    const found = await this.resolveRoblox(username.trim());
    if (!found) throw new Error('Pseudo Roblox introuvable');
    const owner = this.fans.clipperByRoblox(found.id);
    if (owner !== null && owner !== clipper.id) throw new Error('Ce compte Roblox est déjà relié à un autre fan');
    this.fans.setRoblox(clipper.id, found.name, found.id);
    return { username: found.name, userId: found.id };
  }

  buy(clipper: Clipper, itemId: number, now = Date.now()): ShopOrder {
    if (!this.fans.roblox(clipper.id).userId) throw new Error("Relie d'abord ton compte Roblox pour recevoir l'objet en jeu");
    return this.fans.placeOrder(clipper.id, itemId, this.balance(clipper.id, now).earned, now);
  }

  // --- Photos HD du créateur (YouTube + Roblox), mises en cache 12 h -----------------

  private avatarCache: { key: string; at: number; urls: { youtube: string | null; roblox: string | null } } | null = null;
  /** Dernière erreur de récupération des photos (affichée dans le dashboard). */
  avatarErrors: { youtube: string | null; roblox: string | null } = { youtube: null, roblox: null };

  async creatorAvatars(youtubeApiKey: string | undefined, now = Date.now()) {
    const s = this.settings();
    const key = `${s.creatorYoutube}|${s.creatorRoblox}`;
    if (this.avatarCache && this.avatarCache.key === key && now - this.avatarCache.at < 12 * 3_600_000) return this.avatarCache.urls;
    const safe = async <T>(which: 'youtube' | 'roblox', fn: () => Promise<T>) => {
      try {
        const v = await fn();
        this.avatarErrors[which] = v ? null : this.avatarErrors[which] ?? 'introuvable';
        return v;
      } catch (err) {
        this.avatarErrors[which] = err instanceof Error ? err.message : String(err);
        return null;
      }
    };
    this.avatarErrors = { youtube: null, roblox: null };
    if (!youtubeApiKey) this.avatarErrors.youtube = 'YOUTUBE_API_KEY absente';
    const youtube = s.creatorYoutube && youtubeApiKey
      ? await safe('youtube', async () => {
          const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent('@' + s.creatorYoutube)}&key=${youtubeApiKey}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          const r = (await res.json()) as { items?: Array<{ snippet: { thumbnails: Record<string, { url: string }> } }>; error?: { message?: string } };
          if (!res.ok) throw new Error(`YouTube HTTP ${res.status} : ${r.error?.message ?? ''}`);
          if (!r.items?.length) throw new Error(`chaîne @${s.creatorYoutube} introuvable`);
          const t = r.items?.[0]?.snippet.thumbnails;
          const best = t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null;
          return best ? best.replace(/=s\d+/, '=s800') : null;
        })
      : null;
    const roblox = s.creatorRoblox
      ? await safe('roblox', async () => {
          const user = await this.resolveRoblox(s.creatorRoblox);
          if (!user) throw new Error(`pseudo Roblox ${s.creatorRoblox} introuvable`);
          const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new Error(`Roblox miniatures HTTP ${res.status}`);
          const r = (await res.json()) as { data?: Array<{ imageUrl?: string; state?: string }> };
          const d = r.data?.[0];
          if (!(d?.state === 'Completed' && d.imageUrl)) throw new Error(`miniature Roblox pas prête (${d?.state ?? 'vide'})`);
          return d.imageUrl;
        })
      : null;
    // Échec (réseau, API) : on réessaie dans 10 min au lieu de 12 h
    this.avatarCache = { key, at: youtube || roblox ? now : now - 12 * 3_600_000 + 10 * 60_000, urls: { youtube, roblox } };
    return this.avatarCache.urls;
  }

  // --- Page publique (accueil de la communauté) --------------------------------------

  /** Données visibles sans connexion : chiffres de la communauté, contenus, clips, boutique. */
  publicPage(now = Date.now()) {
    const s = this.settings();
    const fans = s.clientId ? this.repo.listClippers({ clientId: s.clientId }) : [];
    const ids = fans.map((f) => f.id);
    const views = this.viewsByClipper(now);
    const week = this.repo.videosPublished(now - 7 * 86_400_000, now, ids);
    const clips = this.repo
      .videosPublished(now - 30 * 86_400_000, now, ids)
      .filter((v) => v.url)
      .sort((a, b) => b.views - a.views)
      .slice(0, 8)
      .map((v) => ({ platform: v.platform, url: v.url, title: v.title, thumbnail: v.thumbnailUrl, views: v.views }));
    const allClips = this.repo.videosPublished(0, now, ids).length;
    return {
      programName: s.programName,
      tagline: s.tagline,
      heroMediaUrl: s.heroMediaUrl,
      discordInviteUrl: s.discordInviteUrl,
      pointsPer1000: s.pointsPer1000,
      stats: {
        members: fans.length,
        active: new Set(week.map((v) => v.clipperId)).size,
        clips: allClips,
        rewards: this.fans.orders({ status: 'delivered', limit: 100_000 }).length,
        views: ids.reduce((sum, id) => sum + (views.get(id) ?? 0), 0),
      },
      featured: parseFeatured(s.featured),
      clips,
      items: this.fans.items({ activeOnly: true }),
      leaderboard: this.leaderboard(now).map(({ id: _id, ...r }) => r),
    };
  }

  // --- Staff -------------------------------------------------------------------------

  overview(now = Date.now()) {
    const s = this.settings();
    const views = this.viewsByClipper(now);
    const spent = this.fans.spentByClipper();
    const clippers = s.clientId ? this.repo.listClippers({ clientId: s.clientId, includeInactive: true }) : [];
    const fans = clippers
      .map((c) => {
        const v = views.get(c.id) ?? 0;
        const earned = this.points(v);
        const sp = spent.get(c.id) ?? 0;
        const accounts = this.repo.listAccountsForClipper(c.id).map((a) => ({ platform: a.platform, handle: a.handle }));
        return { id: c.id, username: c.username, joinedAt: c.createdAt, avatar: this.fans.avatar(c.id), roblox: this.fans.roblox(c.id).username, accounts, views: v, earned, spent: sp, balance: earned - sp };
      })
      .sort((a, b) => b.views - a.views);
    const names = new Map(clippers.map((c) => [c.id, c.username]));
    const orders = this.fans.orders({ limit: 200 }).map((o) => ({
      ...o,
      username: names.get(o.clipperId) ?? this.repo.getClipper(o.clipperId)?.username ?? '?',
      roblox: this.fans.roblox(o.clipperId).username,
    }));
    return { settings: s, clients: this.repo.listClients().map((c) => ({ id: c.id, name: c.name })), fans, items: this.fans.items(), orders };
  }

  saveItem(id: number | null, input: ItemInput) {
    if (id === null) return this.fans.createItem(input);
    const item = this.fans.updateItem(id, input);
    if (!item) throw new Error('Objet introuvable');
    return item;
  }
}

/** Pseudo Roblox → ID via l'API publique Roblox. */
async function robloxLookup(username: string): Promise<{ id: number; name: string } | null> {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return null;
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Roblox ne répond pas (HTTP ${res.status}), réessaie dans un instant`);
  const body = (await res.json()) as { data?: Array<{ id: number; name: string }> };
  const u = body.data?.[0];
  return u ? { id: u.id, name: u.name } : null;
}
