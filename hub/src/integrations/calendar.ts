import type { Hub } from '../db.js';
/**
 * Google Agenda en lecture : Adrien colle l'« adresse secrète au format iCal » de son agenda
 * (Google Agenda → Paramètres de l'agenda → Intégrer l'agenda). Gratuit, sans connexion compliquée.
 */
export interface CalEvent { title: string; start: number; end: number | null; allDay: boolean; place: string | null }

/** Lit un fichier .ics (événements simples ; les répétitions RRULE ne sont pas dépliées, seul le 1er passage compte). */
export function parseIcs(text: string, tz = 'Europe/Paris'): CalEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out: CalEvent[] = [];
  let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.DTSTART) {
        const s = icsDate(cur.DTSTART, tz), e = cur.DTEND ? icsDate(cur.DTEND, tz) : null;
        if (s && cur.STATUS?.value !== 'CANCELLED') out.push({ title: unescape(cur.SUMMARY?.value ?? 'Sans titre'), start: s.at, end: e?.at ?? null, allDay: s.allDay, place: cur.LOCATION ? unescape(cur.LOCATION.value) || null : null });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(';');
    if (name && !cur[name]) cur[name] = { params: params.join(';'), value: line.slice(i + 1) };
  }
  return out.sort((a, b) => a.start - b.start);
}

const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/** 20261025T140000Z (UTC), 20261025T140000 + TZID (heure locale), 20261025 (journée entière). */
function icsDate(f: { params: string; value: string }, fallbackTz: string): { at: number; allDay: boolean } | null {
  const m = f.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  if (!m[4]) return { at: zoned(+y!, +mo!, +d!, 0, 0, 0, fallbackTz), allDay: true };
  if (z) return { at: Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s), allDay: false };
  const tz = f.params.match(/TZID=([^;:]+)/)?.[1] ?? fallbackTz;
  return { at: zoned(+y!, +mo!, +d!, +h, +mi, +s, tz), allDay: false };
}

/** Heure « murale » dans un fuseau → instant UTC (gère l'heure d'été). */
function zoned(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let off = 0;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    off = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - guess;
  } catch { /* fuseau inconnu : UTC */ }
  return guess - off;
}

/** Télécharge l'agenda (https seulement) et garde 2 semaines passées + 3 mois à venir. */
export async function fetchCalendar(url: string, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<CalEvent[]> {
  const u = new URL(url.trim().replace(/^webcal:/i, 'https:'));
  if (u.protocol !== 'https:') throw new Error('Colle l’adresse qui commence par https://');
  const r = await fetchImpl(u, { headers: { accept: 'text/calendar' } });
  if (!r.ok) throw new Error(r.status === 404 ? 'Agenda introuvable : vérifie l’adresse secrète' : `Agenda : erreur ${r.status}`);
  const text = await r.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Ce lien n’est pas un agenda iCal (prends « Adresse secrète au format iCal »)');
  const D = 86_400_000;
  return parseIcs(text).filter((e) => e.start >= now - 14 * D && e.start <= now + 92 * D).slice(0, 500);
}

/** Relit l'agenda et le garde en base (affiché dans le Planning). */
export async function syncCalendar(hub: Hub, url: string, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<number> {
  const events = await fetchCalendar(url, now, fetchImpl);
  hub.setSetting('gcal_events', JSON.stringify(events));
  hub.setSetting('gcal_last_sync', String(now));
  return events.length;
}
