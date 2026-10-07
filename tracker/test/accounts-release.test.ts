import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { Repo } from '../src/db/repo.js';
import { parseAccountInput } from '../src/domain/links.js';

describe('compte libéré puis repris par le bon fan', () => {
  it('un compte actif est refusé, un compte libéré est repris', () => {
    const repo = new Repo(openDatabase(':memory:'));
    const wrong = repo.upsertClipper('111111111111111111', 'mauvais-compte');
    const right = repo.upsertClipper('222222222222222222', 'vrai-compte');
    const input = { clientId: null, platform: 'youtube' as const, handle: 'betheshortsmaker', url: 'https://youtube.com/@betheshortsmaker' };
    const first = repo.registerAccount({ ...input, clipperId: wrong.id });
    expect(repo.registerAccount({ ...input, clipperId: right.id }).conflict?.id).toBe(wrong.id);
    expect(repo.searchAccounts('@BeTheShorts')).toMatchObject([{ id: first.account.id, username: 'mauvais-compte', active: true }]);
    repo.deactivateAccount(first.account.id);
    const taken = repo.registerAccount({ ...input, clipperId: right.id });
    expect(taken.conflict).toBeUndefined();
    expect(taken.account).toMatchObject({ clipperId: right.id, active: true });
  });

  it('« - » n’est pas un compte', () => {
    expect(parseAccountInput('tiktok', '-')).toBeNull();
    expect(parseAccountInput('tiktok', '@kev.clips')).not.toBeNull();
  });
});
