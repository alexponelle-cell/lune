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
}

export const DEFAULT_FANS: FanSettings = { clientId: null, pointsPer1000: 10, programName: 'Programme clippeurs' };

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
  loginDiscordUser(discordId: string, username: string, now = Date.now()): string {
    const fan = this.ensureFan(discordId, username, now);
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

  me(clipper: Clipper, now = Date.now()) {
    const s = this.settings();
    return {
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
        return { id: c.id, username: c.username, roblox: this.fans.roblox(c.id).username, views: v, earned, spent: sp, balance: earned - sp };
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
