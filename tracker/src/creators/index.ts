import { beone } from './beone.js';
import { debo } from './debo.js';
import { loann } from './loann.js';
import { squiduu } from './squiduu.js';
import type { CreatorConfig } from './types.js';

export type { CreatorConfig } from './types.js';

/** Créateurs disponibles. Pour en ajouter un : copier squiduu.ts, l'adapter, l'ajouter ici. */
export const CREATORS: Record<string, CreatorConfig> = { beone, squiduu, debo, loann };

export function creatorConfig(id: string | undefined): CreatorConfig {
  const key = (id ?? 'beone').trim().toLowerCase();
  const c = CREATORS[key];
  if (!c) throw new Error(`Créateur inconnu : « ${id} » (disponibles : ${Object.keys(CREATORS).join(', ')})`);
  return c;
}
