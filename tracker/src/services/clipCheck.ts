/**
 * Anti-triche gratuit : un clip ne rapporte des coins que si sa légende / son titre cite le créateur
 * (son nom, sa chaîne ou son #hashtag). Les vidéos d'un autre YouTubeur (compte volé) ne le citent pas
 * et sont refusées. Un clippeur qui corrige sa légende est revérifié au relevé suivant.
 */

/** Minuscules, sans accents, sans espaces ni ponctuation : « #Squi-duu ! » → « squiduu ». */
export const normalizeForMatch = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Mots-clés du créateur : réglés dans Mars (séparés par des virgules), sinon son nom + ses chaînes YouTube. */
export function clipKeywords(custom: string, creatorName: string, youtubeHandles: string[], extra: string[] = []): string[] {
  const list = custom.trim() ? custom.split(',') : [...extra, creatorName, ...youtubeHandles];
  return [...new Set(list.map(normalizeForMatch).filter((k) => k.length >= 3))];
}

/** Le titre / la légende cite-t-il le créateur ? */
export function citesCreator(title: string | null, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const t = normalizeForMatch(title ?? '');
  return keywords.some((k) => t.includes(k));
}
