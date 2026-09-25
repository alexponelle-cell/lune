/** Enregistre les slash commands auprès de Discord : `npm run register-commands`. */
import { REST, Routes } from 'discord.js';
import { config } from '../config.js';
import { commandDefinitions } from './commands.js';

if (!config.DISCORD_TOKEN || !config.DISCORD_CLIENT_ID) {
  console.error('DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis.');
  process.exit(1);
}

const rest = new REST().setToken(config.DISCORD_TOKEN);
const route = config.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

await rest.put(route, { body: commandDefinitions });
console.log(
  `${commandDefinitions.length} commandes enregistrées ${config.DISCORD_GUILD_ID ? `sur le serveur ${config.DISCORD_GUILD_ID}` : 'globalement'}.`,
);
