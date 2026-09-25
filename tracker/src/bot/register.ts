import { REST, Routes } from 'discord.js';
import { commandDefinitions } from './commands.js';

/**
 * Enregistre les slash commands auprès de Discord. Appelé automatiquement au démarrage du bot.
 * Avec un guildId, les commandes apparaissent instantanément sur ce serveur ;
 * sans, elles sont globales (jusqu'à 1 h de propagation).
 */
export async function registerCommands(opts: { token: string; clientId: string; guildId?: string }): Promise<string> {
  const rest = new REST().setToken(opts.token);
  const route = opts.guildId
    ? Routes.applicationGuildCommands(opts.clientId, opts.guildId)
    : Routes.applicationCommands(opts.clientId);
  await rest.put(route, { body: commandDefinitions });
  return `${commandDefinitions.length} commandes enregistrées ${opts.guildId ? `sur le serveur ${opts.guildId}` : 'globalement'}`;
}
