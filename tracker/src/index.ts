import { type Bot, startBot } from './bot/index.js';
import { registerCommands } from './bot/register.js';
import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { Repo } from './db/repo.js';
import { collectAll, fanAccountDue, paidAccount, parisMidnight } from './jobs/collect.js';
import { InstagramOfficialFetcher, InstagramTokenStore } from './platforms/instagramOfficial.js';
import { TikTokOfficialFetcher, TikTokTokenStore, tiktokSiteVerification } from './platforms/tiktokOfficial.js';
import { runRelances } from './jobs/relance.js';
import { every } from './jobs/scheduler.js';
import { log } from './log.js';
import { createFetchers } from './platforms/index.js';
import { FanRepo } from './db/fans.js';
import { RecruitmentRepo } from './db/recruitment.js';
import { startFansBot } from './bot/fans.js';
import { FanService } from './services/fans.js';
import { creatorConfig } from './creators/index.js';
import { AgencyService } from './services/agency.js';
import { deliverPendingOrders, GameClient } from './services/game.js';
import { deliverEmailOrders, EmailGrantClient } from './services/emailGrant.js';
import { RecruitmentService } from './services/recruitment.js';
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
// Apify facture chaque vidéo lue : 10 vidéos par compte pour l'agence, 5 pour les fans
const fetchers = createFetchers({ ...config, VIDEOS_PER_ACCOUNT: Math.min(10, config.VIDEOS_PER_ACCOUNT) });
const fanFetchers = createFetchers({ ...config, VIDEOS_PER_ACCOUNT: Math.min(5, config.VIDEOS_PER_ACCOUNT) });
const dashboardUrl = config.PUBLIC_URL ?? `http://localhost:${config.WEB_PORT}`;
// TikTok connecté par le clippeur (API officielle gratuite) ; les autres comptes TikTok restent sur Apify
const tiktokCreds = config.TIKTOK_CLIENT_KEY && config.TIKTOK_CLIENT_SECRET ? { clientKey: config.TIKTOK_CLIENT_KEY, clientSecret: config.TIKTOK_CLIENT_SECRET } : undefined;
const tiktokStore = new TikTokTokenStore(db);
if (tiktokCreds && config.FETCHER_MODE === 'live') {
  fetchers.tiktok = new TikTokOfficialFetcher(tiktokStore, tiktokCreds, config.VIDEOS_PER_ACCOUNT, fetchers.tiktok);
  fanFetchers.tiktok = new TikTokOfficialFetcher(tiktokStore, tiktokCreds, 40, config.TIKTOK_APIFY_FALLBACK === '1' ? fanFetchers.tiktok : undefined);
}
// Instagram connecté par le clippeur (API officielle gratuite, compte pro / créateur) ; les autres restent sur Apify
const instagramCreds = config.INSTAGRAM_APP_ID && config.INSTAGRAM_APP_SECRET ? { appId: config.INSTAGRAM_APP_ID, appSecret: config.INSTAGRAM_APP_SECRET } : undefined;
const instagramStore = new InstagramTokenStore(db);
if (instagramCreds && config.FETCHER_MODE === 'live') {
  fetchers.instagram = new InstagramOfficialFetcher(instagramStore, config.VIDEOS_PER_ACCOUNT, fetchers.instagram);
  fanFetchers.instagram = new InstagramOfficialFetcher(instagramStore, 15, config.INSTAGRAM_APIFY_FALLBACK === '1' ? fanFetchers.instagram : undefined);
}
/** Comptes connectés officiellement (TikTok + Instagram) : relus gratuitement. */
const connectedAccounts = () => new Set([...tiktokStore.connected(), ...instagramStore.connected()]);

const agency = new AgencyService(repo, {
  inactivityDays: config.INACTIVITY_DAYS,
  dropThresholdPercent: config.DROP_THRESHOLD_PERCENT,
  dropMinPreviousViews: config.DROP_MIN_PREVIOUS_VIEWS,
});
const recruitment = new RecruitmentService(repo, new RecruitmentRepo(db), agency);
const creator = creatorConfig(config.CREATOR);
const fans = new FanService(repo, new FanRepo(db), agency, dashboardUrl, undefined, creator);
// Lecture des bios à la demande (vérification des comptes par code)
fans.fetchers = fetchers;
const officialPlatforms = [...(tiktokCreds ? (['tiktok'] as const) : []), ...(instagramCreds ? (['instagram'] as const) : [])];
if (officialPlatforms.length) fans.officialLogin = { platforms: officialPlatforms, connected: connectedAccounts };
fans.bootstrap();
log.info(`programme fans : ${creator.programName} (${creator.id})`);
const botHolder: { current?: Bot['bridge'] } = {};
// API du jeu Roblox (serveur du dev du jeu) : catalogue + livraison des achats
const game = config.GAME_API_URL && config.GAME_API_TOKEN ? new GameClient(config.GAME_API_URL, config.GAME_API_TOKEN) : undefined;

