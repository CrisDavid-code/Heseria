/**
 * HESERIA — Utilidades HTTP compartidas por las rutas.
 */

/** Envuelve un manejador async para que los errores lleguen al middleware. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Error con código de estado, para lanzar desde cualquier punto. */
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg, code) => new HttpError(400, msg, code);
export const notFound = (msg = "No encontrado.") => new HttpError(404, msg, "not_found");
export const forbidden = (msg = "No tienes permiso para esto.") => new HttpError(403, msg, "forbidden");

/* ---------------------------------------------------------- validación */

export function str(value, field, { min = 0, max = 5000, required = true } = {}) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) {
    if (required) throw badRequest(`El campo «${field}» es obligatorio.`, "required");
    return "";
  }
  if (v.length < min) throw badRequest(`«${field}» necesita al menos ${min} caracteres.`, "too_short");
  if (v.length > max) throw badRequest(`«${field}» supera los ${max} caracteres.`, "too_long");
  return v;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function email(value) {
  const v = str(value, "correo electrónico").toLowerCase();
  if (!EMAIL.test(v)) throw badRequest("Escribe un correo electrónico válido.", "bad_email");
  return v;
}

export function password(value) {
  const v = typeof value === "string" ? value : "";
  if (v.length < 6) throw badRequest("La contraseña debe tener al menos 6 caracteres.", "weak_password");
  if (v.length > 200) throw badRequest("La contraseña es demasiado larga.", "weak_password");
  return v;
}

export function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw badRequest(`«${field}» debe ser uno de: ${allowed.join(", ")}.`, "bad_value");
  }
  return value;
}

export function num(value, field, { min = -Infinity, max = Infinity, fallback } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    if (fallback !== undefined) return fallback;
    throw badRequest(`«${field}» debe ser un número.`, "bad_number");
  }
  return Math.min(max, Math.max(min, n));
}

/** Paginación uniforme: ?page=1&limit=20 */
export function page(query, defaultLimit = 20, maxLimit = 100) {
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  const current = Math.max(1, Number(query.page) || 1);
  return { limit, page: current, offset: (current - 1) * limit };
}

export function paginate(list, query, defaultLimit = 20) {
  const { limit, page: current, offset } = page(query, defaultLimit);
  return {
    items: list.slice(offset, offset + limit),
    total: list.length,
    page: current,
    limit,
    hasMore: offset + limit < list.length,
  };
}

/** Comparación sin acentos ni mayúsculas, para búsquedas escritas a mano. */
export function fold(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
