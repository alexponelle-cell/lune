import type { Clipper, Repo } from '../db/repo.js';
import { evaluateRelance, type RelanceReason, relanceMessage, type RelanceRules } from '../domain/relance.js';
import { HOUR } from '../domain/stats.js';
import { log } from '../log.js';
import type { Analytics } from '../services/analytics.js';

/** Canal de sortie des relances (le bot Discord en prod, un faux en test). */
export interface Notifier {
  relance(clipper: Clipper, reason: RelanceReason, message: string): Promise<void>;
}

export interface RelanceSettings extends RelanceRules {
  dropWindowDays: number;
  cooldownHours: number;
  /** Agences sans relances (ex. les fans du programme Neptune). */
  skipClientIds?: readonly number[];
}

export async function runRelances(
  repo: Repo,
  analytics: Analytics,
  notifier: Notifier,
  settings: RelanceSettings,
  now = Date.now(),
): Promise<number> {
  let sent = 0;
  for (const clipper of repo.listActiveClippers()) {
    if (clipper.clientId !== null && settings.skipClientIds?.includes(clipper.clientId)) continue;
    const activity = analytics.activity(clipper, settings.dropWindowDays, now);
    for (const reason of evaluateRelance(activity, settings, now)) {
      const last = repo.lastRelanceAt(clipper.id, reason.kind);
      if (last !== null && now - last < settings.cooldownHours * HOUR) continue;
      const message = relanceMessage(reason, clipper.id + now);
      try {
        await notifier.relance(clipper, reason, message);
        repo.logRelance(clipper.id, reason.kind, message, now);
        sent++;
      } catch (err) {
        log.warn(`relance ${clipper.username} (${reason.kind}) non envoyée: ${String(err)}`);
      }
    }
  }
  return sent;
}
