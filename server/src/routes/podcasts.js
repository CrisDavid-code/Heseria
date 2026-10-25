/**
 * HESERIA — Podcasts por RSS.
 *
 * Aquí sí hay audio de verdad dentro de la app: un feed de podcast publica el
 * MP3 sin cifrar precisamente para que las apps lo descarguen, que es como
 * funciona cualquier reproductor de podcasts. Así que un sermón o un programa
 * cristiano se escucha en Heseria, se guarda en el teléfono y suena sin datos,
 * sin romper las condiciones de nadie.
 *
 * El audio se sirve **a través de este servidor** y no con un enlace directo.
 * Suena a rodeo, pero es lo que hace que funcione:
 *
 *  · el servidor del podcast no manda cabeceras CORS, así que el navegador y el
 *    WebView no dejarían descargar el archivo desde la app,
 *  · se puede pedir por tramos y adelantar el episodio,
 *  · el dueño del feed ve una sola petición por escucha, no la IP de cada
 *    persona que escucha.
 */
import { Router } from "express";
import { requireAuth, requirePermission, optionalAuth } from "../auth.js";
import { db, newId } from "../db.js";
import { badRequest, forbidden, HttpError, notFound, str, wrap } from "../http.js";
import { assertSafeFeedUrl, readPodcastFeed } from "../rss.js";

export const podcastsRouter = Router();

const COLORS = [
  "from-cyan-500/70 to-blue-700/70",
  "from-violet-500/70 to-indigo-800/70",
  "from-amber-400/70 to-orange-700/70",
  "from-emerald-400/70 to-teal-800/70",
  "from-rose-400/70 to-purple-800/70",
];

const colorFor = (seed) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
};

/* ---------------------------------------------------------- presentación */

function publicFeed(row) {
  if (!row) return null;
  const episodes = db
    .prepare("SELECT COUNT(*) AS n FROM podcast_episodes WHERE feed_id = ?")
    .get(row.id).n;

  return {
    id: row.id,
    feedUrl: row.feed_url,
    title: row.title,
    author: row.author,
    description: row.description,
    language: row.language,
    link: row.link,
    image: row.image,
    categories: JSON.parse(row.categories || "[]"),
    color: row.color,
    episodes,
    lastSyncedAt: row.last_synced_at,
    syncError: row.sync_error,
    addedBy: row.added_by,
  };
}

function publicEpisode(row, feed) {
  if (!row) return null;
  return {
    id: row.id,
    feedId: row.feed_id,
    showTitle: feed?.title ?? "",
    showImage: feed?.image ?? "",
    color: feed?.color ?? COLORS[0],
    title: row.title,
    description: row.description,
    durationSec: row.duration_sec,
    sizeBytes: row.size_bytes,
    publishedAt: row.published_at,
    episodeNumber: row.episode_number,
    season: row.season,
    image: row.image || feed?.image || "",
    mime: row.mime,
    /** Se reproduce y se descarga por aquí, no por el enlace del feed. */
    audioUrl: `/api/podcast-episodes/${row.id}/audio`,
    /** La página del episodio en el sitio de quien lo publica. */
    sourceUrl: row.audio_url,
  };
}

const findFeed = (id) => db.prepare("SELECT * FROM podcast_feeds WHERE id = ?").get(id);

/* ------------------------------------------------------------ sincronizar */

/**
 * Lee el feed y guarda los episodios nuevos.
 *
 * Los existentes se actualizan por su `guid`, que es lo que identifica un
 * episodio aunque le cambien el título o muevan el archivo. Los que ya no están
 * en el feed **no se borran**: alguien puede haberlos descargado.
 */
