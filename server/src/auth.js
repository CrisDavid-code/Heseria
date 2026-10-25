/**
 * HESERIA — Autenticación y autorización.
 *
 * Access token JWT de vida corta + refresh token opaco guardado en base de
 * datos, que puede revocarse. Las contraseñas se guardan con bcrypt; nunca en
 * claro y nunca se devuelven al cliente.
 *
 * El secreto de firma sale de la variable de entorno `HESERIA_JWT_SECRET`. Si
 * no existe se genera uno aleatorio la primera vez y se guarda en la base:
 * así el repositorio no contiene ninguna credencial.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { db, getSetting, json, newId, setSetting } from "./db.js";

const ACCESS_TTL = "2h";
const REFRESH_DAYS = 90;

function secret() {
  if (process.env.HESERIA_JWT_SECRET) return process.env.HESERIA_JWT_SECRET;
  let stored = getSetting("jwtSecret");
  if (!stored) {
    stored = crypto.randomBytes(48).toString("hex");
    setSetting("jwtSecret", stored);
  }
  return stored;
}

/* ------------------------------------------------------------ permisos */

const BASE = ["canView"];
const CONTRIBUTOR = [...BASE, "canCreate", "canEdit"];
const PUBLISHER = [...CONTRIBUTOR, "canPublish", "canDelete"];

/*
 * `canManageFoundation` es el permiso que abre campañas de donación y decide
 * a qué cuentas llega el dinero. Lo tiene **solo** la administración de la
 * plataforma: la Fundación Heseria es la única que puede pedir donaciones.
 * Ni una iglesia, ni un ministerio, ni una persona misionera pueden abrir su
 * propia colecta desde la app.
 *
 * No es una restricción técnica caprichosa: recaudar en nombre de otros es
 * exactamente el hueco por el que entra el fraude en una app de fe, y quien
 * dona tiene derecho a saber que siempre hay un único destinatario.
 */
export const ROLE_PERMISSIONS = {
  visitor: ["canView"],
  user: [...BASE, "canCreate"],
  member: [...BASE, "canCreate"],
  server: [...CONTRIBUTOR],
  leader: [...CONTRIBUTOR, "canManage"],
  youth_leader: [...CONTRIBUTOR, "canManage"],
  teacher: [...PUBLISHER, "canManageCourses"],
  musician: [...CONTRIBUTOR],
  artist: [...PUBLISHER],
  pastor: [...PUBLISHER, "canManage", "canManageChurch"],
  missionary: [...CONTRIBUTOR],
  creator: [...PUBLISHER],
  church_admin: [...PUBLISHER, "canManage", "canManageChurch", "canManageCourses"],
  moderator: [...BASE, "canModerate", "canDelete"],
  admin: [
    "canView", "canCreate", "canEdit", "canDelete", "canManage", "canModerate",
    "canPublish", "canManageChurch", "canManageCourses", "canManageFoundation",
  ],
};

export const can = (role, permission) => (ROLE_PERMISSIONS[role] ?? []).includes(permission);

/* -------------------------------------------------------------- tokens */

export const hashPassword = (plain) => bcrypt.hashSync(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: ACCESS_TTL });
}

export function issueRefreshToken(userId, device = "unknown") {
  const token = crypto.randomBytes(40).toString("base64url");
  const expires = new Date(Date.now() + REFRESH_DAYS * 86400000).toISOString();
  db.prepare(
    "INSERT INTO refresh_tokens (token, user_id, device, expires_at) VALUES (?, ?, ?, ?)",
  ).run(token, userId, device, expires);
  return token;
}

export function consumeRefreshToken(token) {
  const row = db.prepare("SELECT * FROM refresh_tokens WHERE token = ?").get(token);
  if (!row || row.revoked || new Date(row.expires_at) < new Date()) return null;
  // Rotación: cada uso invalida el anterior y entrega uno nuevo.
  db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE token = ?").run(token);
  return row.user_id;
}

export function revokeAllTokens(userId) {
  db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?").run(userId);
}

/* --------------------------------------------------------- serialización */

