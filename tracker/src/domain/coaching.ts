import type { VideoRow } from '../db/repo.js';

/**
 * Points forts / points à travailler d'un clippeur (base des feedbacks vocaux), calculés gratuitement
 * à partir des vues relevées : comparaison à l'équipe, plateforme et créneau qui marchent le mieux,
 * régularité, clips refusés (#tag), comptes en erreur. Fenêtre : les 30 derniers jours.
 */
export interface CoachingPoint {
  level: 'good' | 'warn';
  title: string;
  text: string;
}

export interface Coaching {
  clips: number;
  median: number;
  teamMedian: number;
  points: CoachingPoint[];
  platforms: Array<{ platform: string; clips: number; avg: number }>;
  slots: Array<{ slot: string; clips: number; avg: number }>;
  best: Pick<VideoRow, 'title' | 'url' | 'views' | 'platform'> | null;
  worst: Pick<VideoRow, 'title' | 'url' | 'views' | 'platform'> | null;
}

const DAY = 86_400_000;
const PLATFORM_NAME: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };
const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)} k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} k` : String(Math.round(n)));

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

/** Créneau de publication (heure de Paris). */
export function slotOf(at: number): string {
  const h = Number(new Date(at).toLocaleString('en-US', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }));
  return h < 6 ? 'nuit (0h-6h)' : h < 12 ? 'matin (6h-12h)' : h < 18 ? 'après-midi (12h-18h)' : 'soir (18h-0h)';
}

const avgBy = (videos: VideoRow[], key: (v: VideoRow) => string) => {
  const groups = new Map<string, number[]>();
  for (const v of videos) groups.set(key(v), [...(groups.get(key(v)) ?? []), v.views]);
  return [...groups].map(([k, vs]) => ({ k, clips: vs.length, avg: Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) })).sort((a, b) => b.avg - a.avg);
};

export function coaching(
  mine: VideoRow[],
  team: VideoRow[],
  opts: { postsPerDay: number; now: number; refusedClips?: number; accountErrors?: string[]; tag?: string },
): Coaching {
  const points: CoachingPoint[] = [];
  const views = mine.map((v) => v.views);
  const my = median(views);
  const teamMedian = median(team.map((v) => v.views));

  // Comptes qui ne remontent pas
  for (const err of opts.accountErrors ?? []) points.push({ level: 'warn', title: 'Compte non relevé', text: err });

  if (!mine.length) {
    points.push({ level: 'warn', title: 'Aucun clip sur 30 jours', text: 'Rien de relevé : vérifier que ses comptes sont bons et qu’il poste.' });
    return { clips: 0, median: 0, teamMedian, points, platforms: [], slots: [], best: null, worst: null };
  }

  // Performance vs l'équipe
  if (teamMedian > 0 && mine.length >= 3) {
    const ratio = my / teamMedian;
    if (ratio >= 1.5) points.push({ level: 'good', title: 'Clips au-dessus de l’équipe', text: `Médiane ${fmt(my)} vues par clip contre ${fmt(teamMedian)} pour l’équipe (×${ratio.toFixed(1).replace('.', ',')}).` });
    else if (ratio <= 0.6) points.push({ level: 'warn', title: 'Clips sous la moyenne', text: `Médiane ${fmt(my)} vues par clip contre ${fmt(teamMedian)} pour l’équipe : travailler l’accroche des 2 premières secondes et le choix des moments.` });
  }

  // Flops
  const flopLine = Math.max(100, Math.round(teamMedian * 0.3));
  const flops = mine.filter((v) => v.views < flopLine).length;
  if (mine.length >= 4 && flops / mine.length >= 0.5) {
    points.push({ level: 'warn', title: 'Beaucoup de clips qui ne décollent pas', text: `${flops} clips sur ${mine.length} sous ${fmt(flopLine)} vues : moins de quantité, plus de moments forts.` });
  }

  // Plateformes
  const platforms = avgBy(mine, (v) => v.platform).map((p) => ({ platform: p.k, clips: p.clips, avg: p.avg }));
  const solid = platforms.filter((p) => p.clips >= 2);
  if (solid.length >= 2) {
    const best = solid[0]!;
    const worst = solid[solid.length - 1]!;
    if (worst.avg > 0 && best.avg / worst.avg >= 2) {
      points.push({ level: 'good', title: `${PLATFORM_NAME[best.platform] ?? best.platform} marche le mieux`, text: `${fmt(best.avg)} vues en moyenne contre ${fmt(worst.avg)} sur ${PLATFORM_NAME[worst.platform] ?? worst.platform} : prioriser ${PLATFORM_NAME[best.platform] ?? best.platform}.` });
    }
  }
  const missing = ['tiktok', 'youtube', 'instagram'].filter((p) => !platforms.some((x) => x.platform === p));
  if (missing.length && missing.length < 3) {
    points.push({ level: 'warn', title: 'Plateforme pas exploitée', text: `Aucun clip sur ${missing.map((p) => PLATFORM_NAME[p]).join(' et ')} en 30 jours : reposter les mêmes clips = vues en plus gratuites.` });
  }

  // Créneaux de publication
  const slots = avgBy(mine.filter((v) => v.publishedAt), (v) => slotOf(v.publishedAt!)).map((s) => ({ slot: s.k, clips: s.clips, avg: s.avg }));
  const slotsOk = slots.filter((s) => s.clips >= 2);
  if (slotsOk.length >= 2 && slotsOk[slotsOk.length - 1]!.avg > 0 && slotsOk[0]!.avg / slotsOk[slotsOk.length - 1]!.avg >= 1.5) {
    points.push({ level: 'good', title: `Meilleur créneau : le ${slotsOk[0]!.slot}`, text: `${fmt(slotsOk[0]!.avg)} vues en moyenne contre ${fmt(slotsOk[slotsOk.length - 1]!.avg)} le ${slotsOk[slotsOk.length - 1]!.slot}.` });
  }

  // Régularité (depuis son 1er clip, max 30 jours)
  const first = Math.min(...mine.map((v) => v.publishedAt ?? opts.now));
  const days = Math.max(1, Math.min(30, Math.ceil((opts.now - first) / DAY)));
  const perDay = mine.length / days;
  const activeDays = new Set(mine.map((v) => new Date(v.publishedAt ?? opts.now).toISOString().slice(0, 10))).size;
  if (perDay < opts.postsPerDay * 0.7) {
    points.push({ level: 'warn', title: 'Pas assez régulier', text: `${perDay.toFixed(1).replace('.', ',')} post/jour en moyenne (objectif ${opts.postsPerDay}), actif ${activeDays} jour(s) sur ${days}.` });
  } else if (perDay >= opts.postsPerDay) {
    points.push({ level: 'good', title: 'Régulier', text: `${perDay.toFixed(1).replace('.', ',')} post/jour en moyenne (objectif ${opts.postsPerDay}).` });
  }

  // Légende sans le #tag (programme fans)
  if (opts.refusedClips) {
    points.push({ level: 'warn', title: 'Clips sans le #tag', text: `${opts.refusedClips} clip(s) refusé(s) car la légende ne cite pas ${opts.tag ?? 'le créateur'} : ils ne rapportent rien.` });
  }

  const sorted = [...mine].sort((a, b) => b.views - a.views);
  const pick = (v: VideoRow | undefined) => (v ? { title: v.title, url: v.url, views: v.views, platform: v.platform } : null);
  return {
    clips: mine.length,
    median: my,
    teamMedian,
    points: points.sort((a, b) => Number(a.level === 'good') - Number(b.level === 'good')),
    platforms,
    slots,
    best: pick(sorted[0]),
    worst: mine.length >= 3 ? pick(sorted[sorted.length - 1]) : null,
  };
}
