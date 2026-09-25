import type { Repo } from '../db/repo.js';
import type { FetcherRegistry } from '../platforms/types.js';
import { log } from '../log.js';

export interface CollectResult {
  ok: number;
  failed: number;
}

/** Récupère les stats de tous les comptes actifs et enregistre une capture pour chacun. */
export async function collectAll(repo: Repo, fetchers: FetcherRegistry, now: () => number = Date.now): Promise<CollectResult> {
  const result: CollectResult = { ok: 0, failed: 0 };
  for (const account of repo.listActiveAccounts()) {
    try {
      const fetched = await fetchers[account.platform].fetchAccount(account);
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