// Relevé manuel des fans depuis Mars (1 fois par heure max : chaque relevé coûte des appels Apify)
let fanRefresh: { running: boolean; lastAt: number } = { running: false, lastAt: 0 };
const refreshFans = () => {
  const fanClient = fans.settings().clientId;
  if (fanClient === null) return { started: false, message: 'Aucune agence de fans réglée.' };
  if (fanRefresh.running) return { started: false, message: 'Un relevé est déjà en cours, patiente quelques minutes.' };
  const wait = fanRefresh.lastAt + 3_600_000 - Date.now();
  if (wait > 0) return { started: false, message: `Dernier relevé il y a moins d'une heure : réessaie dans ${Math.ceil(wait / 60_000)} min.` };
  fanRefresh = { running: true, lastAt: Date.now() };
  const startedAt = Date.now();
  const last = repo.lastPublishedByAccount();
  const free = connectedAccounts();
  // Relevé manuel : seulement les comptes gratuits (YouTube, TikTok connecté) et ceux jamais relus, pour ne rien payer en plus
  void collectAll(repo, fanFetchers, Date.now, (account) => account.clientId !== fanClient || (account.lastCheckedAt !== null && (paidAccount(account, free) || account.lastCheckedAt >= startedAt - 10 * 60_000)))
    .then((r) => log.info(`relevé manuel des fans : ${r.ok} ok, ${r.failed} échecs`))
    .catch((err) => log.warn(`relevé manuel des fans a échoué: ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => (fanRefresh.running = false));
  return { started: true, message: 'Relevé lancé (YouTube et TikTok connectés, gratuits) : les vues et les coins se mettent à jour dans les prochaines minutes. Instagram et TikTok non connectés suivent leur rythme normal pour limiter les coûts.' };
};

const stopWeb = startWeb(
  createApp({ repo, agency, recruitment, fans, password: config.DASHBOARD_PASSWORD, robloxApiKey: config.ROBLOX_API_KEY, neptuneApiKey: config.NEPTUNE_API_KEY,
    fansBotSends: !!config.FANS_BOT_TOKEN,
    siteVerification: tiktokSiteVerification(config.TIKTOK_VERIFY_CONTENT, config.TIKTOK_VERIFY_FILE),
    tiktokOAuth: tiktokCreds ? { creds: tiktokCreds, redirectUri: `${dashboardUrl.replace(/\/+$/, '')}/fan/tiktok/callback`, store: tiktokStore } : undefined,
    instagramOAuth: instagramCreds ? { creds: instagramCreds, redirectUri: `${dashboardUrl.replace(/\/+$/, '')}/fan/instagram/callback`, store: instagramStore } : undefined,
    refreshFans,
    marsSites: (config.MARS_SITES ?? '')
      .split(',')
      .map((x) => x.split('='))
      .filter((p) => p.length === 2 && /^https?:\/\//.test(p[1]!.trim()))
      .map(([name, url]) => ({ name: name!.trim(), url: url!.trim().replace(/\/+$/, '') })),
    selfUrl: dashboardUrl.replace(/\/+$/, ''),
    game,
    emailApi: !!(config.SQUIDUU_API_URL && config.SQUIDUU_API_TOKEN),
    youtubeApiKey: config.YOUTUBE_API_KEY,
    discordOAuth:
      config.OAUTH_CLIENT_SECRET && (config.OAUTH_CLIENT_ID ?? config.DISCORD_CLIENT_ID)
        ? {
            clientId: (config.OAUTH_CLIENT_ID ?? config.DISCORD_CLIENT_ID)!,
            clientSecret: config.OAUTH_CLIENT_SECRET,
            redirectUri: `${dashboardUrl.replace(/\/$/, '')}/fan/auth/callback`,
          }
        : undefined,
    bot: botHolder }),
  config.WEB_PORT,
);
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
        withFans: !config.FANS_BOT_TOKEN && !config.NEPTUNE_API_KEY,
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
    bot = await startBot({
      token: config.DISCORD_TOKEN,
      repo,
      analytics,
      agency,
      recruitment,
      dashboardUrl,
      guildId: config.DISCORD_GUILD_ID,
      fans: config.FANS_BOT_TOKEN || config.NEPTUNE_API_KEY ? undefined : fans,
    });
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

// Bot des fans (« BeOne Rewards ») : /site, /coins et messages privés
let stopFansBot: (() => Promise<void>) | undefined;
if (config.FANS_BOT_TOKEN) {
  try {
    stopFansBot = await startFansBot({
      token: config.FANS_BOT_TOKEN,
      clientId: config.FANS_BOT_CLIENT_ID,
      guildIds: (config.FANS_BOT_GUILD_ID ?? '').split(',').map((g) => g.trim()).filter((g) => /^\d+$/.test(g)),
      fans,
      siteUrl: `${dashboardUrl.replace(/\/$/, '')}/fan`,
      youtubeApiKey: config.YOUTUBE_API_KEY,
    });
  } catch (err) {
    status.neptune = { state: 'error', error: err instanceof Error ? err.message : String(err) };
    log.error('connexion du bot fans impossible', err);
  }
}

// Messages privés des fans (coins, niveau, objet abordable, top 3, livraison)
const stopGameDelivery = game ? every('livraison jeu', 1, () => deliverPendingOrders(game, fans.fans)) : () => {};
// Livraison automatique par e-mail (Squiduuverse) si l'API est configurée
const emailApi = config.SQUIDUU_API_URL && config.SQUIDUU_API_TOKEN ? new EmailGrantClient(config.SQUIDUU_API_URL, config.SQUIDUU_API_TOKEN) : undefined;
const stopEmailDelivery = emailApi ? every('livraison e-mail', 1, () => deliverEmailOrders(emailApi, fans.fans)) : () => {};
// Règle anti-triche gratuite : le clip doit citer le créateur dans sa légende
// Rattrapage unique : comptes déjà inscrits qui ont rapporté → repassent par la vérification du staff
log.info(`comptes remis à vérifier : ${fans.requeueOldEarners()}`);
const stopClipCheck = every('vérif des clips', 10, async () => ({ comptesValidés: fans.autoReviewAccounts(), ...fans.checkClips() }));
const stopFanNotify = config.FANS_BOT_TOKEN || config.NEPTUNE_API_KEY ? every('notifications fans', 30, async () => ({ préparées: fans.generateNotifications() })) : () => {};

// Comptes des fans : 1 collecte par nuit, juste après minuit (heure de Paris) ; les clippers de l'agence au rythme normal
const stopCollect = every('collecte', config.COLLECT_INTERVAL_MINUTES, async () => {
  const fanClient = fans.settings().clientId;
  const connected = connectedAccounts();
  // Agence : YouTube et TikTok connecté au rythme normal, comptes Apify (payants) 1 fois par jour
  const agence = await collectAll(repo, fetchers, Date.now, (account, now) =>
    (fanClient !== null && account.clientId === fanClient) || (paidAccount(account, connected) && account.lastCheckedAt !== null && now - account.lastCheckedAt < 23 * 3_600_000),
  );
  if (fanClient === null) return { agence };
  const last = repo.lastPublishedByAccount();
  const free = connected;
  const fansResult = await collectAll(repo, fanFetchers, Date.now, (account, now) => account.clientId !== fanClient || !fanAccountDue(account, last.get(account.id), parisMidnight(now), now, free.has(account.id)));
  return { agence, fans: fansResult };
});
const notifier = bot?.notifier;
const stopRelance = notifier
  ? every('relances', config.RELANCE_CHECK_INTERVAL_MINUTES, async () => ({
      envoyées: await runRelances(repo, analytics, notifier, {
        inactivityDays: config.INACTIVITY_DAYS,
        dropWindowDays: config.DROP_WINDOW_DAYS,
        dropThresholdPercent: config.DROP_THRESHOLD_PERCENT,
        dropMinPreviousViews: config.DROP_MIN_PREVIOUS_VIEWS,
        cooldownHours: config.RELANCE_COOLDOWN_HOURS,
        // Pas de relances pour les fans
        skipClientIds: fans.settings().clientId ? [fans.settings().clientId!] : [],
      }),
    }))
  : () => {};

async function shutdown() {
  log.info('arrêt…');
  stopCollect();
  stopFanNotify();
  stopClipCheck();
  stopGameDelivery();
  stopEmailDelivery();
  stopRelance();
  stopWeb();
  await bot?.stop();
  await stopFansBot?.();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
