/**
 * HESERIA — Catálogo.
 *
 * Todo lo editorial: iglesias, ministerios, Biblia, devocionales, planes,
 * música, pódcast, sermones, videos, películas, series, cursos, eventos,
 * grupos y fundación. Más búsqueda y recomendaciones.
 *
 * Se lee de la tabla `catalog`, así que lo que el superadmin cambie aparece en
 * todos los dispositivos sin publicar una versión nueva de la aplicación.
 */
import { Router } from "express";
import { publicUser } from "../auth.js";
import { catalog, db, getSetting } from "../db.js";
import { fold, notFound, wrap } from "../http.js";

export const catalogRouter = Router();

const all = (kind) => catalog.all(kind);
const one = (kind, id) => catalog.get(kind, id);

/** Devuelve el documento o lanza 404 con un mensaje en español. */
function need(kind, id, label) {
  const item = one(kind, id);
  if (!item) throw notFound(`No encontramos ${label}.`);
  return item;
}

const listRoute = (kind, label) =>
  wrap((req, res) => {
    let items = all(kind);
    const q = fold(req.query.q);
    if (q) {
      items = items.filter((i) => fold(i.title ?? i.name).includes(q) || fold(i.description).includes(q));
    }
    res.json(items);
  });

const getRoute = (kind, label) =>
  wrap((req, res) => res.json(need(kind, req.params.id, label)));

/* ------------------------------------------------------------ iglesias */

catalogRouter.get(
  "/churches",
  wrap((req, res) => {
    const { city, denomination, q } = req.query;
    let items = all("church");
    if (city) items = items.filter((c) => fold(c.city) === fold(city));
    if (denomination) items = items.filter((c) => fold(c.denomination) === fold(denomination));
    if (q) {
      const term = fold(q);
      items = items.filter((c) => fold(c.name).includes(term) || fold(c.city).includes(term));
    }
    res.json(items);
  }),
);

/** Distancia en kilómetros entre dos puntos, sobre la superficie terrestre. */
function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Iglesias cercanas a unas coordenadas.
 *
 * `lat` y `lng` vienen del GPS del teléfono. La distancia se calcula de verdad
 * contra la posición de cada congregación; no es un número decorativo.
 *
 * Admite `radius` en kilómetros y `denomination`. El catálogo solo contiene
 * congregaciones evangélicas, así que no hay nada que excluir, pero el filtro
 * permite acotar a una en concreto.
 */
catalogRouter.get(
  "/churches/nearby",
  wrap((req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius) || 0;
    const limit = Math.min(50, Number(req.query.limit) || 12);

    let items = all("church");

    if (req.query.denomination) {
      items = items.filter((c) => fold(c.denomination) === fold(req.query.denomination));
    }
    if (req.query.city) {
      items = items.filter((c) => fold(c.city) === fold(req.query.city));
    }

    // Sin coordenadas no se puede hablar de cercanía: se devuelve el listado
    // sin inventar distancias.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.json({
        located: false,
        churches: items.slice(0, limit).map((c) => ({ ...c, distanceKm: null })),
      });
    }

    const withDistance = items
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
      .map((c) => ({ ...c, distanceKm: Math.round(distanceKm(lat, lng, c.lat, c.lng) * 10) / 10 }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const near = radius ? withDistance.filter((c) => c.distanceKm <= radius) : withDistance;

    res.json({
      located: true,
      /** Cuántas hay dentro del radio pedido, antes de recortar la lista. */
      total: near.length,
      radiusKm: radius || null,
      churches: near.slice(0, limit),
    });
  }),
);

/** Las denominaciones presentes en el catálogo, para el filtro. */
catalogRouter.get(
  "/churches-denominations",
  wrap((_req, res) => {
    res.json([...new Set(all("church").map((c) => c.denomination))].sort());
  }),
);

catalogRouter.get("/churches/:id", getRoute("church", "esa iglesia"));

catalogRouter.get(
  "/churches/:id/members",
  wrap((req, res) => {
    // Se devuelve el usuario completo: las pantallas de iglesia muestran su
    // rol y sus ministerios, no solo el nombre.
    const rows = db.prepare(`
      SELECT u.* FROM church_members m JOIN users u ON u.id = m.user_id
      WHERE m.church_id = ? AND u.status = 'active' ORDER BY u.name
    `).all(req.params.id);
    res.json(rows.map(publicUser));
  }),
);

catalogRouter.get(
  "/churches/:id/events",
  wrap((req, res) => res.json(all("event").filter((e) => e.churchId === req.params.id))),
);

