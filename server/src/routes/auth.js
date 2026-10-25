/**
 * HESERIA — Rutas de cuenta: registro, sesión, perfil y contraseña.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import {
  colorFor, findUserByEmail, findUserById, hashPassword, issueRefreshToken, publicUser,
  requireAuth, revokeAllTokens, signAccessToken, uniqueHandle, verifyPassword,
  consumeRefreshToken,
} from "../auth.js";
import { db, newId, UPLOAD_DIR } from "../db.js";
import { badRequest, email as parseEmail, HttpError, notFound, password as parsePassword, str, wrap } from "../http.js";
import { mailConfigured, passwordResetEmail, welcomeEmail } from "../mailer.js";
import { googleConfigured, verifyGoogleIdToken, webClientId } from "../google.js";

export const authRouter = Router();

function sessionPayload(row, device) {
  return {
    user: publicUser(row),
    accessToken: signAccessToken(row),
    refreshToken: issueRefreshToken(row.id, device),
  };
}

/* ------------------------------------------------------------- registro */

authRouter.post(
  "/register",
  wrap((req, res) => {
    const body = req.body ?? {};
    const firstName = str(body.firstName, "nombre", { min: 2, max: 60 });
    const lastName = str(body.lastName, "apellido", { min: 2, max: 60 });
    const email = parseEmail(body.email);
    const password = parsePassword(body.password);
    // Solo el nombre, el apellido, el correo y la contraseña son obligatorios.
    // Nadie debería quedarse sin cuenta por no querer decir dónde vive.
    const country = str(body.country, "país", { required: false, max: 60 });
    const city = str(body.city, "ciudad", { required: false, max: 60 });
    const birthDate = str(body.birthDate, "fecha de nacimiento", { required: false, max: 20 });

    if (body.acceptedTerms !== true) {
      throw badRequest("Debes aceptar los términos para continuar.", "terms");
    }
    if (findUserByEmail(email)) {
      throw new HttpError(409, "Ya existe una cuenta con ese correo.", "email_taken");
    }

    const id = newId("u");
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, name, handle,
                         role, city, country, birth_date, color, bio, onboarded)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, '', 0)
    `).run(
      id, email, hashPassword(password), firstName, lastName,
      `${firstName} ${lastName}`, uniqueHandle(firstName, lastName),
      city, country, birthDate || null, colorFor(email),
    );

    const row = findUserById(id);
    db.prepare("INSERT INTO activity (user_id, type) VALUES (?, 'register')").run(id);

    // Bienvenida en el buzón: la cuenta nueva no llega a una bandeja vacía.
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, href)
      VALUES (?, ?, 'sistema', ?, ?, '/home')
    `).run(
      newId("n"), id, `Te damos la bienvenida, ${firstName}`,
      "Explora la Biblia, los devocionales y la comunidad desde la pantalla de inicio.",
    );

    void welcomeEmail({ to: email, name: firstName });

    res.status(201).json(sessionPayload(row, str(body.device, "device", { required: false })));
  }),
);

/* ---------------------------------------------------------------- login */

authRouter.post(
  "/login",
  wrap((req, res) => {
    const body = req.body ?? {};
    const email = parseEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    const row = findUserByEmail(email);
    // Mismo mensaje en ambos casos: no se revela si el correo existe.
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, "Correo o contraseña incorrectos.", "bad_credentials");
    }
    if (row.status !== "active") {
      throw new HttpError(403, "Esta cuenta está suspendida.", "suspended");
    }

    db.prepare("UPDATE users SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").run(row.id);
    db.prepare("INSERT INTO activity (user_id, type) VALUES (?, 'login')").run(row.id);
    res.json(sessionPayload(row, str(body.device, "device", { required: false })));
  }),
);

/* ------------------------------------------------------- entrar con Google */

/**
 * Qué formas de entrar están disponibles. El cliente pregunta esto antes de
 * pintar los botones: si Google no está configurado, el botón no aparece, en
 * lugar de aparecer y no hacer nada.
 */
authRouter.get(
  "/providers",
  wrap((_req, res) => {
    res.json({
      password: true,
      google: googleConfigured() ? { enabled: true, clientId: webClientId() } : { enabled: false },
    });
  }),
);

