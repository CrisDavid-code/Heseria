/**
 * HESERIA — Ingesta y distribución de contenido.
 *
 * Dos vías: subir un archivo o pegar un enlace. Lo publicado aquí queda en la
 * base de datos y lo ve **cualquier persona con la app instalada**, sin
 * publicar una versión nueva: el contenido viaja como dato, no como código.
 */
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAuth, requirePermission, optionalAuth } from "../auth.js";
import { db, newId, UPLOAD_DIR } from "../db.js";
import { badRequest, forbidden, notFound, num, oneOf, str, wrap } from "../http.js";
import { fireAuto } from "./broadcast.js";
import { isExternal, parseMediaUrl } from "../media-source.js";

export const contentRouter = Router();

export const MEDIA_KINDS = ["song", "album", "movie", "series", "video", "sermon", "podcast"];
const STATUSES = ["borrador", "procesando", "publicado", "error"];

/* --------------------------------------------------------------- subida */

const MAX_UPLOAD_MB = Number(process.env.HESERIA_MAX_UPLOAD_MB ?? 512);

const ALLOWED_MIME = [
  "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/flac",
  "video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/ogg",
  "image/jpeg", "image/png", "image/webp", "image/avif",
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10).replace(/[^\w.]/g, "") || "";
    cb(null, `${newId("up")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(badRequest(`Formato no admitido: ${file.mimetype}.`, "bad_mime"));
    }
    cb(null, true);
  },
});

/**
 * Sube un archivo y devuelve su URL pública. La app la usa luego como
 * `source.url` al crear el contenido, igual que un enlace externo.
 */
contentRouter.post(
  "/uploads",
  requireAuth,
  requirePermission("canCreate"),
  upload.single("file"),
  wrap((req, res) => {
    if (!req.file) throw badRequest("No llegó ningún archivo.", "no_file");
    const id = newId("file");
    db.prepare(`
      INSERT INTO uploads (id, filename, original_name, mime, size, owner_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id);

    res.status(201).json({
      id,
      url: `/uploads/${req.file.filename}`,
      mime: req.file.mimetype,
      sizeMb: Math.round((req.file.size / 1048576) * 100) / 100,
      originalName: req.file.originalname,
    });
  }),
);

contentRouter.get(
  "/uploads",
  requireAuth,
  requirePermission("canPublish"),
  wrap((_req, res) => {
    res.json(db.prepare("SELECT * FROM uploads ORDER BY created_at DESC LIMIT 200").all());
  }),
);

/* ------------------------------------------------------------ contenido */

function serializeContent(row, viewerId) {
  const views = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM views WHERE item_id = ?").get(row.id).n;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    category: row.category,
    durationSec: row.duration_sec,
    source: {
      kind: row.origin,
      url: row.source_url,
      originalUrl: row.embed_url ?? row.source_url,
      provider: row.provider,
    },
    /**
     * El contenido se reproduce desde YouTube, Vimeo o Spotify. No se puede
     * descargar ni guardar sin conexión: la copia no es nuestra.
     */
    external: isExternal(row.provider),
    color: row.color,
    status: row.status,
    createdAt: row.created_at,
    ownerId: row.created_by,
    views,
    seen: viewerId
      ? Boolean(db.prepare("SELECT 1 FROM views WHERE item_id = ? AND user_id = ?").get(row.id, viewerId))
      : false,
  };
}

contentRouter.get(
  "/content",
  optionalAuth,
  wrap((req, res) => {
    const conditions = [];
    const params = [];

    // Sin permiso de publicación solo se ve lo publicado.
    const canSeeDrafts = req.user && ["admin", "creator", "artist", "church_admin", "pastor", "teacher", "moderator"].includes(req.user.role);
    if (!canSeeDrafts) conditions.push("published = 1 AND status = 'publicado'");
    if (req.query.kind) {
      conditions.push("kind = ?");
      params.push(oneOf(req.query.kind, MEDIA_KINDS, "tipo"));
    }
    if (req.query.mine === "1" && req.user) {
      conditions.push("created_by = ?");
      params.push(req.user.id);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db.prepare(`SELECT * FROM content ${where} ORDER BY created_at DESC LIMIT 300`).all(...params);
    res.json(rows.map((r) => serializeContent(r, req.user?.id)));
  }),
);

contentRouter.get(
  "/content/:id",
  optionalAuth,
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM content WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Ese contenido no existe o fue retirado.");
    if (row.status !== "publicado" && !req.user) throw notFound("Ese contenido no está disponible.");
    res.json(serializeContent(row, req.user?.id));
  }),
);

const SAFE_URL = /^(https?:\/\/|\/uploads\/|\/media\/)/i;

