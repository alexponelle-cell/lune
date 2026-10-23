import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { Hub } from './db.js';
import { seedDemo } from './seed.js';
import { slackNotifier } from './integrations/slack.js';
import { runReminders } from './jobs.js';
import { createApp } from './server.js';
import { Notion, syncNotion } from './integrations/notion.js';

const cfg = loadConfig();
const hub = new Hub(cfg.DATABASE_PATH);
if (cfg.SEED_DEMO === '1') seedDemo(hub);
if (!cfg.ADMIN_PASSWORD) console.warn('⚠️ ADMIN_PASSWORD absent : le hub est ouvert à tous (à mettre dans Railway → Variables)');
const notify = slackNotifier(cfg.SLACK_WEBHOOK_URL);

serve({ fetch: createApp(hub, cfg, notify).fetch, port: cfg.PORT }, () => console.log(`P360 Hub sur le port ${cfg.PORT}`));

// Relances automatiques toutes les heures
const tick = () => runReminders(hub, notify).then((r) => (r.clients || r.monteurs) && console.log('[relances]', r)).catch((e) => console.error('[relances]', e));
setTimeout(tick, 30_000);
setInterval(tick, 3_600_000);

// Synchro Notion toutes les 10 minutes (si la clé est renseignée)
const syncTick = () => { const t = hub.setting('notion_token') ?? cfg.NOTION_TOKEN; if (t) syncNotion(hub, new Notion(t)).catch((e) => console.error('[notion]', e instanceof Error ? e.message : e)); };
setInterval(syncTick, 600_000);
setTimeout(syncTick, 15_000);
