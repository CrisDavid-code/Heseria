/**
 * HESERIA — Lo que pertenece a la persona que ha iniciado sesión:
 * biblioteca, historial, descargas, notificaciones, matrículas, progreso,
 * donaciones, voluntariado y recomendaciones.
 */
import { Router } from "express";
import { requireAuth, optionalAuth } from "../auth.js";
import { catalog, db, getSetting, newId } from "../db.js";
import { badRequest, notFound, num, oneOf, str, wrap } from "../http.js";
import { isExternal } from "../media-source.js";

export const meRouter = Router();

const SAVEABLE = ["song", "playlist", "sermon", "course", "movie", "video", "podcast", "series", "verse", "content"];

/** Resuelve un identificador guardado a su documento de catálogo o contenido. */
function resolve(kind, id) {
  if (kind === "content") {
    const row = db.prepare("SELECT * FROM content WHERE id = ?").get(id);
    return row ? { id: row.id, title: row.title, subtitle: row.subtitle, color: row.color } : null;
  }
  return catalog.get(kind, id) ?? null;
}

/* ----------------------------------------------------------- biblioteca */

meRouter.get(
  "/library",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare(
      "SELECT kind, item_id, at FROM library_items WHERE user_id = ? ORDER BY at DESC",
    ).all(req.user.id);

    const grouped = {};
    for (const kind of SAVEABLE) grouped[kind] = [];
    for (const row of rows) {
      const item = resolve(row.kind, row.item_id);
      if (item) (grouped[row.kind] ??= []).push(item);
    }
    res.json(grouped);
  }),
);

/**
 * Solo los identificadores, agrupados por tipo. Es lo que necesita la interfaz
 * para pintar el corazón lleno o vacío sin descargar cada ficha entera.
 */
meRouter.get(
  "/library/ids",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare("SELECT kind, item_id FROM library_items WHERE user_id = ?").all(req.user.id);
    const grouped = {};
    for (const row of rows) (grouped[row.kind] ??= []).push(row.item_id);
    res.json(grouped);
  }),
);

meRouter.get(
  "/library/:kind",
  requireAuth,
  wrap((req, res) => {
    const kind = oneOf(req.params.kind, SAVEABLE, "tipo");
    const rows = db.prepare(
      "SELECT item_id FROM library_items WHERE user_id = ? AND kind = ? ORDER BY at DESC",
    ).all(req.user.id, kind);
    res.json(rows.map((r) => resolve(kind, r.item_id)).filter(Boolean));
  }),
);

/** Guarda o quita de la biblioteca. Devuelve el estado resultante. */
meRouter.post(
  "/library/toggle",
  requireAuth,
  wrap((req, res) => {
    const kind = oneOf(req.body?.kind, SAVEABLE, "tipo");
    const itemId = str(req.body?.id, "identificador");
    const existing = db.prepare(
      "SELECT 1 FROM library_items WHERE user_id = ? AND kind = ? AND item_id = ?",
    ).get(req.user.id, kind, itemId);

    if (existing) {
      db.prepare("DELETE FROM library_items WHERE user_id = ? AND kind = ? AND item_id = ?")
        .run(req.user.id, kind, itemId);
    } else {
      if (kind !== "verse" && !resolve(kind, itemId)) throw notFound("Ese elemento no existe.");
      db.prepare("INSERT INTO library_items (user_id, kind, item_id) VALUES (?, ?, ?)")
        .run(req.user.id, kind, itemId);
    }
    res.json({ saved: !existing });
  }),
);

meRouter.get(
  "/library/saved/:kind/:id",
  requireAuth,
  wrap((req, res) => {
    const saved = db.prepare(
      "SELECT 1 FROM library_items WHERE user_id = ? AND kind = ? AND item_id = ?",
    ).get(req.user.id, req.params.kind, req.params.id);
    res.json({ saved: Boolean(saved) });
  }),
);

/* ------------------------------------------------------------ historial */

const TYPE_LABEL = {
  song: "Canción", sermon: "Sermón", course: "Curso", movie: "Película",
  video: "Video", podcast: "Podcast", series: "Serie", content: "Contenido",
};

