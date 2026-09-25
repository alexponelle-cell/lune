import { describe, expect, it } from 'vitest';
import { parseAccountLinks, parseAccountUrl } from '../src/domain/links.js';

describe('parseAccountUrl', () => {
  it.each([
    ['https://www.tiktok.com/@Nono.Clips', 'tiktok', 'nono.clips'],
    ['https://www.tiktok.com/@nono.clips/video/7312345678901234567', 'tiktok', 'nono.clips'],
    ['https://m.tiktok.com/@nono_clips?lang=fr', 'tiktok', 'nono_clips'],
    ['https://instagram.com/Lina.Cuts/', 'instagram', 'lina.cuts'],
    ['https://www.instagram.com/lina.cuts?igsh=abc', 'instagram', 'lina.cuts'],
    ['https://www.youtube.com/@SamiEdits', 'youtube', 'samiedits'],
    ['https://youtube.com/@samiedits/shorts', 'youtube', 'samiedits'],
    ['https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', 'youtube', 'UCabcdefghijklmnopqrstuv'],
  ])('%s → %s/%s', (url, platform, handle) => {
    expect(parseAccountUrl(url)).toMatchObject({ platform, handle });
  });

  it.each([
    'https://www.instagram.com/p/Cxyz123/',
    'https://www.instagram.com/reel/Cxyz123/',
    'https://www.tiktok.com/foryou',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://example.com/@someone',
    'pas une url',
  ])('rejette %s', (url) => {
    expect(parseAccountUrl(url)).toBeNull();
  });
});

describe('parseAccountLinks', () => {
  it('extrait et dédoublonne les comptes d’un message', () => {
    const msg = `Mes comptes :
      tiktok https://www.tiktok.com/@nono.clips,
      insta : https://instagram.com/nono.clips (le même)
      encore https://tiktok.com/@Nono.Clips/video/123`;
    expect(parseAccountLinks(msg)).toEqual([
      { platform: 'tiktok', handle: 'nono.clips', url: 'https://www.tiktok.com/@nono.clips' },
      { platform: 'instagram', handle: 'nono.clips', url: 'https://www.instagram.com/nono.clips/' },
    ]);
  });

  it('renvoie une liste vide sans lien', () => {
    expect(parseAccountLinks('salut tout le monde')).toEqual([]);
  });
});
