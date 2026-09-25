export const PLATFORMS = ['tiktok', 'instagram', 'youtube'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface AccountLink {
  platform: Platform;
  /** Identifiant normalisé : handle sans "@" en minuscules, ou ID de chaîne YouTube ("UC..."). */
  handle: string;
  /** URL canonique du profil. */
  url: string;
}

// Chemins Instagram qui ne sont pas des profils.
const INSTAGRAM_RESERVED = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'tv', 'accounts', 'direct', 'about', 'legal', 'developer',
]);

const URL_RE = /https?:\/\/[^\s<>()]+/gi;

export function canonicalUrl(platform: Platform, handle: string): string {
  switch (platform) {
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`;
    case 'instagram':
      return `https://www.instagram.com/${handle}/`;
    case 'youtube':
      return handle.startsWith('UC')
        ? `https://www.youtube.com/channel/${handle}`
        : `https://www.youtube.com/@${handle}`;
  }
}

/** Transforme une URL de profil (ou de vidéo) en compte. Renvoie null si l'URL n'est pas reconnue. */
export function parseAccountUrl(raw: string): AccountLink | null {
  let url: URL;
  try {
    url = new URL(raw.replace(/[.,;!?]+$/, ''));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|vm\.)/, '');
  const segments = url.pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (!first) return null;

  const build = (platform: Platform, handle: string): AccountLink => ({
    platform,
    handle,
    url: canonicalUrl(platform, handle),
  });

  if (host === 'tiktok.com') {
    const m = /^@([A-Za-z0-9._]{2,24})$/.exec(first);
    return m?.[1] ? build('tiktok', m[1].toLowerCase()) : null;
  }

  if (host === 'instagram.com') {
    if (INSTAGRAM_RESERVED.has(first.toLowerCase())) return null;
    const m = /^([A-Za-z0-9._]{1,30})$/.exec(first);
    return m?.[1] ? build('instagram', m[1].toLowerCase()) : null;
  }

  if (host === 'youtube.com') {
    const handle = /^@([A-Za-z0-9._-]{3,30})$/.exec(first);
    if (handle?.[1]) return build('youtube', handle[1].toLowerCase());
    if (first === 'channel' && segments[1] && /^UC[A-Za-z0-9_-]{22}$/.test(segments[1])) {
      return build('youtube', segments[1]);
    }
    return null;
  }

  return null;
}

/** Extrait tous les comptes (dédoublonnés) d'un message Discord. */
export function parseAccountLinks(text: string): AccountLink[] {
  const found = new Map<string, AccountLink>();
  for (const match of text.matchAll(URL_RE)) {
    const link = parseAccountUrl(match[0]);
    if (link) found.set(`${link.platform}:${link.handle}`, link);
  }
  return [...found.values()];
}

/** "@pseudo", "pseudo" ou lien de profil → compte de la plateforme attendue (null si invalide). */
export function parseAccountInput(platform: Platform, value: string): AccountLink | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    const parsed = parseAccountUrl(v);
    return parsed && parsed.platform === platform ? parsed : null;
  }
  const handle = v.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._-]{1,30}$/.test(handle)) return null;
  return { platform, handle, url: canonicalUrl(platform, handle) };
}