async function syncFeed(feedId) {
  const feed = findFeed(feedId);
  if (!feed) throw notFound("Ese podcast ya no está.");

  let data;
  try {
    data = await readPodcastFeed(feed.feed_url);
  } catch (err) {
    db.prepare(
      "UPDATE podcast_feeds SET sync_error = ?, last_synced_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
    ).run(String(err.message).slice(0, 300), feedId);
    throw new HttpError(502, `No pudimos leer el feed: ${err.message}`, "feed_error");
  }

  db.prepare(`
    UPDATE podcast_feeds
       SET title = ?, author = ?, description = ?, language = ?, link = ?, image = ?,
           categories = ?, sync_error = NULL,
           last_synced_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = ?
  `).run(
    data.show.title, data.show.author, data.show.description, data.show.language,
    data.show.link, data.show.image, JSON.stringify(data.show.categories), feedId,
  );

  const insert = db.prepare(`
    INSERT INTO podcast_episodes (id, feed_id, guid, title, description, audio_url, mime,
                                  size_bytes, duration_sec, published_at, episode_number, season, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (feed_id, guid) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      audio_url = excluded.audio_url,
      mime = excluded.mime,
      size_bytes = excluded.size_bytes,
      duration_sec = excluded.duration_sec,
      published_at = excluded.published_at,
      episode_number = excluded.episode_number,
      season = excluded.season,
      image = excluded.image
  `);

  const before = db.prepare("SELECT COUNT(*) AS n FROM podcast_episodes WHERE feed_id = ?").get(feedId).n;

  const save = db.transaction((episodes) => {
    for (const e of episodes) {
      insert.run(
        newId("ep"), feedId, e.guid, e.title, e.description, e.audioUrl, e.mime,
        e.sizeBytes, e.durationSec, e.publishedAt, e.episodeNumber, e.season, e.image,
      );
    }
  });
  save(data.episodes);

  const after = db.prepare("SELECT COUNT(*) AS n FROM podcast_episodes WHERE feed_id = ?").get(feedId).n;
  return { feed: publicFeed(findFeed(feedId)), added: after - before, total: after };
}

/* ---------------------------------------------------------------- listar */

podcastsRouter.get(
  "/podcast-feeds",
  optionalAuth,
  wrap((_req, res) => {
    const rows = db.prepare("SELECT * FROM podcast_feeds ORDER BY title").all();
    res.json(rows.map(publicFeed));
  }),
);

podcastsRouter.get(
  "/podcast-feeds/:id",
  optionalAuth,
  wrap((req, res) => {
    const feed = findFeed(req.params.id);
    if (!feed) throw notFound("Ese podcast no existe.");

    const limit = Math.min(200, Number(req.query.limit) || 50);
    const rows = db
      .prepare("SELECT * FROM podcast_episodes WHERE feed_id = ? ORDER BY published_at DESC LIMIT ?")
      .all(feed.id, limit);

    res.json({ ...publicFeed(feed), items: rows.map((r) => publicEpisode(r, feed)) });
  }),
);

/** Lo último de todos los podcasts, que es con lo que se abre la pantalla. */
podcastsRouter.get(
  "/podcast-episodes",
  optionalAuth,
  wrap((req, res) => {
    const limit = Math.min(100, Number(req.query.limit) || 30);
    const rows = db
      .prepare("SELECT * FROM podcast_episodes ORDER BY published_at DESC LIMIT ?")
      .all(limit);

    const feeds = new Map(
      db.prepare("SELECT * FROM podcast_feeds").all().map((f) => [f.id, f]),
    );
    res.json(rows.map((r) => publicEpisode(r, feeds.get(r.feed_id))));
  }),
);

podcastsRouter.get(
  "/podcast-episodes/:id",
  optionalAuth,
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM podcast_episodes WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Ese episodio no existe.");
    res.json(publicEpisode(row, findFeed(row.feed_id)));
  }),
);

/* -------------------------------------------------------------- suscribir */

podcastsRouter.post(
  "/podcast-feeds",
  requireAuth,
  requirePermission("canPublish"),
  wrap(async (req, res) => {
    const raw = str(req.body?.feedUrl, "dirección del feed", { max: 1200 });

    let url;
    try {
      url = assertSafeFeedUrl(raw);
    } catch (err) {
      throw badRequest(err.message, "bad_feed_url");
    }

    const existing = db.prepare("SELECT * FROM podcast_feeds WHERE feed_url = ?").get(url);
    if (existing) {
      throw new HttpError(409, "Ese podcast ya está en Heseria.", "feed_exists");
    }

    const id = newId("pf");
    db.prepare(
      "INSERT INTO podcast_feeds (id, feed_url, title, color, added_by) VALUES (?, ?, ?, ?, ?)",
    ).run(id, url, "Cargando…", colorFor(url), req.user.id);

    try {
      const result = await syncFeed(id);
      res.status(201).json(result);
    } catch (err) {
      // Si el feed no sirve, no se deja una ficha rota en el catálogo.
      db.prepare("DELETE FROM podcast_feeds WHERE id = ?").run(id);
      throw err;
    }
  }),
);