/**
 * Entrar o crear la cuenta con Google. El cliente manda el ID token que le dio
 * Google; aquí se verifica su firma y recién entonces se abre sesión.
 *
 * Si ya existe una cuenta con ese correo, se enlaza: quien se registró con
 * contraseña y ahora entra con Google sigue siendo la misma persona y conserva
 * sus cursos, sus marcas y sus mensajes.
 */
authRouter.post(
  "/google",
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const idToken = str(body.idToken, "idToken");
    const device = str(body.device, "device", { required: false });

    let profile;
    try {
      profile = await verifyGoogleIdToken(idToken);
    } catch (err) {
      const status = err.code === "google_not_configured" ? 503 : 401;
      throw new HttpError(status, err.message, err.code ?? "google_failed");
    }

    let row =
      db.prepare("SELECT * FROM users WHERE google_sub = ?").get(profile.sub) ??
      findUserByEmail(profile.email);
    let created = false;

    if (row) {
      if (row.status !== "active") {
        throw new HttpError(403, "Esta cuenta está suspendida.", "suspended");
      }
      if (row.google_sub !== profile.sub) {
        db.prepare("UPDATE users SET google_sub = ? WHERE id = ?").run(profile.sub, row.id);
      }
    } else {
      // Google no siempre manda nombre y apellido por separado.
      const parts = (profile.name || profile.email.split("@")[0]).trim().split(/s+/);
      const firstName = profile.firstName || parts[0] || "Usuario";
      const lastName = profile.lastName || (parts.length > 1 ? parts.slice(1).join(" ") : "");

      const id = newId("u");
      // Sin contraseña: la cuenta es de Google. `password_hash` queda vacío y
      // bcrypt nunca lo dará por bueno, así que no se puede entrar por el
      // formulario normal hasta que la persona defina una contraseña.
      db.prepare(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, name, handle,
                           role, city, country, birth_date, color, bio, onboarded, google_sub)
        VALUES (?, ?, '', ?, ?, ?, ?, 'user', '', '', NULL, ?, '', 0, ?)
      `).run(
        id, profile.email, firstName, lastName,
        `${firstName} ${lastName}`.trim(), uniqueHandle(firstName, lastName || firstName),
        colorFor(profile.email), profile.sub,
      );

      row = findUserById(id);
      created = true;
      db.prepare("INSERT INTO activity (user_id, type) VALUES (?, 'register')").run(id);
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, href)
        VALUES (?, ?, 'sistema', ?, ?, '/home')
      `).run(
        newId("n"), id, `Te damos la bienvenida, ${firstName}`,
        "Explora la Biblia, los devocionales y la comunidad desde la pantalla de inicio.",
      );
      void welcomeEmail({ to: profile.email, name: firstName });
    }

    db.prepare("UPDATE users SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").run(row.id);
    db.prepare("INSERT INTO activity (user_id, type) VALUES (?, 'login')").run(row.id);

    res.status(created ? 201 : 200).json({ ...sessionPayload(row, device), created });
  }),
);

/* -------------------------------------------------------------- refresh */

authRouter.post(
  "/refresh",
  wrap((req, res) => {
    const token = str(req.body?.refreshToken, "refreshToken");
    const userId = consumeRefreshToken(token);
    if (!userId) throw new HttpError(401, "Vuelve a iniciar sesión.", "bad_refresh");
    const row = findUserById(userId);
    if (!row || row.status !== "active") {
      throw new HttpError(401, "Vuelve a iniciar sesión.", "bad_refresh");
    }
    res.json(sessionPayload(row, "refresh"));
  }),
);

/* --------------------------------------------------------------- logout */

