import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { Repo } from '../src/db/repo.js';

describe('transfert d’un clippeur vers un nouveau compte Discord', () => {
  it('garde ses comptes et remplace une fiche vide du nouveau compte', () => {
    const repo = new Repo(openDatabase(':memory:'));
    const old = repo.upsertClipper('111111111111111111', 'braven');
    repo.registerAccount({ clipperId: old.id, clientId: null, platform: 'tiktok', handle: 'braven', url: 'https://tiktok.com/@braven' });
    repo.upsertClipper('222222222222222222', 'BravenV2'); // fiche vide créée en se connectant
    const moved = repo.transferClipper(old.id, '222222222222222222', 'BravenV2');
    expect(moved.id).toBe(old.id);
    expect(repo.getClipperByDiscordId('222222222222222222')?.id).toBe(old.id);
    expect(repo.getClipperByDiscordId('111111111111111111')).toBeUndefined();
    expect(repo.listAccountsForClipper(old.id)).toHaveLength(1);
    expect(moved.username).toBe('BravenV2');
  });

  it('refuse si le nouveau compte a déjà ses propres comptes', () => {
    const repo = new Repo(openDatabase(':memory:'));
    const old = repo.upsertClipper('111111111111111111', 'a');
    const other = repo.upsertClipper('222222222222222222', 'b');
    repo.registerAccount({ clipperId: other.id, clientId: null, platform: 'tiktok', handle: 'b', url: 'https://tiktok.com/@b' });
    expect(() => repo.transferClipper(old.id, '222222222222222222')).toThrow(/déjà sa propre fiche/);
  });
});
