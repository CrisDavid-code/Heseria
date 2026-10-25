/**
 * HESERIA — Archivos: subir, ver y descargar.
 *
 * Todo lo que la app deja bajar o abrir pasa por aquí: el PDF de una lección,
 * el audio de un ensayo, el acta de un grupo, el adjunto de un mensaje.
 *
 * Tres decisiones que importan:
 *
 *  · **Se sirve desde la ruta, no desde el directorio.** El directorio de
 *    subidas no es público: cada descarga comprueba antes quién pregunta. Un
 *    material de un curso de pago no debe poder bajarse sabiendo la URL.
 *  · **Se responde por partes (`Range`).** Sin eso, un video de 40 minutos no
 *    se puede adelantar: el reproductor tendría que bajarlo entero primero.
 *  · **El nombre original se conserva para quien descarga, pero no para el
 *    disco.** En disco el nombre lo pone el servidor, así nadie puede subir un
 *    archivo llamado `../../algo` ni pisar el de otra persona.
 */
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../auth.js";
import { db, newId, UPLOAD_DIR } from "../db.js";
import { badRequest, forbidden, HttpError, notFound, oneOf, str, wrap } from "../http.js";

export const filesRouter = Router();

/* ------------------------------------------------------------- qué se acepta */

/**
 * Lo que la plataforma admite. Es una lista cerrada a propósito: un ejecutable
 * subido a un curso sería una forma cómoda de repartir malware entre la gente
 * de una iglesia.
 */
const ALLOWED = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".weba",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/markdown": ".md",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/zip": ".zip",
  "application/epub+zip": ".epub",
};

/** A qué se puede adjuntar un archivo. */
const SCOPES = ["course", "lesson", "group", "church", "message", "event", "ministry", "user"];

/** Quién puede bajarlo. */
const VISIBILITIES = ["public", "enrolled", "members", "private"];

const MAX_BYTES = 200 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `f_${newId("")}${ALLOWED[file.mimetype] ?? ".bin"}`),
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      return cb(
        badRequest(
          "Ese tipo de archivo no se admite. Puedes subir imágenes, audio, video, PDF, documentos de Office, texto o ZIP.",
          "bad_mime",
        ),
      );
    }
    cb(null, true);
  },
});

/* ----------------------------------------------------------------- permisos */

const isStaff = (role) => ["admin", "pastor", "teacher", "leader", "creator", "artist"].includes(role);

/**
 * ¿Puede esta persona descargar este archivo?
 *
 * Se decide por el ámbito al que pertenece. Quien lo subió y la administración
 * siempre pueden; el resto depende de si está matriculado o es miembro.
 */
function canRead(file, user) {
  if (!file) return false;
  if (file.visibility === "public") return true;
  if (!user) return false;
  if (file.owner_id === user.id || user.role === "admin") return true;

  if (file.visibility === "private") return false;

  if (file.visibility === "enrolled") {
    // El curso puede venir por la lección o directamente.
    const courseId = file.scope === "course" ? file.scope_id : courseOfLesson(file.scope_id);
    if (!courseId) return false;
    return Boolean(
      db
        .prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?")
        .get(user.id, courseId),
    );
  }

  if (file.visibility === "members") {
    if (file.scope === "group") {
      return Boolean(
        db.prepare("SELECT 1 FROM group_members WHERE user_id = ? AND group_id = ?")
          .get(user.id, file.scope_id),
      );
    }
    if (file.scope === "church") {
      return Boolean(
        db.prepare("SELECT 1 FROM church_members WHERE user_id = ? AND church_id = ?")
          .get(user.id, file.scope_id),
      );
    }
    if (file.scope === "message") {
      return Boolean(
        db.prepare(`
          SELECT 1 FROM messages m
          JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
          WHERE m.attachment_id = ? AND cm.user_id = ?
        `).get(file.id, user.id),
      );
    }
    return false;
  }

  return false;
}

/** El curso al que pertenece una lección, buscando en el catálogo. */
function courseOfLesson(lessonId) {
  if (!lessonId) return null;
  const rows = db.prepare("SELECT id, data FROM catalog WHERE kind = 'course'").all();
  for (const row of rows) {
    const course = JSON.parse(row.data);
    const lessons = (course.modules ?? []).flatMap((m) => m.lessons ?? []);
    if (lessons.some((l) => l.id === lessonId)) return row.id;
  }
  return null;
}

/** ¿Puede adjuntar algo a este ámbito? */
function canWrite(scope, scopeId, user) {
  if (user.role === "admin") return true;

  switch (scope) {
    case "course":
    case "lesson":
      // Publicar material de un curso es cosa de quien enseña.
      return isStaff(user.role);
    case "group":
      return Boolean(
        db.prepare("SELECT 1 FROM group_members WHERE user_id = ? AND group_id = ?")
          .get(user.id, scopeId),
      );
    case "church":
      return isStaff(user.role);
    case "message":
      // El mensaje se crea después: basta con estar en la conversación.
      return Boolean(
        db.prepare("SELECT 1 FROM conversation_members WHERE user_id = ? AND conversation_id = ?")
          .get(user.id, scopeId),
      );
    case "event":
    case "ministry":
      return isStaff(user.role);
    case "user":
      return scopeId === user.id;
    default:
      return false;
  }
}

/* -------------------------------------------------------------- presentación */

function publicFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || row.original_name,
    name: row.original_name,
    mime: row.mime,
    size: row.size,
    scope: row.scope ?? null,
    scopeId: row.scope_id ?? null,
    visibility: row.visibility ?? "public",
    ownerId: row.owner_id ?? null,
    createdAt: row.created_at,
    /** Para abrirlo dentro de la app (video, audio, imagen, PDF). */
    viewUrl: `/api/files/${row.id}/view`,
    /** Para guardarlo en el teléfono. */
    downloadUrl: `/api/files/${row.id}/download`,
  };
}

const findFile = (id) => db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);

/* -------------------------------------------------------------------- subir */

filesRouter.post(
  "/",
  requireAuth,
  upload.single("file"),
  wrap((req, res) => {
    if (!req.file) throw badRequest("No llegó ningún archivo.", "no_file");

    const scope = req.body.scope ? oneOf(req.body.scope, SCOPES, "scope") : null;
    const scopeId = scope ? str(req.body.scopeId, "scopeId", { max: 80 }) : null;
    const title = str(req.body.title, "title", { required: false, max: 160 });
    const visibility = req.body.visibility
      ? oneOf(req.body.visibility, VISIBILITIES, "visibility")
      : "public";

    if (scope && !canWrite(scope, scopeId, req.user)) {
      // El archivo ya está en disco: si no puede publicarlo, no se queda.
      fs.rmSync(path.join(UPLOAD_DIR, req.file.filename), { force: true });
      throw forbidden("No puedes adjuntar archivos aquí.");
    }

    const id = newId("file");
    db.prepare(`
      INSERT INTO uploads (id, filename, original_name, mime, size, owner_id,
                           scope, scope_id, title, visibility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.file.filename,
      req.file.originalname.slice(0, 200),
      req.file.mimetype,
      req.file.size,
      req.user.id,
      scope,
      scopeId,
      title || null,
      visibility,
    );

    res.status(201).json(publicFile(findFile(id)));
  }),
);

/* ------------------------------------------------------------------ listar */

filesRouter.get(
  "/",
  requireAuth,
  wrap((req, res) => {
    const scope = oneOf(req.query.scope, SCOPES, "scope");
    const scopeId = str(req.query.scopeId, "scopeId", { max: 80 });

    const rows = db
      .prepare("SELECT * FROM uploads WHERE scope = ? AND scope_id = ? ORDER BY created_at DESC")
      .all(scope, scopeId);

    // Solo se listan los que esa persona podría abrir: enseñar el nombre de un
    // archivo que no puede ver no aporta nada y dice de más.
    res.json(rows.filter((row) => canRead(row, req.user)).map(publicFile));
  }),
);

/* ------------------------------------------------------------------- ficha */

filesRouter.get(
  "/:id",
  requireAuth,
  wrap((req, res) => {
    const row = findFile(req.params.id);
    if (!row) throw notFound("Ese archivo ya no está.");
    if (!canRead(row, req.user)) throw forbidden("Este archivo no está disponible para ti.");
    res.json(publicFile(row));
  }),
);

/* -------------------------------------------------------- ver y descargar */

/**
 * Envía el archivo. `disposition` decide si el teléfono lo abre dentro de la
 * app o lo guarda. Atiende `Range` para que el video y el audio se puedan
 * adelantar sin descargarlo entero.
 */
function send(req, res, row, disposition) {
  const full = path.join(UPLOAD_DIR, path.basename(row.filename));
  // `basename` ya corta cualquier "..", pero se comprueba igual: es la línea
  // que separa servir un archivo de servir todo el disco.
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) {
    throw notFound("Ese archivo ya no está en el servidor.");
  }

  const stat = fs.statSync(full);
  const name = encodeURIComponent(row.original_name);

  res.setHeader("Content-Type", row.mime);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${name}`);
  res.setHeader("Cache-Control", "private, max-age=3600");

  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        res.setHeader("Content-Range", `bytes */${stat.size}`);
        throw new HttpError(416, "Ese tramo del archivo no existe.", "bad_range");
      }

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Content-Length", end - start + 1);
      fs.createReadStream(full, { start, end }).pipe(res);
      return;
    }
  }

  res.setHeader("Content-Length", stat.size);
  fs.createReadStream(full).pipe(res);
}

for (const [route, disposition] of [
  ["view", "inline"],
  ["download", "attachment"],
]) {
  filesRouter.get(
    `/:id/${route}`,
    requireAuth,
    wrap((req, res) => {
      const row = findFile(req.params.id);
      if (!row) throw notFound("Ese archivo ya no está.");
      if (!canRead(row, req.user)) throw forbidden("Este archivo no está disponible para ti.");

      if (disposition === "attachment") {
        db.prepare(
          "INSERT OR REPLACE INTO downloads (user_id, kind, item_id, size_mb) VALUES (?, 'archivo', ?, ?)",
        ).run(req.user.id, row.id, Math.round((row.size / 1048576) * 100) / 100);
      }

      send(req, res, row, disposition);
    }),
  );
}

/* ------------------------------------------------------------------ borrar */

filesRouter.delete(
  "/:id",
  requireAuth,
  wrap((req, res) => {
    const row = findFile(req.params.id);
    if (!row) throw notFound("Ese archivo ya no está.");
    if (row.owner_id !== req.user.id && req.user.role !== "admin") {
      throw forbidden("Solo quien lo subió puede borrarlo.");
    }

    const full = path.join(UPLOAD_DIR, path.basename(row.filename));
    if (full.startsWith(UPLOAD_DIR)) fs.rmSync(full, { force: true });
    db.prepare("DELETE FROM uploads WHERE id = ?").run(row.id);

    res.json({ ok: true });
  }),
);
