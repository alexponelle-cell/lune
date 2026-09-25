import type Database from 'better-sqlite3';

/**
 * Migrations appliquées dans l'ordre. Ne jamais modifier une migration déjà déployée :
 * en ajouter une nouvelle à la fin.
 * Toutes les dates sont des timestamps en millisecondes (UTC).
 */
export const MIGRATIONS: ReadonlyArray<string | ((db: Database.Database) => void)> = [
  `
  CREATE TABLE clients (
    id                 INTEGER PRIMARY KEY,
    name               TEXT    NOT NULL,
    slug               TEXT    NOT NULL UNIQUE,
    -- Salon Discord "COMPTES" où les clippers de ce client postent leurs comptes
    discord_channel_id TEXT    UNIQUE,
    rate_per_1k_cents  INTEGER NOT NULL DEFAULT 0,
    min_views          INTEGER NOT NULL DEFAULT 0,
    cap_cents          INTEGER,
    created_at         INTEGER NOT NULL
  );

  CREATE TABLE clippers (
    id         INTEGER PRIMARY KEY,
    discord_id TEXT    NOT NULL UNIQUE,
    username   TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE accounts (
    id              INTEGER PRIMARY KEY,
    clipper_id      INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    platform        TEXT    NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube')),
    handle          TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    external_id     TEXT,
    display_name    TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    last_checked_at INTEGER,
    last_error      TEXT,
    created_at      INTEGER NOT NULL,
    UNIQUE (platform, handle)
  );
  CREATE INDEX accounts_clipper ON accounts(clipper_id);
  CREATE INDEX accounts_client ON accounts(client_id);

  CREATE TABLE videos (
    id                INTEGER PRIMARY KEY,
    account_id        INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    platform_video_id TEXT    NOT NULL,
    url               TEXT,
    title             TEXT,
    published_at      INTEGER,
    views             INTEGER NOT NULL DEFAULT 0,
    likes             INTEGER,
    comments          INTEGER,
    first_seen_at     INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    UNIQUE (account_id, platform_video_id)
  );

  -- Historique brut par vidéo (utile pour les classements de clips / audits)
  CREATE TABLE video_snapshots (
    video_id    INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    captured_at INTEGER NOT NULL,
    views       INTEGER NOT NULL,
    likes       INTEGER,
    comments    INTEGER
  );
  CREATE INDEX video_snapshots_video ON video_snapshots(video_id, captured_at);

  -- Total des vues par compte à chaque collecte : base de tous les calculs de progression
  CREATE TABLE account_snapshots (
    account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    captured_at INTEGER NOT NULL,
    total_views INTEGER NOT NULL,
    video_count INTEGER NOT NULL
  );
  CREATE INDEX account_snapshots_account ON account_snapshots(account_id, captured_at);

  -- Journal des relances envoyées (anti-spam via cooldown)
  CREATE TABLE relances (
    id         INTEGER PRIMARY KEY,
    clipper_id INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    sent_at    INTEGER NOT NULL
  );
  CREATE INDEX relances_clipper ON relances(clipper_id, kind, sent_at);
  `,

  // v2 : structure "agence" (dashboard complet)
  `
  -- Un clipper appartient à une agence (= client) ; statut géré depuis Management
  ALTER TABLE clippers ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
  ALTER TABLE clippers ADD COLUMN status TEXT NOT NULL DEFAULT 'actif';
  UPDATE clippers SET client_id = (
    SELECT a.client_id FROM accounts a WHERE a.clipper_id = clippers.id AND a.client_id IS NOT NULL LIMIT 1
  );

  ALTER TABLE clients ADD COLUMN monthly_fee_cents INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE videos ADD COLUMN thumbnail_url TEXT;
  CREATE INDEX videos_published ON videos(published_at);

  -- Strikes disciplinaires
  CREATE TABLE strikes (
    id         INTEGER PRIMARY KEY,
    clipper_id INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    reason     TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX strikes_clipper ON strikes(clipper_id, created_at);

  -- Retours du staff sur une vidéo ("Faire un retour")
  CREATE TABLE feedbacks (
    id         INTEGER PRIMARY KEY,
    clipper_id INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    video_id   INTEGER REFERENCES videos(id) ON DELETE SET NULL,
    message    TEXT    NOT NULL,
    delivered  INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX feedbacks_clipper ON feedbacks(clipper_id, created_at);

  -- Barèmes de rémunération : universel (scope_id 0), par agence, par clipper
  CREATE TABLE reward_rules (
    scope      TEXT    NOT NULL CHECK (scope IN ('universal', 'client', 'clipper')),
    scope_id   INTEGER NOT NULL DEFAULT 0,
    config     TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (scope, scope_id)
  );

  -- Réglages globaux (objectifs, seuils…) en JSON
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,

  // v2 bis : les tarifs posés avec /client deviennent le barème de l'agence
  (db) => {
    const rows = db.prepare('SELECT id, rate_per_1k_cents, min_views, cap_cents, created_at FROM clients').all() as Array<{
      id: number;
      rate_per_1k_cents: number;
      cap_cents: number | null;
      created_at: number;
    }>;
    const insert = db.prepare(
      "INSERT OR IGNORE INTO reward_rules (scope, scope_id, config, updated_at) VALUES ('client', ?, ?, ?)",
    );
    for (const r of rows) {
      if (r.rate_per_1k_cents <= 0) continue;
      const config = {
        base: { enabled: true, perView: r.rate_per_1k_cents / 100 / 1000 },
        cap: r.cap_cents ? r.cap_cents / 100 : null,
      };
      insert.run(r.id, JSON.stringify(config), r.created_at);
    }
  },
];