catalogRouter.get(
  "/churches/:id/sermons",
  wrap((req, res) => res.json(all("sermon").filter((s) => s.churchId === req.params.id))),
);

/* --------------------------------------------------------- ministerios */

catalogRouter.get(
  "/ministries",
  wrap((req, res) => {
    let items = all("ministry");
    if (req.query.churchId) items = items.filter((m) => m.churchId === req.query.churchId);
    res.json(items);
  }),
);
catalogRouter.get("/ministries/:id", getRoute("ministry", "ese ministerio"));

/* -------------------------------------------------------------- Biblia */

catalogRouter.get("/bible/versions", wrap((_req, res) => res.json(all("bibleVersion"))));
catalogRouter.get("/bible/books", wrap((_req, res) => res.json(all("bibleBook"))));
catalogRouter.get(
  "/bible/verse-of-the-day",
  wrap((_req, res) => res.json(getSetting("verseOfTheDay", { ref: "", text: "" }))),
);

catalogRouter.get(
  "/bible/search",
  wrap((req, res) => {
    const term = fold(req.query.q);
    if (!term) return res.json([]);
    const rows = db.prepare(
      "SELECT data FROM catalog WHERE kind = 'bibleChapter' AND lower(data) LIKE ? LIMIT 400",
    ).all(`%${String(req.query.q).toLowerCase()}%`);
    const out = [];
    for (const row of rows) {
      const chapter = JSON.parse(row.data);
      for (const verse of chapter.verses) {
        if (fold(verse.text).includes(term)) {
          out.push({
            book: chapter.book,
            bookName: chapter.bookName,
            chapter: chapter.chapter,
            verse: verse.number,
            text: verse.text,
          });
        }
        if (out.length >= 80) break;
      }
      if (out.length >= 80) break;
    }
    res.json(out);
  }),
);

catalogRouter.get(
  "/bible/:book/:chapter",
  wrap((req, res) => {
    const id = `${req.params.book}.${Number(req.params.chapter)}`;
    const chapter = one("bibleChapter", id);
    if (!chapter) throw notFound("Ese capítulo no existe.");
    res.json({ ...chapter, version: req.query.version ?? "hsd" });
  }),
);

/* ------------------------------------------------- devocionales y planes */

catalogRouter.get("/devotionals", listRoute("devotional"));

catalogRouter.get(
  "/devotionals/today",
  wrap((_req, res) => {
    const items = all("devotional");
    // Uno por día del año: estable durante toda la jornada y rotativo.
    const day = Math.floor(Date.now() / 86400000);
    res.json(items[day % items.length]);
  }),
);

catalogRouter.get("/devotionals/:id", getRoute("devotional", "ese devocional"));

catalogRouter.get("/plans", listRoute("plan"));
catalogRouter.get("/plans/:id", getRoute("plan", "ese plan"));

/* -------------------------------------------------------------- música */

catalogRouter.get(
  "/music/songs",
  wrap((req, res) => {
    let items = all("song");
    if (req.query.artistId) items = items.filter((s) => s.artistId === req.query.artistId);
    if (req.query.albumId) items = items.filter((s) => s.albumId === req.query.albumId);
    if (req.query.genre) items = items.filter((s) => fold(s.genre) === fold(req.query.genre));
    res.json(items);
  }),
);
catalogRouter.get("/music/songs/:id", getRoute("song", "esa canción"));

catalogRouter.get("/music/artists", listRoute("artist"));
catalogRouter.get("/music/artists/:id", getRoute("artist", "ese artista"));

catalogRouter.get(
  "/music/albums",
  wrap((req, res) => {
    let items = all("album");
    if (req.query.artistId) items = items.filter((a) => a.artistId === req.query.artistId);
    res.json(items);
  }),
);
catalogRouter.get("/music/albums/:id", getRoute("album", "ese álbum"));

catalogRouter.get("/music/playlists", listRoute("playlist"));
catalogRouter.get("/music/playlists/:id", getRoute("playlist", "esa playlist"));

catalogRouter.get(
  "/music/genres",
  wrap((_req, res) => res.json([...new Set(all("song").map((s) => s.genre))])),
);

catalogRouter.get(
  "/music/new-releases",
  wrap((_req, res) =>
    res.json([...all("album")].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, 8)),
  ),
);

catalogRouter.get(
  "/music/popular",
  wrap((_req, res) =>
    res.json([...all("song")].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0)).slice(0, 12)),
  ),
);

/* ------------------------------------- pódcast, sermones, video, cine */

