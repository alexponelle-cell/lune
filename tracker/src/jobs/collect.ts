import type { Account, Repo } from '../db/repo.js';
import type { FetcherRegistry } from '../platforms/types.js';
import { log } from '../log.js';

export interface CollectResult {
  ok: number;
  failed: number;
}

/**
 * Récupère les stats de tous les comptes actifs et enregistre une capture pour chacun.
 * `skip` permet d'espacer certains comptes (ex. les fans : 1 fois par nuit, après minuit, pour limiter le coût d'Apify).
 */
export async function collectAll(
  repo: Repo,
  fetchers: FetcherRegistry,
  now: () => number = Date.now,
  skip: (account: Account, now: number) => boolean = () => false,
): Promise<CollectResult> {
  const result: CollectResult = { ok: 0, failed: 0 };
  for (const account of repo.listActiveAccounts()) {
    if (skip(account, now())) continue;
    try {
      const fetched = await fetchers[account.platform].fetchAccount(account);
      // Un même compte ne peut être suivi qu'une fois (ex. @pseudo et /channel/UC… sur YouTube, ou pseudo changé) :
      // le plus récent est désactivé, pour ne jamais compter les vues deux fois.
      const dup = fetched.externalId ? repo.findDuplicateAccount(account.platform, fetched.externalId, account.id) : undefined;
      if (dup && dup.id < account.id) {
        const owner = repo.getClipper(dup.clipperId)?.username ?? '?';
        repo.deactivateAccount(account.id);
        repo.markAccountChecked(account.id, now(), { externalId: fetched.externalId, error: `Doublon : ce compte est déjà suivi (@${dup.handle}, ${owner})` });
        log.warn(`collect ${account.platform}/${account.handle} : doublon de @${dup.handle} (${owner}), désactivé`);
        result.failed++;
        continue;
      }
      const at = now();
      const snap = repo.recordCollection(account.id, fetched.videos, at);
      repo.markAccountChecked(account.id, at, { externalId: fetched.externalId, displayName: fetched.displayName, followers: fetched.followers });
      log.debug(`collect ${account.platform}/${account.handle}: ${snap.totalViews} vues`);
      result.ok++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      repo.markAccountChecked(account.id, now(), { error: message });
      log.warn(`collect ${account.platform}/${account.handle} a échoué: ${message}`);
      result.failed++;
    }
  }
  return result;
}

/** Minuit (heure de Paris) du jour de `now` : les comptes des fans sont relevés une fois par nuit, juste après. */
export function parisMidnight(now: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const wall = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  const offset = wall - Math.floor(now / 1000) * 1000;
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!) - offset;
}

const DAY = 86_400_000;

/**
 * Économie Apify (TikTok pas connecté et Instagram sont payants à l'usage ; YouTube et TikTok connecté sont gratuits).
 * Compte de fan payant : relu toutes les 2 nuits ; sans nouvelle vidéo depuis 14 jours, 1 fois par semaine ;
 * sans aucune vidéo, toutes les 2 semaines. Gratuit : chaque nuit. Jamais relu : tout de suite.
 */
export function fanAccountDue(account: { platform: string; lastCheckedAt: number | null }, lastPublished: number | null | undefined, since: number, now: number, free = false): boolean {
  if (account.lastCheckedAt === null) return true;
  if (account.lastCheckedAt >= since) return false;
  if (free || account.platform === 'youtube') return true;
  const age = now - account.lastCheckedAt + 3_600_000; // 1 h de marge (le relevé ne tombe pas pile à la même heure)
  if (lastPublished == null) return age >= 14 * DAY;
  if (now - lastPublished > 14 * DAY) return age >= 7 * DAY;
  return age >= 2 * DAY;
}

/** Compte relu via Apify (payant) ? YouTube et TikTok connecté sont gratuits. */
export const paidAccount = (account: { id: number; platform: string }, connected: Set<number>) =>
  account.platform === 'instagram' || (account.platform === 'tiktok' && !connected.has(account.id));