contentRouter.post(
  "/content",
  requireAuth,
  requirePermission("canPublish"),
  wrap((req, res) => {
    const body = req.body ?? {};
    const kind = oneOf(body.kind, MEDIA_KINDS, "tipo");
    const title = str(body.title, "título", { min: 2, max: 160 });
    const subtitle = str(body.subtitle, "subtítulo", { required: false, max: 160 });
    const description = str(body.description, "descripción", { required: false, max: 2000 });
    const category = str(body.category, "categoría", { required: false, max: 80 });
    const durationSec = num(body.durationSec, "duración", { min: 0, max: 86400, fallback: 0 });

    const source = body.source ?? {};
    const url = str(source.url, "enlace", { max: 2000 });
    if (!SAFE_URL.test(url)) {
      throw badRequest("El enlace debe empezar por http(s):// o ser un archivo subido.", "bad_url");
    }

    /*
      El proveedor **se deduce aquí**, no se acepta del cuerpo. Si se creyera
      lo que manda quien publica, bastaría con decir «esto es de YouTube»
      junto a una dirección cualquiera para meter esa página en un iframe
      dentro del teléfono de toda la comunidad.
    */
    const parsed = parseMediaUrl(source.originalUrl || url);
    if (!parsed) throw badRequest("No entendimos ese enlace.", "bad_url");

    const id = newId("ct");
    db.prepare(`
      INSERT INTO content (id, kind, title, subtitle, description, category, duration_sec,
                           source_url, provider, embed_url, origin, color, status, published, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publicado', 1, ?)
    `).run(
      id, kind, title, subtitle, description, category, Math.round(durationSec),
      parsed.url, parsed.provider,
      parsed.originalUrl ?? null,
      parsed.kind,
      req.user.color, req.user.id,
    );

    // Regla automática: si está activa, avisa a su segmento.
    const campaignId = fireAuto("content.published", {
      titulo: title,
      href: `/content/${id}`,
      contentId: id,
      actor: req.user,
    });

    res.status(201).json({
      ...serializeContent(db.prepare("SELECT * FROM content WHERE id = ?").get(id), req.user.id),
      campaignId,
    });
  }),
);

function assertOwner(row, user) {
  if (user.role === "admin") return;
  if (row.created_by !== user.id) throw forbidden("Solo puedes gestionar el contenido que publicaste.");
}

contentRouter.patch(
  "/content/:id",
  requireAuth,
  requirePermission("canPublish"),
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM content WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Ese contenido no existe.");
    assertOwner(row, req.user);

    const fields = [];
    const values = [];
    const set = (column, value) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    const b = req.body ?? {};
    if (b.title !== undefined) set("title", str(b.title, "título", { min: 2, max: 160 }));
    if (b.subtitle !== undefined) set("subtitle", str(b.subtitle, "subtítulo", { required: false, max: 160 }));
    if (b.description !== undefined) set("description", str(b.description, "descripción", { required: false, max: 2000 }));
    if (b.category !== undefined) set("category", str(b.category, "categoría", { required: false, max: 80 }));
    if (b.durationSec !== undefined) set("duration_sec", Math.round(num(b.durationSec, "duración", { min: 0, max: 86400, fallback: 0 })));
    if (b.status !== undefined) {
      const status = oneOf(b.status, STATUSES, "estado");
      set("status", status);
      set("published", status === "publicado" ? 1 : 0);
    }
    if (b.source?.url !== undefined) {
      const url = str(b.source.url, "enlace", { max: 2000 });
      if (!SAFE_URL.test(url)) throw badRequest("Enlace no admitido.", "bad_url");
      // Igual que al crear: el proveedor se deduce del enlace.
      const parsed = parseMediaUrl(b.source.originalUrl || url);
      if (!parsed) throw badRequest("No entendimos ese enlace.", "bad_url");
      set("source_url", parsed.url);
      set("provider", parsed.provider);
      set("embed_url", parsed.originalUrl ?? null);
      set("origin", parsed.kind);
    }

    if (fields.length) {
      values.push(row.id);
      db.prepare(`UPDATE content SET ${fields.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(...values);
    }
    res.json(serializeContent(db.prepare("SELECT * FROM content WHERE id = ?").get(row.id), req.user.id));
  }),
);

const setStatus = (status) =>
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM content WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Ese contenido no existe.");
    assertOwner(row, req.user);
    db.prepare("UPDATE content SET status = ?, published = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?")
      .run(status, status === "publicado" ? 1 : 0, row.id);
    res.json({ ok: true, status });
  });

contentRouter.post("/content/:id/publish", requireAuth, requirePermission("canPublish"), setStatus("publicado"));
contentRouter.post("/content/:id/unpublish", requireAuth, requirePermission("canPublish"), setStatus("borrador"));

contentRouter.delete(
  "/content/:id",
  requireAuth,
  requirePermission("canPublish"),
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM content WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Ese contenido no existe.");
    assertOwner(row, req.user);

    // Si el archivo se había subido aquí, se borra también del disco.
    if (row.origin === "file" && row.source_url.startsWith("/uploads/")) {
      const file = path.join(UPLOAD_DIR, path.basename(row.source_url));
      if (file.startsWith(UPLOAD_DIR)) fs.rmSync(file, { force: true });
      db.prepare("DELETE FROM uploads WHERE filename = ?").run(path.basename(row.source_url));
    }
    db.prepare("DELETE FROM content WHERE id = ?").run(row.id);
    res.json({ ok: true });
  }),
);

/* ---------------------------------------------------------------- vistas */

/** Registra que alguien vio una pieza. Alimenta las métricas de audiencia. */
contentRouter.post(
  "/views",
  requireAuth,
  wrap((req, res) => {
    const itemId = str(req.body?.id, "identificador");
    const itemKind = str(req.body?.kind, "tipo", { required: false, max: 30 }) || "content";
    const seconds = num(req.body?.seconds, "segundos", { min: 0, max: 86400, fallback: 0 });

    const already = db.prepare("SELECT 1 FROM views WHERE user_id = ? AND item_id = ?")
      .get(req.user.id, itemId);
    db.prepare("INSERT INTO views (user_id, item_kind, item_id, seconds) VALUES (?, ?, ?, ?)")
      .run(req.user.id, itemKind, itemId, Math.round(seconds));

    res.status(201).json({ ok: true, first: !already });
  }),
);

void STATUSES;