catalogRouter.get("/podcasts", listRoute("podcast"));
catalogRouter.get("/podcasts/:id", getRoute("podcast", "ese pódcast"));
catalogRouter.get(
  "/podcasts-categories",
  wrap((_req, res) => res.json([...new Set(all("podcast").map((p) => p.category))])),
);

catalogRouter.get(
  "/sermons",
  wrap((req, res) => {
    let items = all("sermon");
    if (req.query.churchId) items = items.filter((s) => s.churchId === req.query.churchId);
    if (req.query.preacherId) items = items.filter((s) => s.preacherId === req.query.preacherId);
    res.json(items);
  }),
);
catalogRouter.get("/sermons/:id", getRoute("sermon", "ese sermón"));
catalogRouter.get(
  "/sermons/:id/related",
  wrap((req, res) => {
    const sermon = need("sermon", req.params.id, "ese sermón");
    res.json(all("sermon").filter((s) => s.id !== sermon.id && s.series === sermon.series).slice(0, 6));
  }),
);

catalogRouter.get(
  "/videos",
  wrap((req, res) => {
    let items = all("video");
    if (req.query.category) items = items.filter((v) => fold(v.category) === fold(req.query.category));
    res.json(items);
  }),
);
catalogRouter.get("/videos/:id", getRoute("video", "ese video"));

catalogRouter.get(
  "/movies",
  wrap((req, res) => {
    let items = all("movie");
    if (req.query.genre) items = items.filter((m) => fold(m.genre) === fold(req.query.genre));
    res.json(items);
  }),
);
catalogRouter.get(
  "/movies-featured",
  wrap((_req, res) => res.json(all("movie").slice(0, 5))),
);
catalogRouter.get("/movies/:id", getRoute("movie", "esa película"));

catalogRouter.get("/series", listRoute("series"));
catalogRouter.get("/series/:id", getRoute("series", "esa serie"));

/* ------------------------------------------------------------- academia */

catalogRouter.get(
  "/courses",
  wrap((req, res) => {
    let items = all("course");
    const { category, level, modality, instructorId, q } = req.query;
    if (category) items = items.filter((c) => fold(c.category) === fold(category));
    if (level) items = items.filter((c) => fold(c.level) === fold(level));
    if (modality) items = items.filter((c) => fold(c.modality) === fold(modality));
    if (instructorId) items = items.filter((c) => c.instructorId === instructorId);
    if (q) items = items.filter((c) => fold(c.title).includes(fold(q)));
    res.json(items);
  }),
);
catalogRouter.get(
  "/courses-categories",
  wrap((_req, res) => res.json([...new Set(all("course").map((c) => c.category))])),
);
catalogRouter.get("/courses/:id", getRoute("course", "ese curso"));

/* ------------------------------------------------------ eventos y grupos */

catalogRouter.get(
  "/events",
  wrap((req, res) => {
    let items = all("event");
    if (req.query.modality) items = items.filter((e) => fold(e.modality) === fold(req.query.modality));
    if (req.query.churchId) items = items.filter((e) => e.churchId === req.query.churchId);
    if (req.query.upcoming === "1") {
      const today = new Date().toISOString().slice(0, 10);
      items = items.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    }
    res.json(items);
  }),
);
catalogRouter.get("/events/:id", getRoute("event", "ese evento"));

catalogRouter.get(
  "/groups",
  wrap((req, res) => {
    let items = all("group");
    if (req.query.churchId) items = items.filter((g) => g.churchId === req.query.churchId);
    // Los miembros vienen de la tabla real, no del documento del catálogo.
    const counts = db.prepare("SELECT group_id, COUNT(*) AS n FROM group_members GROUP BY group_id").all();
    const map = new Map(counts.map((c) => [c.group_id, c.n]));
    res.json(items.map((g) => ({ ...g, memberCount: map.get(g.id) ?? g.members.length })));
  }),
);
catalogRouter.get("/groups/:id", getRoute("group", "ese grupo"));

/* ------------------------------------------------------------ fundación */

catalogRouter.get(
  "/foundation/cases",
  wrap((req, res) => {
    let items = all("foundationCase");
    if (req.query.category) items = items.filter((c) => fold(c.category) === fold(req.query.category));
    if (req.query.urgent === "1") items = items.filter((c) => c.urgent);
    // Lo recaudado se recalcula con las donaciones reales registradas.
    const sums = db.prepare(
      "SELECT project_id, SUM(amount) AS total FROM donations WHERE status = 'completada' OR status = 'Completada' GROUP BY project_id",
    ).all();
    const map = new Map(sums.map((s) => [s.project_id, s.total]));
    res.json(items.map((c) => ({ ...c, raised: Math.round(map.get(c.id) ?? c.raised) })));
  }),
);
catalogRouter.get("/foundation/cases/:id", getRoute("foundationCase", "ese caso"));
catalogRouter.get(
  "/foundation/featured",
  wrap((_req, res) => res.json(all("foundationCase").filter((c) => c.urgent).slice(0, 4))),
);
catalogRouter.get(
  "/foundation/volunteer",
  wrap((_req, res) => res.json(all("volunteerOpportunity"))),
);

