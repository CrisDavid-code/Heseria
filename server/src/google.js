/**
 * HESERIA — Entrar con Google.
 *
 * Google no nos da la cuenta: nos da un *ID token* firmado por él. Aquí se
 * comprueba esa firma contra las claves públicas de Google y se revisa que el
 * token fuese emitido para esta app y no para otra. Sin esa comprobación
 * cualquiera podría inventarse un token y entrar como quien quisiera.
 *
 * No hay ningún secreto: el identificador de cliente es público por diseño y
 * las claves con las que se verifica son las que Google publica.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_DIR = path.join(HERE, "..", "credentials");
const CONFIG_PATH =
  process.env.HESERIA_GOOGLE_CONFIG ?? path.join(CREDENTIALS_DIR, "google-oauth.json");

const CERTS_URL = process.env.HESERIA_GOOGLE_CERTS ?? "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/**
 * Los identificadores de cliente aceptados. Puede haber varios: el de la web,
 * el de Android y el de iOS son distintos y todos son válidos para esta app.
 */
function clientIds() {
  const fromEnv = process.env.HESERIA_GOOGLE_CLIENT_IDS ?? process.env.HESERIA_GOOGLE_CLIENT_ID;
  const ids = [];
  if (fromEnv) ids.push(...fromEnv.split(",").map((s) => s.trim()).filter(Boolean));

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      for (const key of ["webClientId", "androidClientId", "iosClientId"]) {
        if (typeof cfg[key] === "string" && cfg[key]) ids.push(cfg[key].trim());
      }
      if (Array.isArray(cfg.clientIds)) {
        ids.push(...cfg.clientIds.filter((s) => typeof s === "string" && s));
      }
    } catch {
      // Un archivo roto no debe tumbar el servidor: se ignora y queda apagado.
    }
  }
  return [...new Set(ids)];
}

/** El identificador que usa la app web; es el que se envía al cliente. */
export function webClientId() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      if (typeof cfg.webClientId === "string" && cfg.webClientId) return cfg.webClientId;
    } catch {
      /* ignorado */
    }
  }
  return clientIds()[0] ?? null;
}

export function googleConfigured() {
  return clientIds().length > 0;
}

/* ------------------------------------------------------ claves públicas */

let certsCache = { keys: new Map(), until: 0 };

async function publicKeys() {
  if (certsCache.until > Date.now() && certsCache.keys.size > 0) return certsCache.keys;

  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Google devolvió ${res.status} al pedir sus claves públicas.`);
  const body = await res.json();

  const keys = new Map();
  for (const jwk of body.keys ?? []) {
    // createPublicKey entiende JWK directamente, así no hay que montar el PEM.
    const { createPublicKey } = await import("node:crypto");
    keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
  }

  // Google dice cuánto dura la caché en su cabecera; una hora es un valor sano.
  const cc = res.headers.get("cache-control") ?? "";
  const max = /max-age=(\d+)/.exec(cc);
  const seconds = max ? Number(max[1]) : 3600;
  certsCache = { keys, until: Date.now() + seconds * 1000 };
  return keys;
}

/**
 * Comprueba el ID token y devuelve el perfil que trae dentro.
 * Lanza si la firma no cuadra, si caducó o si no era para esta app.
 */
export async function verifyGoogleIdToken(idToken) {
  if (!googleConfigured()) {
    const err = new Error("El acceso con Google no está configurado en el servidor.");
    err.code = "google_not_configured";
    throw err;
  }

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid) {
    const err = new Error("El token de Google no tiene la forma esperada.");
    err.code = "bad_token";
    throw err;
  }

  const keys = await publicKeys();
  const key = keys.get(decoded.header.kid);
  if (!key) {
    const err = new Error("Google firmó con una clave que no reconocemos.");
    err.code = "bad_token";
    throw err;
  }

  let payload;
  try {
    payload = jwt.verify(idToken, key, {
      algorithms: ["RS256"],
      audience: clientIds(),
      issuer: ISSUERS,
    });
  } catch (cause) {
    const err = new Error("No pudimos validar tu cuenta de Google.");
    err.code = "bad_token";
    err.cause = cause;
    throw err;
  }

  if (!payload.email) {
    const err = new Error("Tu cuenta de Google no comparte un correo.");
    err.code = "no_email";
    throw err;
  }
  // Un correo sin verificar permitiría entrar a la cuenta de otra persona con
  // solo registrarse en Google usando su dirección.
  if (payload.email_verified === false || payload.email_verified === "false") {
    const err = new Error("Verifica tu correo en Google antes de entrar.");
    err.code = "email_unverified";
    throw err;
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email).toLowerCase(),
    firstName: typeof payload.given_name === "string" ? payload.given_name : "",
    lastName: typeof payload.family_name === "string" ? payload.family_name : "",
    name: typeof payload.name === "string" ? payload.name : "",
    picture: typeof payload.picture === "string" ? payload.picture : "",
  };
}
