import type { Account, Repo } from '../db/repo.js';
import type { FetcherRegistry } from '../platforms/types.js';
import { log } from '../log.js';

export interface CollectResult {
  ok: number;
  failed: number;
}

/**
 * Récupère les stats de tous les comptes actifs et enregistre une capture pour chacun.
 * `skip` permet d'espacer certains comptes (ex. les fans : 1 fois par jour, pour limiter le coût d'Apify).
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
      repo.markAccountChecked(account.id, at, { externalId: fetched.externalId, displayName: fetched.displayName });
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
