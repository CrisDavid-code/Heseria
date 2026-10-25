/**
 * HESERIA — Base de datos (SQLite).
 *
 * Dos zonas bien diferenciadas:
 *
 *   1. `catalog`  — el contenido editorial (canciones, cursos, películas…).
 *      Se guarda como documento JSON por (kind, id). Es lo que el superadmin
 *      administra y lo que la app descarga; cambiarlo NO exige actualizar la
 *      aplicación porque viaja como dato, no como código.
 *
 *   2. Tablas relacionales — todo lo que crea o cambia un usuario: cuentas,
 *      sesiones, publicaciones, oraciones, matrículas, vistas, donaciones…
 *
 * SQLite mantiene el despliegue en un solo archivo. El esquema es SQL estándar,
 * así que migrar a PostgreSQL más adelante es un cambio de driver, no de diseño.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(here, "../data");
export const UPLOAD_DIR = path.resolve(here, "../uploads");
export const MEDIA_DIR = path.resolve(here, "../media");

for (const dir of [DATA_DIR, UPLOAD_DIR, MEDIA_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(path.join(DATA_DIR, "heseria.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
/* ------------------------------------------------------------ catálogo */

CREATE TABLE IF NOT EXISTS catalog (
  kind        TEXT NOT NULL,
  id          TEXT NOT NULL,
  data        TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_kind ON catalog(kind, sort);

/* -------------------------------------------------------------- cuentas */

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  name           TEXT NOT NULL,
  handle         TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user',
  bio            TEXT NOT NULL DEFAULT '',
  city           TEXT NOT NULL DEFAULT '',
  country        TEXT NOT NULL DEFAULT '',
  church_id      TEXT,
  birth_date     TEXT,
  color          TEXT NOT NULL DEFAULT 'from-cyan-500 to-blue-600',
  avatar_url     TEXT,
  interests      TEXT NOT NULL DEFAULT '[]',
  ministries     TEXT NOT NULL DEFAULT '[]',
  followers      INTEGER NOT NULL DEFAULT 0,
  following      INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active',
  onboarded      INTEGER NOT NULL DEFAULT 0,
  locale         TEXT NOT NULL DEFAULT 'es',
  joined_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_seen_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_church ON users(church_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device      TEXT NOT NULL DEFAULT 'unknown',
  expires_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

/* ------------------------------------------------- contenido subido/enlazado */

CREATE TABLE IF NOT EXISTS content (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  subtitle     TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT '',
  duration_sec INTEGER NOT NULL DEFAULT 0,
  source_url   TEXT NOT NULL DEFAULT '',
  provider     TEXT NOT NULL DEFAULT 'unknown',
  embed_url    TEXT,
  origin       TEXT NOT NULL DEFAULT 'link',
  upload_id    TEXT,
  color        TEXT NOT NULL DEFAULT 'from-cyan-500 to-blue-600',
  status       TEXT NOT NULL DEFAULT 'publicado',
  published    INTEGER NOT NULL DEFAULT 1,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_content_kind ON content(kind, published);

CREATE TABLE IF NOT EXISTS uploads (
  id            TEXT PRIMARY KEY,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  owner_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

/* --------------------------------------------------------- notificaciones */

CREATE TABLE IF NOT EXISTS campaigns (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  segment      TEXT NOT NULL DEFAULT 'todos',
  href         TEXT NOT NULL DEFAULT '/home',
  status       TEXT NOT NULL DEFAULT 'enviada',
  source       TEXT NOT NULL DEFAULT 'manual',
  content_id   TEXT,
  scheduled_at TEXT,
  sent_at      TEXT,
  audience     INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS auto_rules (
  id         TEXT PRIMARY KEY,
  event      TEXT NOT NULL,
  label      TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  segment    TEXT NOT NULL DEFAULT 'todos',
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'system',
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  href        TEXT NOT NULL DEFAULT '/home',
  read        INTEGER NOT NULL DEFAULT 0,
  opened_at   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notif_campaign ON notifications(campaign_id);

CREATE TABLE IF NOT EXISTS push_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL DEFAULT 'web',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

/* -------------------------------------------------------------- métricas */

CREATE TABLE IF NOT EXISTS views (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_kind TEXT NOT NULL,
  item_id   TEXT NOT NULL,
  seconds   INTEGER NOT NULL DEFAULT 0,
  at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_views_item ON views(item_id);
CREATE INDEX IF NOT EXISTS idx_views_user ON views(user_id, at);

CREATE TABLE IF NOT EXISTS activity (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type    TEXT NOT NULL DEFAULT 'open',
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_at ON activity(at);

/* ------------------------------------------------------------- comunidad */

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id   TEXT,
  type       TEXT NOT NULL DEFAULT 'text',
  body       TEXT NOT NULL,
  reference  TEXT,
  color      TEXT NOT NULL DEFAULT 'from-cyan-500 to-blue-600',
  status     TEXT NOT NULL DEFAULT 'visible',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_group ON posts(group_id);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (follower_id, following_id)
);

/* --------------------------------------------------------------- oración */

CREATE TABLE IF NOT EXISTS prayers (
  id         TEXT PRIMARY KEY,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'General',
  scope      TEXT NOT NULL DEFAULT 'all',
  church_id  TEXT,
  anonymous  INTEGER NOT NULL DEFAULT 0,
  answered   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS prayer_prays (
  prayer_id TEXT NOT NULL REFERENCES prayers(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (prayer_id, user_id)
);

/* -------------------------------------------------------------- academia */

CREATE TABLE IF NOT EXISTS enrollments (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL,
  enrolled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL,
  lesson_id    TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (user_id, course_id, lesson_id)
);

/* ------------------------------------------------------------- biblioteca */

CREATE TABLE IF NOT EXISTS library_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,
  item_id TEXT NOT NULL,
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (user_id, kind, item_id)
);

CREATE TABLE IF NOT EXISTS downloads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,
  item_id TEXT NOT NULL,
  size_mb REAL NOT NULL DEFAULT 0,
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (user_id, kind, item_id)
);

CREATE TABLE IF NOT EXISTS history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  item_id      TEXT NOT NULL,
  position_sec INTEGER NOT NULL DEFAULT 0,
  progress     REAL NOT NULL DEFAULT 0,
  at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, at DESC);

/* --------------------------------------------------------------- mensajes */

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT 'direct',
  title      TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT 'from-cyan-500 to-blue-600',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'text',
  reaction        TEXT,
  read            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

/* ------------------------------------------------- iglesias, grupos, eventos */

CREATE TABLE IF NOT EXISTS church_members (
  church_id TEXT NOT NULL,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',
  at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (church_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'member',
  at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id TEXT NOT NULL,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status   TEXT NOT NULL DEFAULT 'going',
  at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (event_id, user_id)
);

/* ------------------------------------------------------------- fundación */

CREATE TABLE IF NOT EXISTS donations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id TEXT,
  project    TEXT NOT NULL DEFAULT '',
  amount     REAL NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'USD',
  method     TEXT NOT NULL DEFAULT 'card',
  recurring  INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'completada',
  reference  TEXT NOT NULL,
  donor_note TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS volunteer_applications (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL,
  message        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'recibida',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

/* ------------------------------------------------------------ moderación */

CREATE TABLE IF NOT EXISTS moderation (
  id          TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  excerpt     TEXT NOT NULL DEFAULT '',
  reason      TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'media',
  reporter_id TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  resolution  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_at TEXT
);

/* ---------------------------------------------------------------- Biblia */

/*
 * Lo que cada persona marca al leer: resaltados, notas y versículos guardados.
 * La referencia es «juan.3.16» —libro, capítulo y versículo— sin la versión,
 * porque una marca sigue siendo válida al cambiar de traducción.
 */
CREATE TABLE IF NOT EXISTS verse_marks (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference  TEXT NOT NULL,
  book       TEXT NOT NULL,
  chapter    INTEGER NOT NULL,
  verse      INTEGER NOT NULL,
  /* Color del resaltado, o NULL si solo está guardado o tiene nota. */
  color      TEXT,
  note       TEXT,
  saved      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (user_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_marks_chapter ON verse_marks(user_id, book, chapter);

/* ------------------------------------------------------------- ajustes */

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

db.exec(`
/* ------------------------------------------------------ podcasts por RSS */

CREATE TABLE IF NOT EXISTS podcast_feeds (
  id             TEXT PRIMARY KEY,
  feed_url       TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  author         TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  language       TEXT NOT NULL DEFAULT '',
  link           TEXT NOT NULL DEFAULT '',
  image          TEXT NOT NULL DEFAULT '',
  categories     TEXT NOT NULL DEFAULT '[]',
  color          TEXT NOT NULL DEFAULT 'from-cyan-500/70 to-blue-700/70',
  added_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_synced_at TEXT,
  sync_error     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id             TEXT PRIMARY KEY,
  feed_id        TEXT NOT NULL REFERENCES podcast_feeds(id) ON DELETE CASCADE,
  guid           TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  audio_url      TEXT NOT NULL,
  mime           TEXT NOT NULL DEFAULT 'audio/mpeg',
  size_bytes     INTEGER NOT NULL DEFAULT 0,
  duration_sec   INTEGER NOT NULL DEFAULT 0,
  published_at   TEXT NOT NULL,
  episode_number INTEGER,
  season         INTEGER,
  image          TEXT NOT NULL DEFAULT '',
  UNIQUE (feed_id, guid)
);
CREATE INDEX IF NOT EXISTS idx_episodes_feed ON podcast_episodes(feed_id, published_at DESC);
`);

/* ---------------------------------------------------------- migraciones */

/**
 * Añade columnas que no existían en versiones anteriores del esquema. SQLite no
 * tiene `ADD COLUMN IF NOT EXISTS`, así que se comprueba antes.
 */
function addColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn("donations", "donor_note", "TEXT");
addColumn("users", "cover_url", "TEXT");
addColumn("donations", "confirmed_at", "TEXT");
// Cuenta de Google enlazada. Se guarda el `sub`, que es estable aunque la
// persona cambie de correo en Google.
addColumn("users", "google_sub", "TEXT");

/*
 * Los archivos subidos dejan de ser anónimos: ahora saben a qué pertenecen
 * (una lección, un grupo, un mensaje), cómo se llaman para quien los lee y
 * quién puede descargarlos. Sin esto no se puede publicar el material de un
 * curso ni adjuntar nada a un mensaje.
 */
addColumn("uploads", "scope", "TEXT");
addColumn("uploads", "scope_id", "TEXT");
addColumn("uploads", "title", "TEXT");
addColumn("uploads", "visibility", "TEXT NOT NULL DEFAULT 'public'");
db.exec("CREATE INDEX IF NOT EXISTS idx_uploads_scope ON uploads(scope, scope_id)");

// Un mensaje puede llevar un archivo adjunto además de su texto.
addColumn("messages", "attachment_id", "TEXT");

/* ------------------------------------------------------------- helpers */

export const now = () => new Date().toISOString();

/** Id corto, ordenable en el tiempo y sin colisiones prácticas. */
export function newId(prefix = "id") {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}${rand}`;
}

export const json = {
  parse(value, fallback) {
    try {
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  stringify: (value) => JSON.stringify(value ?? null),
};

/* --------------------------------------------------------- catálogo API */

export const catalog = {
  all(kind) {
    return db
      .prepare("SELECT data FROM catalog WHERE kind = ? ORDER BY sort, id")
      .all(kind)
      .map((r) => JSON.parse(r.data));
  },
  get(kind, id) {
    const row = db.prepare("SELECT data FROM catalog WHERE kind = ? AND id = ?").get(kind, id);
    return row ? JSON.parse(row.data) : undefined;
  },
  put(kind, id, data, sort = 0) {
    db.prepare(
      `INSERT INTO catalog (kind, id, data, sort) VALUES (?, ?, ?, ?)
       ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
    ).run(kind, id, JSON.stringify(data), sort);
    return data;
  },
  remove(kind, id) {
    return db.prepare("DELETE FROM catalog WHERE kind = ? AND id = ?").run(kind, id).changes > 0;
  },
  count(kind) {
    return db.prepare("SELECT COUNT(*) AS n FROM catalog WHERE kind = ?").get(kind).n;
  },
};

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, JSON.stringify(value));
}

export function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? json.parse(row.value, fallback) : fallback;
}
