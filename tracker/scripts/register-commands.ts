/** Enregistre les slash commands à la main : `npm run register-commands` (le bot le fait aussi au démarrage). */
import { registerCommands } from '../src/bot/register.js';
import { config } from '../src/config.js';

if (!config.DISCORD_TOKEN || !config.DISCORD_CLIENT_ID) {
  console.error('DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis.');
  process.exit(1);
}

console.log(
  await registerCommands({ token: config.DISCORD_TOKEN, clientId: config.DISCORD_CLIENT_ID, guildId: config.DISCORD_GUILD_ID }),
);
