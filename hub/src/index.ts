import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { Hub } from './db.js';
import { seedDemo } from './seed.js';
import { slackNotifier } from './integrations/slack.js';
import { runReminders } from './jobs.js';
import { createApp } from './server.js';
import { Notion, syncNotion } from './integrations/notion.js';
import { smtpMailer } from './integrations/mail.js';
import { Qonto, syncQonto } from './integrations/qonto.js';
import { syncCalendar } from './integrations/calendar.js';

const cfg = loadConfig();
const hub = new Hub(cfg.DATABASE_PATH);
if (cfg.SEED_DEMO === '1') seedDemo(hub);
if (cfg.ADMIN_PASSWORD && !cfg.SESSION_SECRET) { console.error('❌ SESSION_SECRET manquant (Railway → Variables) : le hub ne démarre pas sans lui.'); process.exit(1); }
if (!cfg.ADMIN_PASSWORD) console.warn('⚠️ ADMIN_PASSWORD absent : le hub est ouvert à tous (à mettre dans Railway → Variables)');
const notify = slackNotifier(cfg.SLACK_WEBHOOK_URL);
const mail = smtpMailer(cfg.SMTP_URL, cfg.MAIL_FROM);

serve({ fetch: createApp(hub, cfg, notify, undefined, mail).fetch, port: cfg.PORT }, () => console.log(`P360 Hub sur le port ${cfg.PORT}`));

// Relances automatiques toutes les heures
const tick = () => runReminders(hub, notify, Date.now(), mail, cfg.PUBLIC_URL.replace(/\/$/, '')).then((r) => (r.clients || r.monteurs) && console.log('[relances]', r)).catch((e) => console.error('[relances]', e));
setTimeout(tick, 30_000);
setInterval(tick, 3_600_000);

// Synchro Notion toutes les 10 minutes (si la clé est renseignée)
const syncTick = () => { const t = hub.setting('notion_token') ?? cfg.NOTION_TOKEN; if (t) syncNotion(hub, new Notion(t)).catch((e) => console.error('[notion]', e instanceof Error ? e.message : e)); };
setInterval(syncTick, 600_000);
setTimeout(syncTick, 15_000);

// Banque Qonto toutes les heures, Google Agenda toutes les 15 minutes (si reliés)
const log = (what: string) => (e: unknown) => console.error(`[${what}]`, e instanceof Error ? e.message : e);
const qontoTick = () => { const l = hub.setting('qonto_login'), s = hub.setting('qonto_secret'); if (l && s) syncQonto(hub, new Qonto(l, s)).catch(log('qonto')); };
const calTick = () => { const u = hub.setting('gcal_url'); if (u) syncCalendar(hub, u).catch(log('agenda')); };
setInterval(qontoTick, 3_600_000); setTimeout(qontoTick, 20_000);
setInterval(calTick, 900_000); setTimeout(calTick, 10_000);
