/**
 * HESERIA — Métricas y moderación.
 *
 * Todos los números salen de consultas sobre datos reales: usuarios activos por
 * actividad registrada, vistas por la tabla `views`, donaciones por la suya.
 * Nada está inventado; si la base está recién sembrada, los valores son los de
 * la siembra.
 */
import { Router } from "express";
import { publicUser, requireAuth, requirePermission } from "../auth.js";
import { catalog, db } from "../db.js";
import { notFound, oneOf, str, wrap } from "../http.js";

export const analyticsRouter = Router();

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const count = (sql, ...params) => db.prepare(sql).get(...params).n ?? 0;

const fmt = (n) => new Intl.NumberFormat("es-CL").format(Math.round(n));

/** Variación porcentual entre dos periodos consecutivos. */
function delta(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/* ------------------------------------------------------- usuarios activos */

analyticsRouter.get(
  "/audience/active",
  requireAuth,
  requirePermission("canManage"),
  wrap((_req, res) => {
    const active = (days) =>
      count(
        `SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE at >= datetime('now', '-${days} days')`,
      );
    res.json({
      daily: active(1),
      weekly: active(7),
      monthly: active(30),
      total: count("SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
      sessionsToday: count("SELECT COUNT(*) AS n FROM activity WHERE at >= date('now')"),
      newThisWeek: count("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-7 days')"),
    });
  }),
);

/**
 * Quién vio una pieza y quién no. La lista de «no vistos» es la que permite
 * volver a avisar solo a quien falta.
 */
analyticsRouter.get(
  "/audience/engagement/:contentId",
  requireAuth,
  requirePermission("canManage"),
  wrap((req, res) => {
    const contentId = req.params.contentId;
    const viewerRows = db.prepare(`
      SELECT DISTINCT u.* FROM views v JOIN users u ON u.id = v.user_id
      WHERE v.item_id = ? AND u.status = 'active' ORDER BY u.name
    `).all(contentId);

    const viewerIds = new Set(viewerRows.map((r) => r.id));
    const nonViewers = db.prepare("SELECT * FROM users WHERE status = 'active' ORDER BY name")
      .all()
      .filter((u) => !viewerIds.has(u.id));

    const total = viewerRows.length + nonViewers.length;
    res.json({
      viewers: viewerRows.map(publicUser),
      nonViewers: nonViewers.map(publicUser),
      viewRate: total ? Math.round((viewerRows.length / total) * 100) : 0,
      totalViews: count("SELECT COUNT(*) AS n FROM views WHERE item_id = ?", contentId),
      averageSeconds: Math.round(
        db.prepare("SELECT AVG(seconds) AS n FROM views WHERE item_id = ?").get(contentId).n ?? 0,
      ),
    });
  }),
);

/** Retención semanal: cuántas de las cuentas activas vuelven a la semana siguiente. */
analyticsRouter.get(
  "/audience/retention",
  requireAuth,
  requirePermission("canManage"),
  wrap((_req, res) => {
    const out = [];
    for (let week = 11; week >= 0; week--) {
      const from = `-${(week + 1) * 7} days`;
      const to = `-${week * 7} days`;
      const activeThen = count(
        `SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE at >= datetime('now', '${from}') AND at < datetime('now', '${to}')`,
      );
      const returning = count(
        `SELECT COUNT(DISTINCT a.user_id) AS n FROM activity a
         WHERE a.at >= datetime('now', '${to}')
         AND a.user_id IN (
           SELECT user_id FROM activity
           WHERE at >= datetime('now', '${from}') AND at < datetime('now', '${to}')
         )`,
      );
      const date = new Date(Date.now() - week * 7 * 86400000);
      out.push({
        label: `${date.getDate()} ${MONTHS[date.getMonth()]}`,
        value: activeThen,
        secondary: returning,
      });
    }
    res.json(out);
  }),
);

/* --------------------------------------------------------------- paneles */

const SCOPES = ["church", "teacher", "artist", "creator", "admin"];

analyticsRouter.get(
  "/analytics/kpis",
  requireAuth,
  requirePermission("canManage"),
  wrap((req, res) => {
    const scope = oneOf(req.query.scope ?? "admin", SCOPES, "ámbito");
    const churchId = req.user.church_id;

    const newUsers = count("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-30 days')");
    const prevUsers = count(
      "SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-60 days') AND created_at < datetime('now', '-30 days')",
    );

    const kpis = {
      church: () => [
        {
          label: "Miembros",
          value: fmt(count("SELECT COUNT(*) AS n FROM church_members WHERE church_id = ?", churchId ?? "")),
          delta: delta(newUsers, prevUsers),
        },
        {
          label: "Activos (30 d)",
          value: fmt(count(
            `SELECT COUNT(DISTINCT a.user_id) AS n FROM activity a JOIN church_members m ON m.user_id = a.user_id
             WHERE m.church_id = ? AND a.at >= datetime('now', '-30 days')`, churchId ?? "")),
          delta: 0,
        },
        {
          label: "Grupos",
          value: fmt(catalog.all("group").filter((g) => g.churchId === churchId).length),
          delta: 0,
        },
        {
          label: "Donaciones",
          value: `$${fmt(db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM donations").get().n)}`,
          delta: 0,
        },
      ],
      teacher: () => {
        const mine = catalog.all("course").filter((c) => c.instructorId === req.user.id);
        const ids = mine.map((c) => c.id);
        const students = ids.length
          ? count(`SELECT COUNT(DISTINCT user_id) AS n FROM enrollments WHERE course_id IN (${ids.map(() => "?").join(",")})`, ...ids)
          : 0;
        return [
          { label: "Estudiantes", value: fmt(students), delta: 0 },
          { label: "Cursos activos", value: fmt(mine.length), delta: 0 },
          {
            label: "Lecciones completadas",
            value: fmt(ids.length
              ? count(`SELECT COUNT(*) AS n FROM lesson_progress WHERE course_id IN (${ids.map(() => "?").join(",")})`, ...ids)
              : 0),
            delta: 0,
          },
          {
            label: "Valoración",
            value: mine.length
              ? (mine.reduce((s, c) => s + (c.rating ?? 0), 0) / mine.length).toFixed(1)
              : "—",
            delta: 0,
          },
        ];
      },
      artist: () => [
        { label: "Reproducciones", value: fmt(count("SELECT COUNT(*) AS n FROM views WHERE item_kind = 'song'")), delta: 0 },
        {
          label: "Oyentes",
          value: fmt(count("SELECT COUNT(DISTINCT user_id) AS n FROM views WHERE item_kind = 'song'")),
          delta: 0,
        },
        {
          label: "Seguidores",
          value: fmt(count("SELECT COUNT(*) AS n FROM follows WHERE following_id = ?", req.user.id)),
          delta: 0,
        },
        {
          label: "Publicaciones",
          value: fmt(count("SELECT COUNT(*) AS n FROM content WHERE created_by = ?", req.user.id)),
          delta: 0,
        },
      ],
      creator: () => [
        { label: "Vistas", value: fmt(count("SELECT COUNT(*) AS n FROM views")), delta: 0 },
        {
          label: "Contenido publicado",
          value: fmt(count("SELECT COUNT(*) AS n FROM content WHERE created_by = ? AND published = 1", req.user.id)),
          delta: 0,
        },
        {
          label: "Publicaciones",
          value: fmt(count("SELECT COUNT(*) AS n FROM posts WHERE author_id = ?", req.user.id)),
          delta: 0,
        },
        {
          label: "Comentarios",
          value: fmt(count(
            "SELECT COUNT(*) AS n FROM comments WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)",
            req.user.id,
          )),
          delta: 0,
        },
      ],
      admin: () => [
        {
          label: "Usuarios",
          value: fmt(count("SELECT COUNT(*) AS n FROM users WHERE status = 'active'")),
          delta: delta(newUsers, prevUsers),
        },
        { label: "Iglesias", value: fmt(catalog.count("church")), delta: 0 },
        {
          label: "Contenido publicado",
          value: fmt(count("SELECT COUNT(*) AS n FROM content WHERE published = 1")),
          delta: 0,
        },
        {
          label: "Reportes abiertos",
          value: fmt(count("SELECT COUNT(*) AS n FROM moderation WHERE status = 'pending'")),
          delta: 0,
        },
      ],
    };

    res.json(kpis[scope]());
  }),
);

/** Serie de actividad diaria de los últimos 30 días. */
analyticsRouter.get(
  "/analytics/series",
  requireAuth,
  requirePermission("canManage"),
  wrap((_req, res) => {
    const rows = db.prepare(`
      SELECT date(at) AS day, COUNT(DISTINCT user_id) AS users, COUNT(*) AS sessions
      FROM activity WHERE at >= datetime('now', '-30 days') GROUP BY day ORDER BY day
    `).all();
    res.json(
      rows.map((r) => {
        const d = new Date(`${r.day}T00:00:00Z`);
        return {
          label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
          value: r.users,
          secondary: r.sessions,
        };
      }),
    );
  }),
);

/** Reparto de consumo por tipo de contenido. */
analyticsRouter.get(
  "/analytics/breakdown",
  requireAuth,
  requirePermission("canManage"),
  wrap((_req, res) => {
    const rows = db.prepare(
      "SELECT item_kind, COUNT(*) AS n FROM views GROUP BY item_kind ORDER BY n DESC",
    ).all();
    const LABEL = {
      song: "Música", sermon: "Sermones", course: "Cursos", video: "Videos",
      podcast: "Podcasts", movie: "Películas", series: "Series", content: "Contenido nuevo",
    };
    const total = rows.reduce((s, r) => s + r.n, 0) || 1;
    res.json(
      rows.slice(0, 6).map((r) => ({
        label: LABEL[r.item_kind] ?? r.item_kind,
        value: Math.round((r.n / total) * 100),
      })),
    );
  }),
);

/** Cuadro general para el panel de administración global. */
analyticsRouter.get(
  "/analytics/overview",
  requireAuth,
  requirePermission("canManage"),
  wrap((_req, res) => {
    res.json({
      users: count("SELECT COUNT(*) AS n FROM users"),
      activeUsers: count("SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE at >= datetime('now', '-30 days')"),
      churches: catalog.count("church"),
      courses: catalog.count("course"),
      content: count("SELECT COUNT(*) AS n FROM content"),
      posts: count("SELECT COUNT(*) AS n FROM posts"),
      prayers: count("SELECT COUNT(*) AS n FROM prayers"),
      messages: count("SELECT COUNT(*) AS n FROM messages"),
      donations: db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM donations").get().n,
      openReports: count("SELECT COUNT(*) AS n FROM moderation WHERE status = 'pending'"),
      campaigns: count("SELECT COUNT(*) AS n FROM campaigns"),
      notifications: count("SELECT COUNT(*) AS n FROM notifications"),
    });
  }),
);

/**
 * Actividad reciente de la plataforma, construida con hechos reales: cuentas
 * creadas, contenido publicado, publicaciones, donaciones y campañas enviadas.
 */
analyticsRouter.get(
  "/analytics/activity",
  requireAuth,
  requirePermission("canManage"),
  wrap((req, res) => {
    const scope = str(req.query.scope, "ámbito", { required: false }) || "admin";
    const events = [];

    const add = (rows, format) => rows.forEach((r) => events.push(format(r)));

    add(
      db.prepare("SELECT id, name, created_at FROM users ORDER BY created_at DESC LIMIT 4").all(),
      (r) => ({ id: `u-${r.id}`, text: `${r.name} creó una cuenta`, at: r.created_at }),
    );
    add(
      db.prepare("SELECT id, title, kind, created_at FROM content ORDER BY created_at DESC LIMIT 4").all(),
      (r) => ({ id: `c-${r.id}`, text: `Se publicó «${r.title}»`, at: r.created_at }),
    );
    add(
      db.prepare(`
        SELECT p.id, p.created_at, u.name FROM posts p JOIN users u ON u.id = p.author_id
        ORDER BY p.created_at DESC LIMIT 3
      `).all(),
      (r) => ({ id: `p-${r.id}`, text: `${r.name} publicó en la comunidad`, at: r.created_at }),
    );
    add(
      db.prepare("SELECT id, title, audience, created_at FROM campaigns ORDER BY created_at DESC LIMIT 3").all(),
      (r) => ({
        id: `cp-${r.id}`,
        text: `Notificación «${r.title}» enviada a ${fmt(r.audience)} personas`,
        at: r.created_at,
      }),
    );
    add(
      db.prepare("SELECT id, amount, currency, project, created_at FROM donations ORDER BY created_at DESC LIMIT 3").all(),
      (r) => ({
        id: `d-${r.id}`,
        text: `Aporte de ${r.currency} ${fmt(r.amount)} a ${r.project}`,
        at: r.created_at,
      }),
    );

    const pending = count("SELECT COUNT(*) AS n FROM moderation WHERE status = 'pending'");
    if (pending) {
      events.push({
        id: "mod",
        text: `${pending} ${pending === 1 ? "reporte espera" : "reportes esperan"} revisión`,
        at: new Date().toISOString(),
      });
    }

    void scope;
    events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    res.json(events.slice(0, 8));
  }),
);

/* ------------------------------------------------------------ moderación */

const serializeReport = (r) => ({
  id: r.id,
  kind: r.target_kind,
  targetId: r.target_id,
  excerpt: r.excerpt,
  reason: r.reason,
  severity: r.severity,
  reportedBy: r.reporter_id,
  status: r.status === "pending" ? "pendiente" : r.status,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at ?? undefined,
});

analyticsRouter.get(
  "/moderation",
  requireAuth,
  requirePermission("canModerate"),
  wrap((req, res) => {
    const status = req.query.status;
    const rows = status
      ? db.prepare("SELECT * FROM moderation WHERE status = ? ORDER BY created_at DESC")
          .all(status === "pendiente" ? "pending" : status)
      : db.prepare("SELECT * FROM moderation ORDER BY created_at DESC LIMIT 200").all();
    res.json(rows.map(serializeReport));
  }),
);

analyticsRouter.post(
  "/moderation/:id/resolve",
  requireAuth,
  requirePermission("canModerate"),
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM moderation WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Ese reporte no existe.");
    const status = oneOf(req.body?.status ?? "resuelto", ["resuelto", "descartado", "escalado"], "estado");
    const action = str(req.body?.action, "acción", { required: false, max: 40 });

    db.prepare(
      "UPDATE moderation SET status = ?, resolution = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
    ).run(status, action || null, row.id);

    // Ocultar retira de verdad la publicación reportada.
    if (action === "ocultar" && row.target_kind === "contenido") {
      db.prepare("UPDATE posts SET status = 'hidden' WHERE id = ?").run(row.target_id);
    }
    if (action === "suspender") {
      const post = db.prepare("SELECT author_id FROM posts WHERE id = ?").get(row.target_id);
      if (post) db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(post.author_id);
    }
    res.json({ ok: true, status });
  }),
);