meRouter.get(
  "/history",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare(`
      SELECT kind, item_id, MAX(at) AS at, MAX(progress) AS progress, MAX(position_sec) AS position_sec
      FROM history WHERE user_id = ? GROUP BY kind, item_id ORDER BY at DESC LIMIT 60
    `).all(req.user.id);
    res.json(
      rows
        .map((r) => {
          const item = resolve(r.kind, r.item_id);
          if (!item) return null;
          return {
            id: r.item_id,
            title: item.title ?? item.name,
            type: TYPE_LABEL[r.kind] ?? r.kind,
            kind: r.kind,
            at: r.at,
            progress: Math.round((r.progress ?? 0) * 100),
            positionSec: r.position_sec ?? 0,
            color: item.color,
          };
        })
        .filter(Boolean),
    );
  }),
);

/** Registra avance de reproducción. La app la llama al pausar o salir. */
meRouter.post(
  "/history",
  requireAuth,
  wrap((req, res) => {
    const kind = str(req.body?.kind, "tipo", { max: 30 });
    const itemId = str(req.body?.id, "identificador");
    const positionSec = num(req.body?.positionSec, "posición", { min: 0, max: 100000, fallback: 0 });
    const progress = num(req.body?.progress, "progreso", { min: 0, max: 1, fallback: 0 });
    db.prepare(
      "INSERT INTO history (user_id, kind, item_id, position_sec, progress) VALUES (?, ?, ?, ?, ?)",
    ).run(req.user.id, kind, itemId, Math.round(positionSec), progress);
    res.status(201).json({ ok: true });
  }),
);

meRouter.delete(
  "/history",
  requireAuth,
  wrap((req, res) => {
    db.prepare("DELETE FROM history WHERE user_id = ?").run(req.user.id);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------ descargas */

meRouter.get(
  "/downloads",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare(
      "SELECT kind, item_id, size_mb, at FROM downloads WHERE user_id = ? ORDER BY at DESC",
    ).all(req.user.id);
    res.json(
      rows
        .map((r) => {
          const item = resolve(r.kind, r.item_id);
          if (!item) return null;
          return {
            id: r.item_id, title: item.title ?? item.name,
            type: TYPE_LABEL[r.kind] ?? r.kind, sizeMb: r.size_mb, at: r.at, color: item.color,
          };
        })
        .filter(Boolean),
    );
  }),
);

/**
 * Marca algo como descargado para escuchar sin conexión.
 *
 * Lo que se reproduce desde YouTube o Spotify no entra aquí: guardarlo sería
 * hacer una copia de algo sobre lo que Heseria no tiene licencia, y es justo
 * lo que prohíben las condiciones de esos servicios. Se rechaza en el
 * servidor y no solo en la pantalla, porque la pantalla se puede saltar.
 */
meRouter.post(
  "/downloads",
  requireAuth,
  wrap((req, res) => {
    const kind = str(req.body?.kind, "tipo", { max: 30 });
    const itemId = str(req.body?.id, "identificador");

    const contenido = db.prepare("SELECT provider FROM content WHERE id = ?").get(itemId);
    if (contenido && isExternal(contenido.provider)) {
      throw badRequest(
        "Este contenido se reproduce desde su plataforma de origen y no se puede guardar sin conexión.",
        "external_source",
      );
    }
    const sizeMb = num(req.body?.sizeMb, "tamaño", { min: 0, max: 100000, fallback: 8 });
    db.prepare(
      "INSERT OR REPLACE INTO downloads (user_id, kind, item_id, size_mb) VALUES (?, ?, ?, ?)",
    ).run(req.user.id, kind, itemId, sizeMb);
    res.status(201).json({ ok: true });
  }),
);

meRouter.delete(
  "/downloads/:kind/:id",
  requireAuth,
  wrap((req, res) => {
    db.prepare("DELETE FROM downloads WHERE user_id = ? AND kind = ? AND item_id = ?")
      .run(req.user.id, req.params.kind, req.params.id);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------- notificaciones */

meRouter.get(
  "/notifications",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    ).all(req.user.id);
    res.json(
      rows.map((n) => ({
        id: n.id,
        category: n.type,
        title: n.title,
        body: n.body,
        href: n.href,
        read: Boolean(n.read),
        createdAt: n.created_at,
      })),
    );
  }),
);

meRouter.get(
  "/notifications/unread-count",
  requireAuth,
  wrap((req, res) => {
    const n = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0")
      .get(req.user.id).n;
    res.json({ count: n });
  }),
);

/** Marcar como leída también cuenta como apertura de la campaña que la generó. */
meRouter.post(
  "/notifications/:id/read",
  requireAuth,
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.id);
    if (!row) throw notFound();
    db.prepare("UPDATE notifications SET read = 1, opened_at = COALESCE(opened_at, strftime('%Y-%m-%dT%H:%M:%SZ','now')) WHERE id = ?")
      .run(row.id);
    res.json({ ok: true });
  }),
);

