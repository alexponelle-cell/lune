import { existsSync } from 'node:fs';
import { z } from 'zod';

if (existsSync('.env')) process.loadEnvFile('.env');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z.object({
  DISCORD_TOKEN: optionalString,
  DISCORD_CLIENT_ID: optionalString,
  DISCORD_GUILD_ID: optionalString,

  DATABASE_PATH: z.string().default('./data/tracker.db'),

  WEB_PORT: z.coerce.number().int().positive().default(3000),
  DASHBOARD_PASSWORD: optionalString,

  FETCHER_MODE: z.enum(['mock', 'live']).default('mock'),
  YOUTUBE_API_KEY: optionalString,
  APIFY_TOKEN: optionalString,
  VIDEOS_PER_ACCOUNT: z.coerce.number().int().positive().default(30),

  COLLECT_INTERVAL_MINUTES: z.coerce.number().positive().default(60),
  RELANCE_CHECK_INTERVAL_MINUTES: z.coerce.number().positive().default(180),

  INACTIVITY_DAYS: z.coerce.number().positive().default(3),
  DROP_WINDOW_DAYS: z.coerce.number().positive().default(7),
  DROP_THRESHOLD_PERCENT: z.coerce.number().min(0).max(100).default(30),
  DROP_MIN_PREVIOUS_VIEWS: z.coerce.number().min(0).default(1000),
  RELANCE_COOLDOWN_HOURS: z.coerce.number().min(0).default(24),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);
