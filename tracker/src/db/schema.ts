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

  // v3 : vues de référence des vidéos découvertes après le début du suivi
  `ALTER TABLE videos ADD COLUMN baseline_views INTEGER NOT NULL DEFAULT 0;`,

  // v4 : recrutement (phase 2)
  `
  -- Membres qui invitent des candidats sur le serveur (suivi des invitations Discord)
  CREATE TABLE recruiters (
    id         INTEGER PRIMARY KEY,
    discord_id TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  -- Étape dans le parcours : invite → test → clipper (ou refuse).
  -- Les clippers existants sont déjà "clipper".
  ALTER TABLE clippers ADD COLUMN stage TEXT NOT NULL DEFAULT 'clipper';
  ALTER TABLE clippers ADD COLUMN recruiter_id INTEGER REFERENCES recruiters(id) ON DELETE SET NULL;
  ALTER TABLE clippers ADD COLUMN joined_at INTEGER;
  ALTER TABLE clippers ADD COLUMN validated_at INTEGER;
  ALTER TABLE clippers ADD COLUMN private_channel_id TEXT;
  ALTER TABLE clippers ADD COLUMN drive_url TEXT;
  CREATE INDEX clippers_stage ON clippers(stage);
  CREATE INDEX clippers_channel ON clippers(private_channel_id);

  -- Test de clip : open → submitted → (changes → submitted…) → validated | refused
  CREATE TABLE tests (
    id             INTEGER PRIMARY KEY,
    clipper_id     INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    channel_id     TEXT,
    status         TEXT    NOT NULL DEFAULT 'open',
    submission_url TEXT,
    submitted_at   INTEGER,
    attempts       INTEGER NOT NULL DEFAULT 0,
    reviewed_at    INTEGER,
    note           TEXT,
    created_at     INTEGER NOT NULL
  );
  CREATE INDEX tests_clipper ON tests(clipper_id, created_at);

  -- Demandes à traiter par le staff : /inscription, /avis
  CREATE TABLE requests (
    id         INTEGER PRIMARY KEY,
    clipper_id INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL CHECK (kind IN ('inscription', 'avis')),
    payload    TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    done_at    INTEGER
  );
  CREATE INDEX requests_pending ON requests(kind, done_at);

  -- Messages des salons privés (tests / tickets) : réactivité du staff
  CREATE TABLE channel_messages (
    id         INTEGER PRIMARY KEY,
    channel_id TEXT    NOT NULL,
    clipper_id INTEGER REFERENCES clippers(id) ON DELETE CASCADE,
    is_staff   INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX channel_messages_channel ON channel_messages(channel_id, created_at);

  -- Présence dans le salon vocal des calls
  CREATE TABLE voice_sessions (
    id         INTEGER PRIMARY KEY,
    discord_id TEXT    NOT NULL,
    channel_id TEXT    NOT NULL,
    joined_at  INTEGER NOT NULL,
    left_at    INTEGER
  );
  CREATE INDEX voice_sessions_time ON voice_sessions(joined_at);
  `,

  // v5 : candidatures (ticket + formulaire) et départs, repris du bot « Lune Builder »
  `
  CREATE TABLE candidatures (
    id               INTEGER PRIMARY KEY,
    clipper_id       INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    channel_id       TEXT,
    status           TEXT    NOT NULL DEFAULT 'open', -- open | submitted | accepted | refused
    answers          TEXT,
    opened_at        INTEGER NOT NULL,
    submitted_at     INTEGER,
    relances         INTEGER NOT NULL DEFAULT 0,
    decided_at       INTEGER,
    decided_by       TEXT,
    staff_message_id TEXT
  );
  CREATE INDEX candidatures_status ON candidatures(status);
  CREATE INDEX candidatures_channel ON candidatures(channel_id);

  CREATE TABLE departures (
    id         INTEGER PRIMARY KEY,
    discord_id TEXT    NOT NULL,
    username   TEXT    NOT NULL,
    roles      TEXT,
    joined_at  INTEGER,
    left_at    INTEGER NOT NULL,
    dm_sent    INTEGER NOT NULL DEFAULT 0,
    reason     TEXT
  );
  CREATE INDEX departures_user ON departures(discord_id, left_at);
  `,

  // v6 : programme fans (bot Neptune) : espace fan, points, boutique, livraison dans le jeu Roblox
  `
  ALTER TABLE clippers ADD COLUMN roblox_username TEXT;
  ALTER TABLE clippers ADD COLUMN roblox_user_id INTEGER;
  CREATE INDEX clippers_roblox ON clippers(roblox_user_id);

  -- Liens de connexion (10 min, usage unique) et sessions de l'espace fan. Seul le hash est stocké.
  CREATE TABLE fan_tokens (
    hash       TEXT    PRIMARY KEY,
    clipper_id INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL CHECK (kind IN ('login', 'session')),
    expires_at INTEGER NOT NULL,
    used_at    INTEGER
  );

  CREATE TABLE shop_items (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    image_url   TEXT,
    price       INTEGER NOT NULL,
    kind        TEXT    NOT NULL DEFAULT 'item' CHECK (kind IN ('gamepass', 'item')),
    -- Identifiant compris par le jeu (ID du gamepass, nom de l'objet…)
    ref         TEXT    NOT NULL,
    stock       INTEGER,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL
  );

  -- Commande : pending → delivered (le jeu a donné l'objet) | refunded (points rendus)
  CREATE TABLE shop_orders (
    id           INTEGER PRIMARY KEY,
    clipper_id   INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    item_id      INTEGER REFERENCES shop_items(id) ON DELETE SET NULL,
    item_name    TEXT    NOT NULL,
    kind         TEXT    NOT NULL,
    ref          TEXT    NOT NULL,
    price        INTEGER NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pending',
    created_at   INTEGER NOT NULL,
    delivered_at INTEGER
  );
  CREATE INDEX shop_orders_clipper ON shop_orders(clipper_id, status);
  `,

  // v7 : avatar Discord des fans (classement, profil)
  `ALTER TABLE clippers ADD COLUMN avatar_url TEXT;`,

  // v8 : notifications Discord des fans (envoyées par Neptune)
  `
  ALTER TABLE clippers ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;

  -- Où en est chaque fan : coins déjà annoncés, niveau annoncé, dernier message
  CREATE TABLE fan_notify_state (
    clipper_id   INTEGER PRIMARY KEY REFERENCES clippers(id) ON DELETE CASCADE,
    earned_base  INTEGER NOT NULL,
    level        INTEGER NOT NULL,
    last_sent_at INTEGER
  );

  -- Événements déjà annoncés (objet abordable, top 3 de la semaine, commande livrée)
  CREATE TABLE fan_notified (
    clipper_id INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    key        TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (clipper_id, key)
  );

  -- File d'attente des messages privés à envoyer par Neptune
  CREATE TABLE fan_notifications (
    id         INTEGER PRIMARY KEY,
    clipper_id INTEGER NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
    discord_id TEXT    NOT NULL,
    kind       TEXT    NOT NULL,
    text       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    sent_at    INTEGER,
    error      TEXT
  );
  CREATE INDEX fan_notifications_pending ON fan_notifications(sent_at, error);
  `,

  // v9 : livraison par l'API du jeu (nouvelles tentatives, dernière erreur)
  `
  ALTER TABLE shop_orders ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE shop_orders ADD COLUMN next_try_at INTEGER;
  ALTER TABLE shop_orders ADD COLUMN delivery_error TEXT;
  `,

  // v10 : e-mail de livraison des récompenses (créateurs dont la récompense n'est pas en jeu)
  `ALTER TABLE clippers ADD COLUMN reward_email TEXT;`,

  // v11 : coins ajoutés à la main par le staff (tests, gestes commerciaux)
  `ALTER TABLE clippers ADD COLUMN bonus_coins INTEGER NOT NULL DEFAULT 0;`,

  // v12 : comptes des fans vérifiés par un code dans la bio (anti-vol de compte), abonnés,
  // et fans « à vérifier » par le staff (gros compte / vidéo qui explose) : achats bloqués d'ici là.
  // Comptes déjà suivis : considérés vérifiés.
  `
  ALTER TABLE accounts ADD COLUMN verified_at INTEGER;
  ALTER TABLE accounts ADD COLUMN followers INTEGER;
  UPDATE accounts SET verified_at = created_at;
  ALTER TABLE clippers ADD COLUMN verify_code TEXT;
  ALTER TABLE clippers ADD COLUMN review_status TEXT;
  `,

  // v13 : vérification des clips des fans par IA (clip du bon créateur ?) ; le code dans la bio n'est plus exigé
  `
  ALTER TABLE videos ADD COLUMN clip_check TEXT;
  ALTER TABLE videos ADD COLUMN clip_reason TEXT;
  UPDATE accounts SET verified_at = created_at WHERE verified_at IS NULL;
  `,

  // v14 : chaque achat est validé par le staff avant livraison (il regarde les clips qui ont rapporté les coins)
  `
  ALTER TABLE shop_orders ADD COLUMN approved_at INTEGER;
  UPDATE shop_orders SET approved_at = created_at;
  `,

  // v15 : TikTok connecté par le clippeur (API officielle gratuite) : jetons OAuth par compte
  `
  CREATE TABLE tiktok_tokens (
    account_id         INTEGER PRIMARY KEY REFERENCES accounts(id),
    open_id            TEXT NOT NULL,
    access_token       TEXT NOT NULL,
    refresh_token      TEXT NOT NULL,
    expires_at         INTEGER NOT NULL,
    refresh_expires_at INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
  );
  `,
];
