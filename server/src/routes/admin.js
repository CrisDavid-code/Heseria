/**
 * HESERIA — Administración.
 *
 * Gestión de cuentas y edición del catálogo. Crear un evento, un grupo o un
 * curso aquí lo hace visible en todos los dispositivos de inmediato: el
 * catálogo es dato servido, no código empaquetado en la aplicación.
 */
import { Router } from "express";
import {
  can, colorFor, findUserByEmail, hashPassword, publicUser, requireAuth,
  requirePermission, requireRole, ROLE_PERMISSIONS, uniqueHandle,
} from "../auth.js";
import { catalog, db, newId } from "../db.js";
import {
  badRequest, email as parseEmail, forbidden, HttpError, notFound, oneOf,
  password as parsePassword, str, wrap,
} from "../http.js";
import { fireAuto } from "./broadcast.js";

export const adminRouter = Router();

const ROLES = Object.keys(ROLE_PERMISSIONS);

/* --------------------------------------------------------------- cuentas */

adminRouter.get(
  "/admin/users",
  requireAuth,
  requirePermission("canManage"),
  wrap((req, res) => {
    const params = [];
    let sql = "SELECT * FROM users WHERE 1 = 1";
    if (req.query.q) {
      sql += " AND (lower(name) LIKE ? OR lower(email) LIKE ?)";
      const term = `%${String(req.query.q).toLowerCase()}%`;
      params.push(term, term);
    }
    if (req.query.role) {
      sql += " AND role = ?";
      params.push(req.query.role);
    }
    if (req.query.status) {
      sql += " AND status = ?";
      params.push(req.query.status);
    }
    sql += " ORDER BY created_at DESC LIMIT 500";

    const rows = db.prepare(sql).all(...params);
    const lastSeen = db.prepare("SELECT MAX(at) AS at FROM activity WHERE user_id = ?");
    res.json(
      rows.map((r) => ({
        ...publicUser(r),
        createdAt: r.created_at,
        lastSeenAt: lastSeen.get(r.id).at ?? r.last_seen_at,
      })),
    );
  }),
);

/** Alta de cuenta desde el panel. Útil para crear equipos sin pasar por el registro. */
adminRouter.post(
  "/admin/users",
  requireAuth,
  requireRole("admin"),
  wrap((req, res) => {
    const firstName = str(req.body?.firstName, "nombre", { min: 2, max: 60 });
    const lastName = str(req.body?.lastName, "apellido", { min: 2, max: 60 });
    const email = parseEmail(req.body?.email);
    const password = parsePassword(req.body?.password);
    const role = oneOf(req.body?.role ?? "user", ROLES, "rol");

    if (findUserByEmail(email)) throw new HttpError(409, "Ya existe una cuenta con ese correo.", "email_taken");

    const id = newId("u");
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, name, handle, role,
                         city, country, church_id, color, onboarded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id, email, hashPassword(password), firstName, lastName, `${firstName} ${lastName}`,
      uniqueHandle(firstName, lastName), role,
      str(req.body?.city, "ciudad", { required: false, max: 60 }) || "—",
      str(req.body?.country, "país", { required: false, max: 60 }) || "—",
      req.body?.churchId || null, colorFor(email),
    );
    res.status(201).json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
  }),
);

