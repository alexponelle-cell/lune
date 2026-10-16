import type { Repo } from '../db/repo.js';
import { drawMotivation, type MotivationState, motivationMessage } from '../domain/motivation.js';
import { parisClock } from '../bot/fanAutomation.js';

const KEY = 'motivation';

/** Chaque jour entre 9 h et midi (Paris), une seule fois : phrase de motivation dans #général. */
export async function runMotivation(repo: Repo, post: (text: string) => Promise<boolean>, now = Date.now(), random = Math.random): Promise<boolean> {
  const { hour, day } = parisClock(now);
  const state = repo.getSetting<MotivationState>(KEY, { day: '', bag: [], last: null });
  if (hour < 9 || hour >= 12 || state.day === day) return false;
  const { index, bag } = drawMotivation(state, undefined, random);
  if (!(await post(motivationMessage(index)))) return false;
  repo.setSetting(KEY, { day, bag, last: index } satisfies MotivationState);
  return true;
}