meRouter.post(
  "/notifications/read-all",
  requireAuth,
  wrap((req, res) => {
    db.prepare(
      "UPDATE notifications SET read = 1, opened_at = COALESCE(opened_at, strftime('%Y-%m-%dT%H:%M:%SZ','now')) WHERE user_id = ? AND read = 0",
    ).run(req.user.id);
    res.json({ ok: true });
  }),
);

/* -------------------------------------------------------------- academia */

meRouter.get(
  "/courses/enrolled",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare("SELECT course_id FROM enrollments WHERE user_id = ? ORDER BY enrolled_at DESC")
      .all(req.user.id);
    const done = db.prepare("SELECT COUNT(*) AS n FROM lesson_progress WHERE user_id = ? AND course_id = ?");
    res.json(
      rows
        .map((r) => {
          const course = catalog.get("course", r.course_id);
          if (!course) return null;
          const total = (course.modules ?? []).reduce((sum, m) => sum + m.lessons.length, 0) || 1;
          const completed = done.get(req.user.id, r.course_id).n;
          return { ...course, enrolled: true, progress: Math.round((completed / total) * 100) };
        })
        .filter(Boolean),
    );
  }),
);

meRouter.post(
  "/courses/:id/enroll",
  requireAuth,
  wrap((req, res) => {
    if (!catalog.get("course", req.params.id)) throw notFound("Ese curso no existe.");
    db.prepare("INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)")
      .run(req.user.id, req.params.id);
    res.json({ enrolled: true });
  }),
);

meRouter.get(
  "/courses/:id/progress",
  requireAuth,
  wrap((req, res) => {
    const course = catalog.get("course", req.params.id);
    if (!course) throw notFound("Ese curso no existe.");
    const rows = db.prepare("SELECT lesson_id FROM lesson_progress WHERE user_id = ? AND course_id = ?")
      .all(req.user.id, req.params.id);
    const total = (course.modules ?? []).reduce((sum, m) => sum + m.lessons.length, 0) || 1;
    res.json({
      enrolled: Boolean(
        db.prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?")
          .get(req.user.id, req.params.id),
      ),
      completedLessons: rows.map((r) => r.lesson_id),
      progress: Math.round((rows.length / total) * 100),
    });
  }),
);