authRouter.post(
  "/logout",
  wrap((req, res) => {
    const token = req.body?.refreshToken;
    if (typeof token === "string" && token) {
      db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE token = ?").run(token);
    }
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------- me */

authRouter.get(
  "/me",
  requireAuth,
  wrap((req, res) => {
    res.json(publicUser(req.user));
  }),
);

authRouter.patch(
  "/me",
  requireAuth,
  wrap((req, res) => {
    const body = req.body ?? {};
    const fields = [];
    const values = [];

    const set = (column, value) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (body.firstName !== undefined || body.lastName !== undefined) {
      const firstName = str(body.firstName ?? req.user.first_name, "nombre", { min: 2, max: 60 });
      const lastName = str(body.lastName ?? req.user.last_name, "apellido", { min: 2, max: 60 });
      set("first_name", firstName);
      set("last_name", lastName);
      set("name", `${firstName} ${lastName}`);
    }
    if (body.bio !== undefined) set("bio", str(body.bio, "biografía", { required: false, max: 400 }));
    if (body.city !== undefined) set("city", str(body.city, "ciudad", { required: false, max: 60 }));
    if (body.country !== undefined) set("country", str(body.country, "país", { required: false, max: 60 }));
    if (body.churchId !== undefined) set("church_id", body.churchId || null);
    if (body.avatarUrl !== undefined) set("avatar_url", body.avatarUrl || null);
    if (body.coverUrl !== undefined) set("cover_url", body.coverUrl || null);
    if (body.onboarded !== undefined) set("onboarded", body.onboarded ? 1 : 0);
    if (Array.isArray(body.interests)) set("interests", JSON.stringify(body.interests.slice(0, 30)));
    if (Array.isArray(body.ministries)) set("ministries", JSON.stringify(body.ministries.slice(0, 30)));

    if (body.email !== undefined) {
      const email = parseEmail(body.email);
      const taken = findUserByEmail(email);
      if (taken && taken.id !== req.user.id) {
        throw new HttpError(409, "Ese correo ya está en uso.", "email_taken");
      }
      set("email", email);
    }

    if (!fields.length) return res.json(publicUser(req.user));

    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${fields.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(...values);
    res.json(publicUser(findUserById(req.user.id)));
  }),
);

/* --------------------------------------------------------- contraseña */

authRouter.post(
  "/change-password",
  requireAuth,
  wrap((req, res) => {
    const current = req.body?.currentPassword ?? "";
    const next = parsePassword(req.body?.newPassword);
    if (!verifyPassword(current, req.user.password_hash)) {
      throw badRequest("La contraseña actual no es correcta.", "bad_password");
    }
    db.prepare("UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?")
      .run(hashPassword(next), req.user.id);
    revokeAllTokens(req.user.id);
    res.json(sessionPayload(findUserById(req.user.id), "change-password"));
  }),
);

/**
 * Solicitud de recuperación. Responde siempre igual, exista o no la cuenta: no
 * se revela quién está registrado.
 *
 * Se generan dos formas de continuar, ambas válidas durante una hora:
 *
 *   · Un **enlace** `heseria://reset?token=…`, que abre la app directamente.
 *   · Un **código de seis dígitos**, para escribirlo a mano si el enlace no
 *     abre (correo en el ordenador, app en el teléfono).
 *
 * Sin SMTP configurado, el correo se escribe en `server/outbox/` y el código se
 * devuelve en la respuesta para no dejar el flujo a medias. Con SMTP, ni el
 * código ni el token salen de la API.
 */
authRouter.post(
  "/forgot-password",
  wrap(async (req, res) => {
    const email = parseEmail(req.body?.email);
    const row = findUserByEmail(email);
    const response = { sent: true, emailConfigured: mailConfigured() };

    if (row) {
      // El código es la clave real; el token largo es solo para el enlace.
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const token = crypto.randomBytes(24).toString("base64url");
      const expires = new Date(Date.now() + 3600000).toISOString();

      // Invalida solicitudes anteriores: solo el último código sirve.
      db.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0").run(row.id);

      const insert = db.prepare(
        "INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)",
      );
      insert.run(token, row.id, expires);
      insert.run(code, row.id, expires);

      const base = process.env.HESERIA_APP_URL ?? "heseria://reset";
      await passwordResetEmail({
        to: row.email,
        name: row.first_name,
        link: `${base}?token=${token}`,
        code,
      });

      // Sin correo real no se puede dejar a la persona sin forma de continuar.
      if (!mailConfigured()) response.code = code;
    }
    res.json(response);
  }),
);

authRouter.post(
  "/reset-password",
  wrap((req, res) => {
    const token = str(req.body?.token, "código");
    const password = parsePassword(req.body?.password);
    const row = db.prepare("SELECT * FROM password_resets WHERE token = ?").get(token);
    if (!row || row.used || new Date(row.expires_at) < new Date()) {
      throw badRequest("Ese código ya no es válido. Pide uno nuevo.", "bad_token");
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), row.user_id);
    // Se invalidan las dos formas (enlace y código) de la misma solicitud.
    db.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ?").run(row.user_id);
    revokeAllTokens(row.user_id);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------- imágenes */

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 8).replace(/[^\w.]/g, "") || ".jpg";
      cb(null, `${req.params.kind}_${newId("u")}${ext}`);
    },
  }),
  // Una foto de perfil no necesita más: obliga a recortar antes de subir.
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIME.includes(file.mimetype)) {
      return cb(badRequest("Sube una imagen JPG, PNG o WebP.", "bad_mime"));
    }
    cb(null, true);
  },
});

