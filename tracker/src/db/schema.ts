/**
 * Migrations appliquées dans l'ordre. Ne jamais modifier une migration déjà déployée :
 * en ajouter une nouvelle à la fin.
 * Toutes les dates sont des timestamps en millisecondes (UTC).
 */
export const MIGRATIONS: readonly string[] = [
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
];
