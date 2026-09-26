import { REST, Routes } from 'discord.js';
import { commandDefinitions } from './commands.js';
import { fanCommandDefinitions } from './fans.js';
import { recruitmentCommandDefinitions } from './recruitment.js';

/**
 * Enregistre les slash commands auprès de Discord. Appelé automatiquement au démarrage du bot.
 * Avec un guildId, les commandes apparaissent instantanément sur ce serveur ;
 * sans, elles sont globales (jusqu'à 1 h de propagation).
 */
export async function registerCommands(opts: { token: string; clientId: string; guildId?: string; withFans?: boolean }): Promise<string> {
  const rest = new REST().setToken(opts.token);
  const route = opts.guildId
    ? Routes.applicationGuildCommands(opts.clientId, opts.guildId)
    : Routes.applicationCommands(opts.clientId);
  const body = [...commandDefinitions, ...recruitmentCommandDefinitions, ...(opts.withFans ? fanCommandDefinitions : [])];
  await rest.put(route, { body });
  return `${body.length} commandes enregistrées ${opts.guildId ? `sur le serveur ${opts.guildId}` : 'globalement'}`;
}