/** Convierte una fila de `users` en el objeto `User` que espera la app. */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name,
    handle: row.handle,
    email: row.email,
    role: row.role,
    bio: row.bio ?? "",
    city: row.city ?? "",
    country: row.country ?? "",
    churchId: row.church_id ?? undefined,
    ministries: json.parse(row.ministries, []),
    interests: json.parse(row.interests, []),
    followers: row.followers ?? 0,
    following: row.following ?? 0,
    joinedAt: (row.joined_at ?? "").slice(0, 10),
    color: row.color,
    avatarUrl: row.avatar_url ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    onboarded: Boolean(row.onboarded),
    status: row.status,
  };
}

export const findUserById = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
export const findUserByEmail = (email) =>
  db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(String(email ?? "").trim());

/* ------------------------------------------------------------ middleware */

function bearer(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Adjunta `req.user` cuando hay un token válido; nunca falla. */
export function optionalAuth(req, _res, next) {
  const token = bearer(req);
  if (token) {
    try {
      const payload = jwt.verify(token, secret());
      const row = findUserById(payload.sub);
      if (row && row.status === "active") req.user = row;
    } catch {
      /* token vencido o inválido: se sigue como anónimo */
    }
  }
  next();
}

/** Exige sesión. Responde 401 con un código que la app usa para renovar. */
export function requireAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: "Necesitas iniciar sesión.", code: "no_token" });
  try {
    const payload = jwt.verify(token, secret());
    const row = findUserById(payload.sub);
    if (!row) return res.status(401).json({ error: "La cuenta ya no existe.", code: "no_user" });
    if (row.status !== "active") {
      return res.status(403).json({ error: "Esta cuenta está suspendida.", code: "suspended" });
    }
    req.user = row;
    touch(row.id);
    next();
  } catch (err) {
    const expired = err.name === "TokenExpiredError";
    res.status(401).json({
      error: expired ? "Tu sesión expiró." : "Sesión inválida.",
      code: expired ? "expired" : "invalid",
    });
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Necesitas iniciar sesión." });
    if (!can(req.user.role, permission)) {
      return res.status(403).json({ error: "Tu rol no permite esta acción.", code: "forbidden" });
    }
    next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Necesitas iniciar sesión." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Tu rol no permite esta acción.", code: "forbidden" });
    }
    next();
  };
}

/* ------------------------------------------------------------ actividad */

const lastTouch = new Map();

/**
 * Registra que la cuenta sigue viva. Se agrupa por hora para no escribir una
 * fila por petición: lo que alimenta a los usuarios activos es la sesión, no
 * cada llamada.
 */
export function touch(userId) {
  const hour = Math.floor(Date.now() / 3600000);
  if (lastTouch.get(userId) === hour) return;
  lastTouch.set(userId, hour);
  db.prepare("UPDATE users SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").run(userId);
  db.prepare("INSERT INTO activity (user_id, type) VALUES (?, 'open')").run(userId);
}

/* ------------------------------------------------------------ registro */

const HANDLE_TAKEN = db.prepare("SELECT 1 FROM users WHERE handle = ?");

export function uniqueHandle(first, last) {
  const base = `${first}.${last}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "") || "usuario";
  if (!HANDLE_TAKEN.get(base)) return base;
  for (let i = 2; i < 500; i++) {
    if (!HANDLE_TAKEN.get(`${base}${i}`)) return `${base}${i}`;
  }
  return `${base}${newId("")}`;
}

const COLORS = [
  "from-cyan-500/70 to-blue-700/70",
  "from-violet-500/70 to-purple-800/70",
  "from-teal-400/70 to-emerald-700/70",
  "from-amber-400/70 to-orange-700/70",
  "from-rose-400/70 to-pink-700/70",
  "from-sky-400/70 to-indigo-800/70",
  "from-lime-400/70 to-teal-800/70",
  "from-fuchsia-400/70 to-indigo-800/70",
  "from-indigo-500/70 to-slate-800/70",
];

/** Color estable derivado del correo: el mismo usuario siempre igual. */
export function colorFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}
