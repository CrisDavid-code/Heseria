/**
 * HESERIA — Siembra de la base de datos.
 *
 * Toma `data/dataset.json` (exportado desde el dataset que ya usaba la app) y
 * lo convierte en filas reales: catálogo, cuentas con contraseña, membresías,
 * publicaciones, oraciones, conversaciones, donaciones y métricas iniciales.
 *
 *   node src/seed.js            → siembra solo si la base está vacía
 *   node src/seed.js --reset    → borra y vuelve a sembrar
 */
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalog, db, DATA_DIR, newId, setSetting } from "./db.js";
import { guatemalanChurches } from "./churches-gt.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RESET = process.argv.includes("--reset");

/** Contraseña de todas las cuentas sembradas. Solo para demostración. */
export const SEED_PASSWORD = "heseria";

/* Determinismo: mismo dataset, mismos números, en cualquier máquina. */
function seeded(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
const between = (n, min, max) => Math.floor(seeded(n) * (max - min + 1)) + min;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

function loadDataset() {
  const file = path.join(DATA_DIR, "dataset.json");
  if (!fs.existsSync(file)) {
    throw new Error("Falta data/dataset.json. Ejecuta: node src/export-dataset.mjs");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const TABLES = [
  "moderation", "volunteer_applications", "donations", "event_rsvps", "group_members",
  "church_members", "messages", "conversation_members", "conversations", "history",
  "downloads", "library_items", "lesson_progress", "enrollments", "prayer_prays",
  "prayers", "follows", "comments", "post_likes", "posts", "activity", "views",
  "push_tokens", "notifications", "auto_rules", "campaigns", "uploads", "content",
  "password_resets", "refresh_tokens", "users", "catalog", "settings",
];

function isSeeded() {
  return db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0;
}

function wipe() {
  db.pragma("foreign_keys = OFF");
  for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
  db.pragma("foreign_keys = ON");
}

/* ------------------------------------------------------------- catálogo */

/**
 * Ciudades de Guatemala para las cuentas sembradas. El dataset original era
 * chileno; se traslada para que las distancias y las iglesias cuadren.
 */
const GT_CITIES = [
  "Ciudad de Guatemala", "Mixco", "Villa Nueva", "Quetzaltenango", "Antigua Guatemala",
  "Escuintla", "Chimaltenango", "Cobán", "Huehuetenango", "Retalhuleu",
];

function seedCatalog(data) {
  const pairs = [
    ["church", data.churches], ["ministry", data.ministries], ["artist", data.artists],
    ["song", data.songs], ["album", data.albums], ["playlist", data.playlists],
    ["podcast", data.podcasts], ["sermon", data.sermons], ["video", data.videos],
    ["movie", data.movies], ["series", data.series], ["course", data.courses],
    ["devotional", data.devotionals], ["plan", data.plans], ["event", data.events],
    ["group", data.groups], ["foundationCase", data.foundationCases],
    ["volunteerOpportunity", data.volunteerOpportunities],
    ["bibleVersion", data.bibleVersions], ["bibleBook", data.bibleBooks],
  ];
  const insert = db.prepare(
    "INSERT OR REPLACE INTO catalog (kind, id, data, sort) VALUES (?, ?, ?, ?)",
  );
  const run = db.transaction(() => {
    for (const [kind, list] of pairs) {
      if (kind === "church") continue;
      list.forEach((item, i) => insert.run(kind, item.id, JSON.stringify(item), i));
    }

    // Iglesias evangélicas de Guatemala, con coordenadas reales.
    const pastors = data.users.filter((u) => u.role === "pastor").map((u) => u.id);
    guatemalanChurches(pastors).forEach((church, i) =>
      insert.run("church", church.id, JSON.stringify(church), i),
    );
    data.bibleChapters.forEach((c, i) => {
      insert.run("bibleChapter", `${c.book}.${c.chapter}`, JSON.stringify(c), i);
    });
  });
  run();
  setSetting("verseOfTheDay", data.verseOfTheDay);
}

/* -------------------------------------------------------------- cuentas */

/** Quita acentos: los correos y los alias se escriben en ASCII. */
const ascii = (text) =>
  String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * El dataset reutiliza veinte nombres para veintiocho personas, así que hay
 * correos y alias repetidos. En una base de datos real deben ser únicos: al
 * segundo homónimo se le añade un número.
 */
function uniquify(values) {
  const used = new Map();
  return values.map((value) => {
    const base = ascii(value);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    if (!seen) return base;
    const [local, domain] = base.split("@");
    return domain ? `${local}${seen + 1}@${domain}` : `${base}${seen + 1}`;
  });
}

function seedUsers(data) {
  const hash = bcrypt.hashSync(SEED_PASSWORD, 10);
  const emails = uniquify(data.users.map((u) => u.email));
  const handles = uniquify(data.users.map((u) => u.handle));
  const insert = db.prepare(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, name, handle, role,
                       bio, city, country, church_id, color, interests, ministries,
                       followers, following, onboarded, joined_at, last_seen_at)
    VALUES (@id, @email, @hash, @firstName, @lastName, @name, @handle, @role,
            @bio, @city, @country, @churchId, @color, @interests, @ministries,
            @followers, @following, 1, @joinedAt, @lastSeen)
  `);
  const run = db.transaction(() => {
    data.users.forEach((u, i) => {
      insert.run({
        id: u.id, email: emails[i], hash, firstName: u.firstName, lastName: u.lastName,
        name: u.name, handle: handles[i], role: u.role, bio: u.bio,
        city: GT_CITIES[i % GT_CITIES.length],
        country: "Guatemala",
        churchId: u.churchId ?? null, color: u.color,
        interests: JSON.stringify(u.interests ?? []),
        ministries: JSON.stringify(u.ministries ?? []),
        followers: u.followers, following: u.following, joinedAt: u.joinedAt,
        lastSeen: daysAgo(between(i + 1, 0, 12)),
      });
    });
  });
  run();
}

/**
 * Las diez personas demo comparten cuenta con su usuario, pero cada una recibe
 * un alias de correo propio para poder entrar directamente con su rol.
 */
function seedPersonaAliases(data) {
  const hash = bcrypt.hashSync(SEED_PASSWORD, 10);
  const exists = db.prepare("SELECT 1 FROM users WHERE email = ?");
  const insert = db.prepare(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, name, handle, role,
                       bio, city, country, church_id, color, interests, ministries,
                       followers, following, onboarded, joined_at)
    VALUES (@id, @email, @hash, @firstName, @lastName, @name, @handle, @role,
            @bio, @city, @country, @churchId, @color, '[]', '[]', @followers, @following, 1, @joinedAt)
  `);
  const run = db.transaction(() => {
    data.demoPersonas.forEach((p, i) => {
      const base = data.users.find((u) => u.id === p.userId) ?? data.users[0];
      const email = `${p.role.replace(/_/g, "")}@heseria.app`;
      if (exists.get(email)) return;
      insert.run({
        id: `demo_${p.role}`, email, hash,
        firstName: base.firstName, lastName: base.lastName, name: base.name,
        handle: `${ascii(base.handle)}.${p.role}`, role: p.role, bio: base.bio,
        city: GT_CITIES[i % GT_CITIES.length], country: "Guatemala",
        churchId: base.churchId ?? null,
        color: base.color, followers: base.followers, following: base.following,
        joinedAt: base.joinedAt,
      });
      void i;
    });
  });
  run();
}

/* --------------------------------------------------------- relaciones */

function seedMemberships(data) {
  const church = db.prepare(
    "INSERT OR IGNORE INTO church_members (church_id, user_id, role) VALUES (?, ?, ?)",
  );
  const group = db.prepare(
    "INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)",
  );
  const follow = db.prepare(
    "INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)",
  );
  const rsvp = db.prepare(
    "INSERT OR IGNORE INTO event_rsvps (event_id, user_id, status) VALUES (?, ?, 'going')",
  );

  const run = db.transaction(() => {
    for (const u of data.users) {
      if (!u.churchId) continue;
      const c = data.churches.find((x) => x.id === u.churchId);
      church.run(u.churchId, u.id, c && c.pastorId === u.id ? "pastor" : "member");
    }
    for (const g of data.groups) {
      g.members.forEach((uid, i) => group.run(g.id, uid, i === 0 ? "leader" : "member"));
    }
    // Red social inicial: cada usuario sigue a otros cuatro, de forma estable.
    data.users.forEach((u, i) => {
      for (let k = 1; k <= 4; k++) {
        const target = data.users[(i + k * 3 + 1) % data.users.length];
        if (target.id !== u.id) follow.run(u.id, target.id);
      }
    });
    data.events.forEach((e, i) => {
      for (let k = 0; k < 6; k++) {
        rsvp.run(e.id, data.users[(i * 5 + k) % data.users.length].id);
      }
    });
  });
  run();
}

function seedCommunity(data) {
  const post = db.prepare(`
    INSERT INTO posts (id, author_id, group_id, type, body, reference, color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const like = db.prepare("INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)");
  const comment = db.prepare(`
    INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)
  `);
  const run = db.transaction(() => {
    data.posts.forEach((p, pi) => {
      post.run(
        p.id, p.authorId, p.groupId ?? null, p.type, p.body,
        JSON.stringify(p.hashtags ?? []), p.color, p.createdAt,
      );
      // El contador del dataset se materializa en «me gusta» reales.
      const likes = Math.min(p.likes ?? 0, data.users.length);
      for (let k = 0; k < likes; k++) like.run(p.id, data.users[(pi + k) % data.users.length].id);
      (p.comments ?? []).forEach((c) =>
        comment.run(c.id, p.id, c.authorId, c.body, c.createdAt),
      );
    });
  });
  run();
}

function seedPrayers(data) {
  const prayer = db.prepare(`
    INSERT INTO prayers (id, author_id, title, body, category, scope, church_id, answered, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const pray = db.prepare("INSERT OR IGNORE INTO prayer_prays (prayer_id, user_id) VALUES (?, ?)");
  const run = db.transaction(() => {
    data.prayers.forEach((p, pi) => {
      const author = data.users.find((u) => u.id === p.authorId);
      prayer.run(
        p.id, p.authorId, p.title, p.body, p.category,
        p.visibility === "private" ? "church" : "all",
        author?.churchId ?? null, p.answered ? 1 : 0, p.createdAt,
      );
      const count = Math.min(p.prayingCount ?? 0, data.users.length);
      for (let k = 0; k < count; k++) pray.run(p.id, data.users[(pi * 2 + k) % data.users.length].id);
    });
  });
  run();
}

function seedMessages(data) {
  const conv = db.prepare(
    "INSERT INTO conversations (id, kind, title, color, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const member = db.prepare(
    "INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)",
  );
  const msg = db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, body, kind, reaction, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const run = db.transaction(() => {
    for (const c of data.conversations) {
      conv.run(c.id, c.kind, c.title, c.color, c.lastMessageAt);
      for (const uid of c.participantIds) member.run(c.id, uid);
    }
    data.messages.forEach((m, i) => {
      msg.run(
        m.id, m.conversationId, m.authorId, m.body, m.kind ?? "text",
        (m.reactions ?? [])[0] ?? null, i % 5 === 0 ? 0 : 1, m.createdAt,
      );
    });
  });
  run();
}

function seedFoundation(data) {
  const donation = db.prepare(`
    INSERT INTO donations (id, user_id, project_id, project, amount, currency, method,
                           recurring, status, reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'card', ?, ?, ?, ?)
  `);
  const run = db.transaction(() => {
    data.donations.forEach((d) => {
      const project = data.foundationCases.find((c) => c.id === d.projectId);
      donation.run(
        d.id, d.donorId, d.projectId, project?.title ?? "Fondo general", d.amount,
        d.currency, d.frequency === "Única" ? 0 : 1, d.status,
        `HSR-${d.id.toUpperCase()}`, d.createdAt,
      );
    });
  });
  run();
}

function seedModeration(data) {
  const insert = db.prepare(`
    INSERT INTO moderation (id, target_kind, target_id, excerpt, reason, severity,
                            reporter_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const run = db.transaction(() => {
    for (const m of data.moderationQueue) {
      insert.run(
        m.id, m.kind, m.targetId, m.excerpt, m.reason, m.severity,
        m.reportedBy, m.status === "pendiente" ? "pending" : m.status, m.createdAt,
      );
    }
  });
  run();
}

/* ------------------------------------------------------- notificaciones */

const RULES = [
  ["r-content", "content.published", "Contenido nuevo publicado", "Nuevo en Heseria: {titulo}",
   "Toca para verlo ahora.", "todos", 1],
  ["r-devotional", "devotional.daily", "Devocional diario", "Tu devocional de hoy ya está listo",
   "Unos minutos con Dios para empezar el día.", "activos", 1],
  ["r-event", "event.created", "Evento nuevo de tu iglesia", "Nuevo evento: {titulo}",
   "Reserva tu lugar desde la app.", "mi-iglesia", 1],
  ["r-course", "course.published", "Curso nuevo en la Academia", "Nuevo curso disponible: {titulo}",
   "Matrícula abierta en la Academia.", "activos", 0],
  ["r-prayer", "prayer.answered", "Oración respondida", "Una oración por la que oraste fue respondida",
   "Entra a leer el testimonio.", "todos", 1],
];

function seedRules() {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO auto_rules (id, event, label, title, body, segment, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const run = db.transaction(() => RULES.forEach((r) => insert.run(...r)));
  run();
}

function seedNotifications(data) {
  const insert = db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, href, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const run = db.transaction(() => {
    for (const u of data.users) {
      data.notifications.forEach((n, i) => {
        insert.run(
          `${n.id}_${u.id}`, u.id, n.category, n.title, n.body, n.href,
          u.id === "u1" ? (n.read ? 1 : 0) : i % 3 === 0 ? 0 : 1, n.createdAt,
        );
      });
    }
  });
  run();
}

/* ------------------------------------------------------------- métricas */

function seedActivity(data) {
  const activity = db.prepare("INSERT INTO activity (user_id, type, at) VALUES (?, 'open', ?)");
  const view = db.prepare(
    "INSERT INTO views (user_id, item_kind, item_id, seconds, at) VALUES (?, ?, ?, ?, ?)",
  );
  const history = db.prepare(
    "INSERT INTO history (user_id, kind, item_id, position_sec, progress, at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const enroll = db.prepare(
    "INSERT OR IGNORE INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)",
  );
  const lib = db.prepare(
    "INSERT OR IGNORE INTO library_items (user_id, kind, item_id) VALUES (?, ?, ?)",
  );

  const run = db.transaction(() => {
    data.users.forEach((u, i) => {
      // 80 % de las cuentas activas el último mes; el resto, hace más tiempo.
      const active = seeded(i + 7) < 0.8;
      const sessions = active ? between(i + 11, 4, 26) : 1;
      for (let s = 0; s < sessions; s++) {
        activity.run(u.id, daysAgo(active ? between(i * 31 + s, 0, 29) : between(i + s, 40, 90)));
      }
      if (!active) return;
      for (let k = 0; k < 6; k++) {
        const song = data.songs[(i * 3 + k) % data.songs.length];
        view.run(u.id, "song", song.id, between(i + k, 60, 240), daysAgo(between(i + k * 2, 0, 27)));
      }
      for (let k = 0; k < 3; k++) {
        const sermon = data.sermons[(i + k) % data.sermons.length];
        view.run(u.id, "sermon", sermon.id, between(i * 7 + k, 300, 2400), daysAgo(between(i + k, 0, 20)));
      }
    });

    // El usuario de referencia arranca con historial y biblioteca reales.
    const me = "u1";
    data.songs.slice(0, 6).forEach((s, i) =>
      history.run(me, "song", s.id, between(i + 3, 30, s.durationSec), seeded(i + 5), daysAgo(i)),
    );
    data.courses.slice(0, 3).forEach((c, i) => {
      enroll.run(me, c.id, daysAgo(20 - i * 5));
      history.run(me, "course", c.id, 0, seeded(i + 2), daysAgo(i + 1));
    });
    data.movies.slice(0, 2).forEach((m, i) =>
      history.run(me, "movie", m.id, between(i + 9, 300, 3600), seeded(i + 8), daysAgo(i + 2)),
    );
    data.songs.slice(0, 8).forEach((s) => lib.run(me, "song", s.id));
    data.sermons.slice(0, 4).forEach((s) => lib.run(me, "sermon", s.id));
    data.courses.slice(0, 3).forEach((c) => lib.run(me, "course", c.id));
    data.movies.slice(0, 3).forEach((m) => lib.run(me, "movie", m.id));
    data.playlists.slice(0, 3).forEach((p) => lib.run(me, "playlist", p.id));
  });
  run();
}

/* -------------------------------------------- contenido de demostración */

/**
 * Registra los medios generados en `server/media/` como contenido publicado,
 * para que la app arranque con audio y video que se reproducen de verdad.
 */
function seedDemoMedia() {
  const manifest = path.join(here, "../media/manifest.json");
  if (!fs.existsSync(manifest)) return 0;
  const items = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const insert = db.prepare(`
    INSERT OR REPLACE INTO content (id, kind, title, subtitle, description, category,
      duration_sec, source_url, provider, origin, color, status, published, created_by, created_at)
    VALUES (@id, @kind, @title, @subtitle, @description, @category, @duration,
            @url, @provider, 'link', @color, 'publicado', 1, 'u28', @createdAt)
  `);
  const run = db.transaction(() => {
    items.forEach((m, i) =>
      insert.run({
        id: m.id, kind: m.kind, title: m.title, subtitle: m.subtitle,
        description: m.description, category: m.category, duration: m.durationSec,
        url: `/media/${m.file}`, provider: m.provider, color: m.color,
        createdAt: daysAgo(items.length - i),
      }),
    );
  });
  run();
  return items.length;
}

/**
 * Enlaza los medios generados con el catálogo.
 *
 * Sin esto el catálogo son fichas sin reproducir. Al asignar a cada canción,
 * sermón, video, película, episodio y lección uno de los archivos originales
 * de `server/media/`, TODO el catálogo se reproduce de verdad y se puede
 * probar el reproductor de punta a punta. Es material de demostración
 * explícito: tres pistas y un video, rotando.
 */
function attachMedia() {
  const manifest = path.join(here, "../media/manifest.json");
  if (!fs.existsSync(manifest)) return 0;
  const media = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const audio = media.filter((m) => m.kind === "song").map((m) => `/media/${m.file}`);
  const video = media.filter((m) => m.kind === "video").map((m) => `/media/${m.file}`);
  if (!audio.length || !video.length) return 0;

  const pickAudio = (i) => audio[i % audio.length];
  const pickVideo = (i) => video[i % video.length];
  let touched = 0;

  const patch = (kind, fn) => {
    catalog.all(kind).forEach((item, i) => {
      const next = fn(item, i);
      if (next) {
        catalog.put(kind, item.id, next, i);
        touched++;
      }
    });
  };

  patch("song", (s, i) => ({ ...s, audioUrl: pickAudio(i), demoMedia: true }));
  patch("sermon", (s, i) => ({ ...s, videoUrl: pickVideo(i), audioUrl: pickAudio(i), demoMedia: true }));
  patch("video", (v, i) => ({ ...v, videoUrl: pickVideo(i), demoMedia: true }));
  patch("movie", (m, i) => ({ ...m, videoUrl: pickVideo(i), demoMedia: true }));

  patch("podcast", (p, i) => ({
    ...p,
    demoMedia: true,
    episodes: (p.episodes ?? []).map((e, k) => ({ ...e, audioUrl: pickAudio(i + k) })),
  }));

  patch("series", (s, i) => ({
    ...s,
    demoMedia: true,
    seasons: (s.seasons ?? []).map((season) => ({
      ...season,
      episodes: season.episodes.map((e, k) => ({ ...e, videoUrl: pickVideo(i + k) })),
    })),
  }));

  patch("course", (c, i) => ({
    ...c,
    demoMedia: true,
    modules: (c.modules ?? []).map((m, mi) => ({
      ...m,
      lessons: m.lessons.map((l, li) => ({ ...l, videoUrl: pickVideo(i + mi + li) })),
    })),
  }));

  return touched;
}

/* ----------------------------------------------------------------- main */

export function seed({ reset = false } = {}) {
  const data = loadDataset();
  if (reset) wipe();
  else if (isSeeded()) return { skipped: true };

  seedCatalog(data);
  seedUsers(data);
  seedPersonaAliases(data);
  seedMemberships(data);
  seedCommunity(data);
  seedPrayers(data);
  seedMessages(data);
  seedFoundation(data);
  seedModeration(data);
  seedRules();
  seedNotifications(data);
  seedActivity(data);
  const media = seedDemoMedia();
  const linked = attachMedia();

  setSetting("seededAt", new Date().toISOString());
  return {
    skipped: false,
    users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
    catalog: db.prepare("SELECT COUNT(*) AS n FROM catalog").get().n,
    posts: db.prepare("SELECT COUNT(*) AS n FROM posts").get().n,
    views: db.prepare("SELECT COUNT(*) AS n FROM views").get().n,
    media,
    linked,
  };
}

// Solo se siembra al invocar este archivo directamente, no al importarlo.
if (process.argv[1]?.endsWith("seed.js")) {
  const result = seed({ reset: RESET });
  if (result.skipped) console.log("La base ya estaba sembrada. Usa --reset para rehacerla.");
  else console.log("Sembrado:", result);
}

void newId;
void catalog;
