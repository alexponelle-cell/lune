import { log } from '../log.js';

/**
 * Lance `task` tout de suite puis toutes les `intervalMinutes`.
 * Un passage n'est jamais lancé si le précédent tourne encore.
 */
export function every(name: string, intervalMinutes: number, task: () => Promise<unknown>): () => void {
  let running = false;
  const tick = async () => {
    if (running) {
      log.warn(`${name}: passage précédent encore en cours, on saute`);
      return;
    }
    running = true;
    const started = Date.now();
    try {
      const result = await task();
      log.info(`${name}: terminé en ${Math.round((Date.now() - started) / 1000)}s ${JSON.stringify(result ?? '')}`);
    } catch (err) {
      log.error(`${name}: échec`, err);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMinutes * 60 * 1000);
  return () => clearInterval(timer);
}
