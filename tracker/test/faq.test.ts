import { describe, expect, it } from 'vitest';
import { coinsDiagnosis, faqAnswer, type FaqInfo, matchFaq } from '../src/domain/faq.js';

const info: FaqInfo = { creatorName: 'SQUIDUU', tag: '#squiduu', pointsPer1000: 10, reward: { name: '1 mois de Squiduuverse', price: 10_000 }, siteUrl: 'https://x/fan', officialLogin: ['tiktok'] };

describe('FAQ du salon aide', () => {
  it('reconnaît les questions fréquentes', () => {
    const cases: Array<[string, string | null]> = [
      ['pourquoi j’ai 0 coins ??', 'coins'],
      ['jai toujours pas de coins c normal ?', 'coins'],
      ['mes vues comptent pas pk', 'coins'],
      ['faut mettre quoi comme hashtag ?', 'tag'],
      ['comment je relie mon compte tiktok ?', 'link'],
      ['je peux changer mon compte insta ?', 'link'],
      ['quand est-ce que les vues sont actualisées ?', 'when'],
      ['combien de coins pour 1000 vues ?', 'rate'],
      ['comment on échange ses coins ?', 'reward'],
      ['il faut combien d’abonnés minimum ?', 'followers'],
      ['comment je connecte mon tiktok sur le site ?', 'connect'],
      ['vous utilisez quel logiciel de montage ?', 'editing'],
      ['je peux poster le même clip sur plusieurs plateformes ?', 'repost'],
      ['c’est quoi le lien du site ?', 'site'],
      ['Comment je peux faire + de vues ?', 'grow'],
      ['des conseils pour percer ?', 'grow'],
    ];
    for (const [q, intent] of cases) expect(matchFaq(q), q).toBe(intent);
  });

  it('se tait sur la discussion normale', () => {
    for (const q of ['salut tout le monde', 'trop bien la dernière vidéo de squiduu', 'gg à tous', 'mdr', 'jsuis content de mon clip']) expect(matchFaq(q), q).toBeNull();
  });

  it('répond avec les infos du programme', () => {
    expect(faqAnswer('tag', info)).toContain('#squiduu');
    expect(faqAnswer('rate', info)).toContain('1 000 vues = 10 coins');
    expect(faqAnswer('rate', info)).toContain('1 mois de Squiduuverse');
  });

  it('diagnostique « 0 coins »', () => {
    const base = { clips: 0, counted: 0, refusedTag: 0, balance: 0, views: 0, tag: '#squiduu', pointsPer1000: 10 };
    expect(coinsDiagnosis({ ...base, accounts: [] })[0]).toContain('aucun compte relié');
    expect(coinsDiagnosis({ ...base, accounts: [{ platform: 'tiktok', handle: 'kev', verified: true, checked: false, error: null }] })[0]).toContain('pas encore relevé');
    const tagMissing = coinsDiagnosis({ ...base, clips: 3, refusedTag: 3, accounts: [{ platform: 'tiktok', handle: 'kev', verified: true, checked: true, error: null }] });
    expect(tagMissing.join(' ')).toContain('sans #squiduu');
    const old = coinsDiagnosis({ ...base, clips: 2, accounts: [{ platform: 'tiktok', handle: 'kev', verified: true, checked: true, error: null }] });
    expect(old.join(' ')).toContain('avant ton inscription');
    const ok = coinsDiagnosis({ ...base, clips: 2, counted: 2, balance: 120, views: 12_000, accounts: [{ platform: 'tiktok', handle: 'kev', verified: true, checked: true, error: null }] });
    expect(ok[0]).toContain('120 coins');
  });
});

describe('FAQ : questions perso et clips', () => {
  it('reconnaît solde, manque, classement et lien de clip', async () => {
    const { matchFaq, videoKey, looksLikeQuestion } = await import('../src/domain/faq.js');
    expect(matchFaq('combien j’ai de coins ?')).toBe('balance');
    expect(matchFaq('il me manque combien pour le mois ?')).toBe('missing');
    expect(matchFaq('je suis combien au classement ?')).toBe('rank');
    expect(matchFaq('pk ce clip compte pas https://www.tiktok.com/@kev/video/7412345678901234567')).toBe('clip');
    expect(videoKey('https://www.instagram.com/reel/C9abcDEF12/?igsh=x')).toBe('C9abcDEF12');
    expect(videoKey('https://youtube.com/shorts/dQw4w9WgXcQ?si=1')).toBe('dQw4w9WgXcQ');
    expect(looksLikeQuestion('c’est quand le prochain live ?')).toBe(true);
    expect(matchFaq('c’est quand le prochain live ?')).toBeNull();
  });
});

describe('menu /aide', () => {
  it('chaque question du menu a une réponse et le menu tient dans Discord', async () => {
    const { FAQ_MENU, faqAnswer } = await import('../src/domain/faq.js');
    const info = { creatorName: 'SQUIDUU', tag: '#squiduu', pointsPer1000: 10, reward: { name: '1 mois', price: 10_000 }, siteUrl: 'https://x/fan', officialLogin: [] };
    expect(FAQ_MENU.length).toBeLessThanOrEqual(25);
    for (const q of FAQ_MENU) {
      expect(q.label.length).toBeLessThanOrEqual(100);
      expect(faqAnswer(q.intent, info, ['ligne perso']).length).toBeGreaterThan(5);
    }
  });
});
