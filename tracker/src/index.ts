import { type Bot, startBot } from './bot/index.js';
import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { Repo } from './db/repo.js';
import { collectAll } from './jobs/collect.js';
import { runRelances } from './jobs/relance.js';
import { every } from './jobs/scheduler.js';
import { log } from './log.js';
import { createFetchers } from './platforms/index.js';
import { Analytics } from './services/analytics.js';
import { createApp, startWeb } from './web/server.js';

const db = openDatabase(config.DATABASE_PATH);
const repo = new Repo(db);
const analytics = new Analytics(repo);
const fetchers = createFetchers(config);
const dashboardUrl = process.env.PUBLIC_URL ?? `http://localhost:${config.WEB_PORT}`;

const stopWeb = startWeb(createApp({ repo, analytics, password: config.DASHBOARD_PASSWORD }), config.WEB_PORT);
log.info(`dashboard sur ${dashboardUrl} (données : ${config.FETCHER_MODE})`);

let bot: Bot | undefined;
if (config.DISCORD_TOKEN) {
  bot = await startBot({ token: config.DISCORD_TOKEN, repo, analytics, dashboardUrl });
} else {
  log.warn('DISCORD_TOKEN absent : bot désactivé, seuls le site et la collecte tournent');
}

const stopCollect = every('collecte', config.COLLECT_INTERVAL_MINUTES, () => collectAll(repo, fetchers));
const stopRelance = bot
  ? every('relances', config.RELANCE_CHECK_INTERVAL_MINUTES, async () => ({
      envoyées: await runRelances(repo, analytics, bot.notifier, {
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
