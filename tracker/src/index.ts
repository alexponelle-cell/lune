import { type Bot, startBot } from './bot/index.js';
import { registerCommands } from './bot/register.js';
import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { Repo } from './db/repo.js';
import { collectAll } from './jobs/collect.js';
import { runRelances } from './jobs/relance.js';
import { every } from './jobs/scheduler.js';
import { log } from './log.js';
import { createFetchers } from './platforms/index.js';
import { AgencyService } from './services/agency.js';
import { Analytics } from './services/analytics.js';
import { status } from './status.js';
import { createApp, startWeb } from './web/server.js';

// Une erreur imprévue est journalisée au lieu de faire tomber le bot.
process.on('unhandledRejection', (err) => log.error('promesse rejetée non gérée', err));
process.on('uncaughtException', (err) => log.error('exception non gérée', err));

log.info(`démarrage (bot: ${config.DISCORD_TOKEN ? 'oui' : 'non'}, serveur: ${config.DISCORD_GUILD_ID ?? 'global'}, données: ${config.FETCHER_MODE})`);
const db = openDatabase(config.DATABASE_PATH);
const repo = new Repo(db);
const analytics = new Analytics(repo);
const fetchers = createFetchers(config);
const dashboardUrl = config.PUBLIC_URL ?? `http://localhost:${config.WEB_PORT}`;

const agency = new AgencyService(repo, {
  inactivityDays: config.INACTIVITY_DAYS,
  dropThresholdPercent: config.DROP_THRESHOLD_PERCENT,
  dropMinPreviousViews: config.DROP_MIN_PREVIOUS_VIEWS,
});
const botHolder: { current?: Bot['bridge'] } = {};

const stopWeb = startWeb(createApp({ repo, agency, password: config.DASHBOARD_PASSWORD, bot: botHolder }), config.WEB_PORT);
log.info(`dashboard sur ${dashboardUrl} (données : ${config.FETCHER_MODE})`);
if (!config.DASHBOARD_PASSWORD) log.warn('DASHBOARD_PASSWORD absent : le dashboard est accessible sans mot de passe');

let bot: Bot | undefined;
if (config.DISCORD_TOKEN) {
  if (config.DISCORD_CLIENT_ID) {
    try {
      const result = await registerCommands({
        token: config.DISCORD_TOKEN,
        clientId: config.DISCORD_CLIENT_ID,
        guildId: config.DISCORD_GUILD_ID,
      });
      status.bot.commandsRegistered = result;
      log.info(result);
    } catch (err) {
      log.error('enregistrement des slash commands', err);
    }
  } else {
    log.warn('DISCORD_CLIENT_ID absent : slash commands non enregistrées');
  }
  try {
    bot = await startBot({ token: config.DISCORD_TOKEN, repo, analytics, agency, dashboardUrl, guildId: config.DISCORD_GUILD_ID });
    botHolder.current = bot.bridge;
  } catch (err) {
    // Le site reste en ligne pour afficher l'erreur sur le dashboard.
    const httpStatus = (err as { status?: number }).status;
    const message = err instanceof Error ? err.message : String(err);
    status.bot = { ...status.bot, state: 'error', error: httpStatus ? `${message} (HTTP ${httpStatus})` : message };
    log.error('connexion du bot impossible', err);
  }
} else {
  log.warn('DISCORD_TOKEN absent : bot désactivé, seuls le site et la collecte tournent');
}

const stopCollect = every('collecte', config.COLLECT_INTERVAL_MINUTES, () => collectAll(repo, fetchers));
const notifier = bot?.notifier;
const stopRelance = notifier
  ? every('relances', config.RELANCE_CHECK_INTERVAL_MINUTES, async () => ({
      envoyées: await runRelances(repo, analytics, notifier, {
        inactivityDays: config.INACTIVITY_DAYS,
        dropWindowDays: config.DROP_WINDOW_DAYS,
        dropThresholdPercent: config.DROP_THRESHOLD_PERCENT,
        dropMinPreviousViews: config.DROP_MIN_PREVIOUS_VIEWS,
        cooldownHours: config.RELANCE_COOLDOWN_HOURS,
      }),
    }))
  : () => {};

async function shutdown() {
  log.info('arrêt…');
  stopCollect();
  stopRelance();
  stopWeb();
  await bot?.stop();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