/**
 * Sube la foto de perfil o la de portada y la deja guardada en la cuenta.
 * `kind` es `avatar` o `cover`.
 */
authRouter.post(
  "/me/photo/:kind",
  requireAuth,
  (req, res, next) => {
    if (!["avatar", "cover"].includes(req.params.kind)) {
      return next(badRequest("Tipo de foto no válido.", "bad_kind"));
    }
    next();
  },
  photoUpload.single("file"),
  wrap((req, res) => {
    if (!req.file) throw badRequest("No llegó ninguna imagen.", "no_file");

    const column = req.params.kind === "avatar" ? "avatar_url" : "cover_url";
    const anterior = req.user[column];
    const url = `/uploads/${req.file.filename}`;

    db.prepare(`UPDATE users SET ${column} = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`)
      .run(url, req.user.id);

    // La imagen anterior deja de servir para nada: se borra del disco.
    if (anterior?.startsWith("/uploads/")) {
      const viejo = path.join(UPLOAD_DIR, path.basename(anterior));
      if (viejo.startsWith(UPLOAD_DIR)) fs.rmSync(viejo, { force: true });
    }

    res.status(201).json({ url, user: publicUser(findUserById(req.user.id)) });
  }),
);

authRouter.delete(
  "/me/photo/:kind",
  requireAuth,
  wrap((req, res) => {
    if (!["avatar", "cover"].includes(req.params.kind)) {
      throw badRequest("Tipo de foto no válido.", "bad_kind");
    }
    const column = req.params.kind === "avatar" ? "avatar_url" : "cover_url";
    const anterior = req.user[column];

    db.prepare(`UPDATE users SET ${column} = NULL WHERE id = ?`).run(req.user.id);

    if (anterior?.startsWith("/uploads/")) {
      const viejo = path.join(UPLOAD_DIR, path.basename(anterior));
      if (viejo.startsWith(UPLOAD_DIR)) fs.rmSync(viejo, { force: true });
    }
    res.json({ ok: true, user: publicUser(findUserById(req.user.id)) });
  }),
);

/* --------------------------------------------------------- dispositivos */

/** Registra el token push del dispositivo (FCM / APNs). */
authRouter.post(
  "/push-token",
  requireAuth,
  wrap((req, res) => {
    const token = str(req.body?.token, "token", { max: 500 });
    const platform = str(req.body?.platform, "plataforma", { required: false }) || "web";
    db.prepare(`
      INSERT INTO push_tokens (token, user_id, platform) VALUES (?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform
    `).run(token, req.user.id, platform);
    res.json({ ok: true });
  }),
);

/** Latido de sesión: alimenta el recuento de usuarios activos. */
authRouter.post(
  "/heartbeat",
  requireAuth,
  wrap((req, res) => {
    res.json({ ok: true, serverTime: new Date().toISOString() });
  }),
);

authRouter.delete(
  "/me",
  requireAuth,
  wrap((req, res) => {
    db.prepare("DELETE FROM users WHERE id = ?").run(req.user.id);
    res.json({ ok: true });
  }),
);

