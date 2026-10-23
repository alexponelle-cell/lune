import { z } from 'zod';

/** Variables d'environnement (Railway → Variables). Les secrets ne sont jamais écrits dans le code. */
const schema = z.object({
  PORT: z.coerce.number().default(3360),
  DATABASE_PATH: z.string().default('./data/hub.db'),
  PUBLIC_URL: z.string().default('http://localhost:3360'),
  /** Mot de passe d'Adrien (et de Romain) pour entrer dans le hub. */
  ADMIN_PASSWORD: z.string().min(6).optional(),
  /** Clé qui signe les sessions (n'importe quelle longue phrase secrète). */
  SESSION_SECRET: z.string().min(16).optional(),
  /** Webhook Slack « Incoming Webhook » : relances, feedbacks, briefs. */
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  /** Clé d'intégration Notion (sinon collée par Adrien dans le hub, page Connexions). */
  NOTION_TOKEN: z.string().optional(),
  /** 1 = remplit la base avec des données d'exemple si elle est vide (démo). */
  SEED_DEMO: z.string().optional(),
});

export type Config = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);
