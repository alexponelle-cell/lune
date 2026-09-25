import type { Client, Repo } from '../db/repo.js';
import { type AccountLink, parseAccountLinks } from '../domain/links.js';

export interface ComptesResult {
  added: AccountLink[];
  alreadyTracked: AccountLink[];
  conflicts: Array<{ link: AccountLink; owner: string }>;
}

/**
 * Logique du salon COMPTES, indépendante de discord.js pour être testable :
 * un clipper poste ses liens TikTok / Insta / YouTube, on les rattache à lui et au client du salon.
 */
export function registerAccountsFromMessage(
  repo: Repo,
  client: Client,
  author: { discordId: string; username: string },
  content: string,
  now = Date.now(),
): ComptesResult | null {
  const links = parseAccountLinks(content);
  if (links.length === 0) return null;

  const clipper = repo.upsertClipper(author.discordId, author.username, now);
  const result: ComptesResult = { added: [], alreadyTracked: [], conflicts: [] };
  for (const link of links) {
    const r = repo.registerAccount({ clipperId: clipper.id, clientId: client.id, ...link, now });
    if (r.conflict) result.conflicts.push({ link, owner: r.conflict.username });
    else if (r.created) result.added.push(link);
    else result.alreadyTracked.push(link);
  }
  return result;
}

export function formatComptesReply(result: ComptesResult): string {
  const line = (l: AccountLink) => `${l.platform} @${l.handle}`;
  const parts: string[] = [];
  if (result.added.length) parts.push(`✅ Suivi activé : ${result.added.map(line).join(', ')}`);
  if (result.alreadyTracked.length) parts.push(`ℹ️ Déjà suivi : ${result.alreadyTracked.map(line).join(', ')}`);
  for (const c of result.conflicts) parts.push(`⛔ ${line(c.link)} est déjà enregistré par **${c.owner}** — contacte un admin.`);
  return parts.join('\n');
}