adminRouter.patch(
  "/admin/users/:id",
  requireAuth,
  requirePermission("canManage"),
  wrap((req, res) => {
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!target) throw notFound("Esa cuenta no existe.");

    const fields = [];
    const values = [];

    if (req.body?.role !== undefined) {
      // Solo el administrador global reparte roles, y no puede degradarse solo.
      if (req.user.role !== "admin") throw forbidden("Solo la administración global cambia roles.");
      const role = oneOf(req.body.role, ROLES, "rol");
      if (target.id === req.user.id && role !== "admin") {
        throw badRequest("No puedes quitarte a ti el rol de administrador.", "self_demote");
      }
      fields.push("role = ?");
      values.push(role);
    }
    if (req.body?.status !== undefined) {
      const status = oneOf(req.body.status, ["active", "suspended"], "estado");
      if (target.id === req.user.id) throw badRequest("No puedes suspender tu propia cuenta.", "self_suspend");
      fields.push("status = ?");
      values.push(status);
    }
    if (req.body?.churchId !== undefined) {
      fields.push("church_id = ?");
      values.push(req.body.churchId || null);
    }

    if (!fields.length) throw badRequest("No hay nada que actualizar.", "empty_patch");
    values.push(target.id);
    db.prepare(`UPDATE users SET ${fields.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(...values);
    res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(target.id)));
  }),
);

adminRouter.delete(
  "/admin/users/:id",
  requireAuth,
  requireRole("admin"),
  wrap((req, res) => {
    if (req.params.id === req.user.id) throw badRequest("No puedes borrar tu propia cuenta desde aquí.", "self_delete");
    const done = db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    if (!done.changes) throw notFound("Esa cuenta no existe.");
    res.json({ ok: true });
  }),
);

/* -------------------------------------------------------------- catálogo */

/** Qué tipos puede tocar cada permiso. */
const CATALOG_RULES = {
  church: "canManageChurch",
  ministry: "canManageChurch",
  event: "canManage",
  group: "canManage",
  course: "canManageCourses",
  sermon: "canPublish",
  song: "canPublish",
  album: "canPublish",
  artist: "canPublish",
  playlist: "canPublish",
  podcast: "canPublish",
  video: "canPublish",
  movie: "canPublish",
  series: "canPublish",
  devotional: "canPublish",
  plan: "canPublish",
  foundationCase: "canManageFoundation",
  volunteerOpportunity: "canManageFoundation",
};

const CATALOG_KINDS = Object.keys(CATALOG_RULES);

/** El prefijo de identificador que usa cada tipo en el dataset original. */
const ID_PREFIX = {
  church: "c", ministry: "m", event: "e", group: "g", course: "co", sermon: "sm",
  song: "s", album: "al", artist: "ar", playlist: "pl", podcast: "pd", video: "v",
  movie: "mv", series: "se", devotional: "d", plan: "pn",
  foundationCase: "fc", volunteerOpportunity: "vo",
};

const COLORS = [
  "from-cyan-500/70 to-blue-700/70", "from-violet-500/70 to-purple-800/70",
  "from-teal-400/70 to-emerald-700/70", "from-amber-400/70 to-orange-700/70",
  "from-rose-400/70 to-pink-700/70", "from-sky-400/70 to-indigo-800/70",
];

function assertCatalogPermission(user, kind) {
  const permission = CATALOG_RULES[kind];
  if (!permission) throw badRequest(`Tipo de catálogo desconocido: ${kind}.`, "bad_kind");
  if (user.role === "admin") return;
  if (!can(user.role, permission)) throw forbidden("Tu rol no permite editar este tipo de contenido.");
}

adminRouter.get(
  "/admin/catalog/:kind",
  requireAuth,
  requirePermission("canManage"),
  wrap((req, res) => {
    const kind = oneOf(req.params.kind, CATALOG_KINDS, "tipo");
    res.json(catalog.all(kind));
  }),
);

adminRouter.post(
  "/admin/catalog/:kind",
  requireAuth,
  wrap((req, res) => {
    const kind = oneOf(req.params.kind, CATALOG_KINDS, "tipo");
    assertCatalogPermission(req.user, kind);

    const body = req.body ?? {};
    const title = str(body.title ?? body.name, "título", { min: 2, max: 200 });
    const id = body.id ? str(body.id, "id", { max: 60 }) : newId(ID_PREFIX[kind] ?? "x");
    if (catalog.get(kind, id)) throw new HttpError(409, "Ya existe un elemento con ese identificador.", "id_taken");

    const document = {
      ...body,
      id,
      color: body.color ?? COLORS[catalog.count(kind) % COLORS.length],
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    };
    if (body.name) document.name = title;
    else document.title = title;

    catalog.put(kind, id, document, catalog.count(kind));

    // Los eventos y cursos nuevos disparan su regla de aviso si está activa.
    if (kind === "event") {
      fireAuto("event.created", { titulo: title, href: `/events/${id}`, actor: req.user });
    }
    if (kind === "course") {
      fireAuto("course.published", { titulo: title, href: `/courses/${id}`, actor: req.user });
    }

    res.status(201).json(document);
  }),
);

adminRouter.patch(
  "/admin/catalog/:kind/:id",
  requireAuth,
  wrap((req, res) => {
    const kind = oneOf(req.params.kind, CATALOG_KINDS, "tipo");
    assertCatalogPermission(req.user, kind);

    const existing = catalog.get(kind, req.params.id);
    if (!existing) throw notFound("Ese elemento no existe.");

    // El identificador nunca cambia: otras entidades lo referencian.
    const { id: _ignored, ...patch } = req.body ?? {};
    const updated = { ...existing, ...patch, id: existing.id, updatedAt: new Date().toISOString() };
    catalog.put(kind, existing.id, updated);
    res.json(updated);
  }),
);

adminRouter.delete(
  "/admin/catalog/:kind/:id",
  requireAuth,
  wrap((req, res) => {
    const kind = oneOf(req.params.kind, CATALOG_KINDS, "tipo");
    assertCatalogPermission(req.user, kind);
    if (!catalog.remove(kind, req.params.id)) throw notFound("Ese elemento no existe.");
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------- ajustes */

adminRouter.get(
  "/admin/health",
  requireAuth,
  requirePermission("canManage"),
  wrap((_req, res) => {
    const tables = [
      "users", "catalog", "content", "posts", "comments", "prayers", "messages",
      "notifications", "campaigns", "views", "activity", "donations", "moderation",
    ];
    const counts = {};
    for (const t of tables) counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    res.json({
      ok: true,
      counts,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
    });
  }),
);