/* -------------------------------------------------------------- búsqueda */

function searchable() {
  const artists = new Map(all("artist").map((a) => [a.id, a.name]));
  const rows = [];
  const push = (list, map) => list.forEach((i) => rows.push(map(i)));

  push(all("song"), (s) => ({ id: s.id, title: s.title, subtitle: artists.get(s.artistId) ?? "", type: "Canción", href: `/music/albums/${s.albumId}`, color: s.color }));
  push(all("artist"), (a) => ({ id: a.id, title: a.name, subtitle: a.genre, type: "Artista", href: `/music/artists/${a.id}`, color: a.color }));
  push(all("album"), (a) => ({ id: a.id, title: a.title, subtitle: `Álbum · ${a.year}`, type: "Álbum", href: `/music/albums/${a.id}`, color: a.color }));
  push(all("playlist"), (p) => ({ id: p.id, title: p.title, subtitle: "Playlist", type: "Playlist", href: `/music/playlists/${p.id}`, color: p.color }));
  push(all("church"), (c) => ({ id: c.id, title: c.name, subtitle: `${c.city} · ${c.denomination}`, type: "Iglesia", href: `/churches/${c.id}`, color: c.color }));
  push(all("sermon"), (s) => ({ id: s.id, title: s.title, subtitle: s.passage, type: "Sermón", href: `/sermons/${s.id}`, color: s.color }));
  push(all("podcast"), (p) => ({ id: p.id, title: p.title, subtitle: p.host, type: "Podcast", href: `/podcasts/${p.id}`, color: p.color }));
  push(all("video"), (v) => ({ id: v.id, title: v.title, subtitle: v.category, type: "Video", href: `/videos/${v.id}`, color: v.color }));
  push(all("movie"), (m) => ({ id: m.id, title: m.title, subtitle: `${m.genre} · ${m.year}`, type: "Película", href: `/movies/${m.id}`, color: m.color }));
  push(all("series"), (s) => ({ id: s.id, title: s.title, subtitle: s.genre, type: "Serie", href: `/series/${s.id}`, color: s.color }));
  push(all("course"), (c) => ({ id: c.id, title: c.title, subtitle: c.category, type: "Curso", href: `/courses/${c.id}`, color: c.color }));
  push(all("group"), (g) => ({ id: g.id, title: g.name, subtitle: g.topic, type: "Grupo", href: `/groups/${g.id}`, color: g.color }));
  push(all("event"), (e) => ({ id: e.id, title: e.title, subtitle: `${e.city} · ${e.date}`, type: "Evento", href: `/events/${e.id}`, color: e.color }));
  push(all("ministry"), (m) => ({ id: m.id, title: m.name, subtitle: m.category, type: "Ministerio", href: `/ministries/${m.id}`, color: m.color }));
  push(all("bibleBook"), (b) => ({ id: b.id, title: b.name, subtitle: `${b.chapters} capítulos`, type: "Biblia", href: `/bible/${b.id}/1`, color: "from-cyan-500/70 to-blue-700/70" }));

  const users = db.prepare("SELECT id, name, city, color FROM users WHERE status = 'active'").all();
  push(users, (u) => ({ id: u.id, title: u.name, subtitle: u.city, type: "Persona", href: `/profile/${u.id}`, color: u.color }));

  // El contenido subido también aparece en la búsqueda.
  const content = db.prepare("SELECT id, title, subtitle, kind, color FROM content WHERE published = 1").all();
  push(content, (c) => ({ id: c.id, title: c.title, subtitle: c.subtitle, type: "Contenido", href: `/content/${c.id}`, color: c.color }));

  return rows;
}

catalogRouter.get(
  "/search",
  wrap((req, res) => {
    const term = fold(req.query.q);
    if (!term) return res.json([]);
    res.json(
      searchable()
        .filter((x) => fold(x.title).includes(term) || fold(x.subtitle).includes(term))
        .slice(0, 60),
    );
  }),
);

catalogRouter.get(
  "/search/suggestions",
  wrap((_req, res) =>
    res.json(["adoración", "Salmos", "liderazgo", "guitarra", "misiones", "grupos pequeños", "Filipenses", "ayuda social"]),
  ),
);

void listRoute;