podcastsRouter.post(
  "/podcast-feeds/:id/sync",
  requireAuth,
  requirePermission("canPublish"),
  wrap(async (req, res) => {
    res.json(await syncFeed(req.params.id));
  }),
);

podcastsRouter.delete(
  "/podcast-feeds/:id",
  requireAuth,
  wrap((req, res) => {
    const feed = findFeed(req.params.id);
    if (!feed) throw notFound("Ese podcast ya no está.");
    if (feed.added_by !== req.user.id && req.user.role !== "admin") {
      throw forbidden("Solo quien lo añadió puede quitarlo.");
    }
    db.prepare("DELETE FROM podcast_feeds WHERE id = ?").run(feed.id);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------- el audio */

/**
 * Sirve el audio del episodio trayéndolo de su origen.
 *
 * Se pasa el `Range` tal cual para que adelantar funcione, y se devuelve el
 * mismo estado que dé el origen. Si el episodio desapareció de su servidor, se
 * dice con claridad en vez de entregar una respuesta vacía que el reproductor
 * interpretaría como un archivo corrupto.
 *
 * **No exige sesión para escuchar.** Un `<audio src>` no puede mandar la
 * cabecera de autorización —el navegador no se lo permite—, así que pedirla
 * aquí dejaría el reproductor mudo. Tampoco haría falta: el mismo MP3 está
 * abierto en el servidor del podcast, y esta ruta solo alcanza episodios que
 * ya están en el catálogo, no una dirección cualquiera.
 *
 * Guardar para oír sin conexión sí pide sesión: eso se apunta en la cuenta.
 */
podcastsRouter.get(
  "/podcast-episodes/:id/audio",
  optionalAuth,
  wrap(async (req, res) => {
    const row = db.prepare("SELECT * FROM podcast_episodes WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Ese episodio no existe.");

    // La dirección se volvió a validar al guardarla, pero el feed pudo
    // actualizarse desde entonces: se comprueba otra vez antes de pedirla.
    let audioUrl;
    try {
      audioUrl = assertSafeFeedUrl(row.audio_url);
    } catch {
      throw badRequest("Este episodio apunta a una dirección que no podemos abrir.", "bad_audio_url");
    }

    let upstream;
    try {
      upstream = await fetch(audioUrl, {
        headers: {
          "User-Agent": "Heseria/1.0 (podcast player; +https://heseria.app)",
          ...(req.headers.range ? { Range: req.headers.range } : {}),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new HttpError(504, "El servidor del podcast no respondió.", "upstream_timeout");
    }

    if (!upstream.ok && upstream.status !== 206) {
      throw new HttpError(
        upstream.status === 404 ? 404 : 502,
        upstream.status === 404
          ? "Este episodio ya no está disponible en su servidor."
          : `El servidor del podcast respondió ${upstream.status}.`,
        "upstream_error",
      );
    }

    res.status(upstream.status);
    for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.setHeader("Accept-Ranges", upstream.headers.get("accept-ranges") ?? "bytes");
    if (req.query.download === "1") {
      const name = `${row.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100)}.mp3`;
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
      // Solo se apunta en la cuenta de quien tenga sesión abierta.
      if (req.user) {
        db.prepare(
          "INSERT OR REPLACE INTO downloads (user_id, kind, item_id, size_mb) VALUES (?, 'podcast', ?, ?)",
        ).run(req.user.id, row.id, Math.round((row.size_bytes / 1048576) * 100) / 100);
      }
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    // Se copia el flujo tal cual: nada se guarda en el servidor.
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once("drain", resolve));
        }
      }
    } catch {
      // Si quien escucha cierra la app a mitad, no hay nada que reportar.
    } finally {
      res.end();
    }
  }),
);