meRouter.post(
  "/courses/:id/lessons/:lessonId/complete",
  requireAuth,
  wrap((req, res) => {
    const course = catalog.get("course", req.params.id);
    if (!course) throw notFound("Ese curso no existe.");
    db.prepare(
      "INSERT OR IGNORE INTO lesson_progress (user_id, course_id, lesson_id) VALUES (?, ?, ?)",
    ).run(req.user.id, req.params.id, req.params.lessonId);
    db.prepare("INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)")
      .run(req.user.id, req.params.id);

    const total = (course.modules ?? []).reduce((sum, m) => sum + m.lessons.length, 0) || 1;
    const completed = db.prepare(
      "SELECT COUNT(*) AS n FROM lesson_progress WHERE user_id = ? AND course_id = ?",
    ).get(req.user.id, req.params.id).n;
    const progress = Math.round((completed / total) * 100);

    db.prepare("INSERT INTO history (user_id, kind, item_id, progress) VALUES (?, 'course', ?, ?)")
      .run(req.user.id, req.params.id, completed / total);

    if (progress === 100 && course.certificate) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, href)
        VALUES (?, ?, 'academia', ?, ?, ?)
      `).run(
        newId("n"), req.user.id, "¡Curso completado!",
        `Terminaste «${course.title}». Tu certificado ya está disponible.`,
        `/courses/${course.id}`,
      );
    }
    res.json({ progress, completed });
  }),
);

/* ------------------------------------------------------------ donaciones */

/* Los aportes viven en `routes/payments.js`: métodos, enlaces y confirmación. */

/* ---------------------------------------------------------- voluntariado */

meRouter.post(
  "/foundation/volunteer/:id/apply",
  requireAuth,
  wrap((req, res) => {
    const opportunity = catalog.get("volunteerOpportunity", req.params.id);
    if (!opportunity) throw notFound("Esa convocatoria ya no está disponible.");
    const existing = db.prepare(
      "SELECT 1 FROM volunteer_applications WHERE user_id = ? AND opportunity_id = ?",
    ).get(req.user.id, req.params.id);
    if (existing) return res.json({ ok: true, alreadyApplied: true });

    db.prepare(`
      INSERT INTO volunteer_applications (id, user_id, opportunity_id, message)
      VALUES (?, ?, ?, ?)
    `).run(newId("va"), req.user.id, req.params.id, str(req.body?.message, "mensaje", { required: false, max: 1000 }));
    res.status(201).json({ ok: true, alreadyApplied: false });
  }),
);

meRouter.get(
  "/foundation/volunteer/mine",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare("SELECT * FROM volunteer_applications WHERE user_id = ? ORDER BY created_at DESC")
      .all(req.user.id);
    res.json(
      rows.map((a) => ({
        id: a.id, status: a.status, createdAt: a.created_at,
        opportunity: catalog.get("volunteerOpportunity", a.opportunity_id) ?? null,
      })),
    );
  }),
);

/* ------------------------------------------------------ recomendaciones */

const row = (title, items) => ({ title, items });

meRouter.get(
  "/recommendations",
  optionalAuth,
  wrap((req, res) => {
    const role = req.user?.role ?? "user";
    const artists = new Map(catalog.all("artist").map((a) => [a.id, a.name]));

    const music = row(
      "Música recomendada",
      catalog.all("song").slice(0, 10).map((s) => ({
        id: s.id, title: s.title, subtitle: artists.get(s.artistId) ?? "",
        href: `/music/albums/${s.albumId}`, color: s.color,
      })),
    );
    const sermons = row(
      "Sermones recomendados",
      catalog.all("sermon").slice(0, 10).map((s) => ({
        id: s.id, title: s.title, subtitle: s.passage, href: `/sermons/${s.id}`, color: s.color,
      })),
    );
    const courses = row(
      "Cursos recomendados",
      catalog.all("course").slice(0, 10).map((c) => ({
        id: c.id, title: c.title, subtitle: c.category, href: `/courses/${c.id}`, color: c.color,
      })),
    );
    const movies = row(
      "Películas recomendadas",
      catalog.all("movie").slice(0, 10).map((m) => ({
        id: m.id, title: m.title, subtitle: `${m.genre} · ${m.year}`, href: `/movies/${m.id}`, color: m.color,
      })),
    );

    const first = { musician: music, artist: music, teacher: courses, pastor: sermons, missionary: sermons }[role];
    const rest = [music, sermons, courses, movies].filter((r) => r !== first);
    res.json([...(first ? [first] : []), ...rest]);
  }),
);

/** «Sigue viendo» y «sigue escuchando» salen del historial real. */
function continueRows(userId, kinds) {
  if (!userId) return [];
  const rows = db.prepare(`
    SELECT kind, item_id, MAX(at) AS at, MAX(progress) AS progress
    FROM history WHERE user_id = ? AND kind IN (${kinds.map(() => "?").join(",")})
    GROUP BY kind, item_id HAVING progress < 0.98 ORDER BY at DESC LIMIT 8
  `).all(userId, ...kinds);

  return rows
    .map((r) => {
      const item = catalog.get(r.kind, r.item_id);
      if (!item) return null;
      const href =
        r.kind === "course" ? `/courses/${item.id}/learn`
        : r.kind === "movie" ? `/movies/${item.id}`
        : r.kind === "series" ? `/series/${item.id}`
        : r.kind === "sermon" ? `/sermons/${item.id}`
        : r.kind === "podcast" ? `/podcasts/${item.id}`
        : `/music/albums/${item.albumId ?? ""}`;
      return {
        id: item.id,
        title: item.title,
        subtitle: item.passage ?? item.category ?? item.genre ?? "",
        progress: Math.round((r.progress ?? 0) * 100),
        type: r.kind,
        href,
        color: item.color,
      };
    })
    .filter(Boolean);
}

meRouter.get(
  "/continue/watching",
  optionalAuth,
  wrap((req, res) => res.json(continueRows(req.user?.id, ["movie", "series", "course", "video"]))),
);

meRouter.get(
  "/continue/listening",
  optionalAuth,
  wrap((req, res) => res.json(continueRows(req.user?.id, ["song", "sermon", "podcast"]))),
);

/* ----------------------------------------------------------- versículos */

meRouter.get(
  "/verses/saved",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare(
      "SELECT item_id FROM library_items WHERE user_id = ? AND kind = 'verse' ORDER BY at DESC",
    ).all(req.user.id);
    const votd = getSetting("verseOfTheDay", null);
    const saved = rows.map((r) => {
      const [ref, ...text] = r.item_id.split("|");
      return { ref, text: text.join("|") };
    });
    res.json(saved.length ? saved : votd ? [votd] : []);
  }),
);
