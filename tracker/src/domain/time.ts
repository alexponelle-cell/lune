import { DAY } from './stats.js';

/** Toutes les journées (posts du jour, jours actifs, semaines) sont découpées à l'heure de Paris. */
export const TZ = 'Europe/Paris';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' });

/** "2026-09-25" pour un instant donné, à l'heure de Paris. */
export function dayKey(t: number): string {
  return dayFormat.format(t);
}

function offsetMs(t: number): number {
  const name = offsetFormat.formatToParts(t).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

/** Minuit (heure de Paris) du jour contenant `t`. */
export function startOfDay(t: number): number {
  const [y, m, d] = dayKey(t).split('-').map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  return utcMidnight - offsetMs(utcMidnight);
}

/** Lundi 00:00 (heure de Paris) de la semaine contenant `t`. */
export function startOfWeek(t: number): number {
  const day = startOfDay(t);
  const [y, m, d] = dayKey(day + 12 * 3_600_000).split('-').map(Number) as [number, number, number];
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lundi
  return startOfDay(day - weekday * DAY + 12 * 3_600_000);
}

/** Débuts de journée couvrant [from, to[, au plus `max` jours (les plus récents). */
export function dayStarts(from: number, to: number, max = 180): number[] {
  const out: number[] = [];
  // +3 h absorbe les journées de 23 h / 25 h des changements d'heure.
  for (let t = startOfDay(Math.max(from, to - max * DAY)); t < to; t = startOfDay(t + DAY + 3 * 3_600_000)) out.push(t);
  return out.slice(-max);
}
