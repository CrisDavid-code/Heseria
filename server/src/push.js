/**
 * HESERIA — Avisos push del sistema operativo.
 *
 * Implementa el envío real contra FCM (Android) y APNs (iOS). No hay nada
 * pendiente de programar: en cuanto existan las credenciales, envía.
 *
 * ## Android — FCM HTTP v1
 *
 * 1. Crea un proyecto en console.firebase.google.com y añade una app Android
 *    con el identificador `app.heseria.mobile`.
 * 2. Descarga `google-services.json` y ponlo en `android/app/`.
 * 3. En Configuración → Cuentas de servicio, genera una clave privada (JSON) y
 *    guárdala como `server/credentials/fcm-service-account.json`, o apunta
 *    `HESERIA_FCM_CREDENTIALS` a su ruta.
 *
 * ## iOS — APNs
 *
 * 1. En Apple Developer, crea una clave de APNs (.p8) y anota su Key ID y tu
 *    Team ID.
 * 2. Guarda el archivo como `server/credentials/apns.p8` y define
 *    `HESERIA_APNS_KEY_ID`, `HESERIA_APNS_TEAM_ID` y
 *    `HESERIA_APNS_BUNDLE_ID=app.heseria.mobile`.
 *
 * Sin credenciales, `deliverPush` devuelve `configured: false` y lo dice: la
 * notificación igualmente queda en el buzón dentro de la app.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_DIR = path.resolve(here, "../credentials");

/**
 * Las direcciones de Google y Apple se pueden redirigir para poder probar el
 * envío contra un servidor simulado, sin credenciales reales y sin mandarle
 * nada a nadie. Ver `src/smoke-push.mjs`.
 */
const FCM_HOST = process.env.HESERIA_FCM_HOST ?? "https://fcm.googleapis.com";
const OAUTH_HOST = process.env.HESERIA_OAUTH_HOST ?? "https://oauth2.googleapis.com";
const APNS_HOST =
  process.env.HESERIA_APNS_HOST ??
  (process.env.HESERIA_APNS_SANDBOX
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com");

/* ------------------------------------------------------------------- FCM */

const FCM_PATH =
  process.env.HESERIA_FCM_CREDENTIALS ?? path.join(CREDENTIALS_DIR, "fcm-service-account.json");

let fcmAccount = null;
let fcmToken = { value: null, expiresAt: 0 };

function loadFcmAccount() {
  if (fcmAccount !== null) return fcmAccount;
  try {
    fcmAccount = JSON.parse(fs.readFileSync(FCM_PATH, "utf8"));
  } catch {
    fcmAccount = false;
  }
  return fcmAccount;
}

/**
 * Consigue un token de acceso de Google firmando un JWT con la clave de la
 * cuenta de servicio. Se reutiliza mientras siga vigente.
 */
async function fcmAccessToken() {
  const account = loadFcmAccount();
  if (!account) return null;
  if (fcmToken.value && Date.now() < fcmToken.expiresAt - 60_000) return fcmToken.value;

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    account.private_key,
    { algorithm: "RS256" },
  );

  const res = await fetch(`${OAUTH_HOST}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    console.error("[heseria] FCM no entregó token:", await res.text());
    return null;
  }
  const data = await res.json();
  fcmToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return fcmToken.value;
}

async function sendFcm(token, { title, body, href }) {
  const account = loadFcmAccount();
  const accessToken = await fcmAccessToken();
  if (!accessToken) return { ok: false, reason: "sin_credenciales" };

  const res = await fetch(
    `${FCM_HOST}/v1/projects/${account.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          // `href` lo lee la app al tocar la notificación para abrir la pantalla.
          data: { href: href ?? "/home" },
          android: {
            priority: "high",
            notification: { channel_id: "heseria", color: "#22D3EE" },
          },
        },
      }),
    },
  );

  if (res.ok) return { ok: true };
  const detail = await res.text();
  // Un token caducado o de una app desinstalada se retira para no reintentar.
  const gone = res.status === 404 || detail.includes("UNREGISTERED") || detail.includes("INVALID_ARGUMENT");
  return { ok: false, reason: gone ? "token_invalido" : "error", detail };
}

/* ------------------------------------------------------------------ APNs */

const APNS_KEY_PATH = process.env.HESERIA_APNS_KEY ?? path.join(CREDENTIALS_DIR, "apns.p8");
let apnsToken = { value: null, issuedAt: 0 };

function apnsConfigured() {
  return Boolean(
    process.env.HESERIA_APNS_KEY_ID &&
      process.env.HESERIA_APNS_TEAM_ID &&
      fs.existsSync(APNS_KEY_PATH),
  );
}

/** El token de APNs vale una hora; Apple pide no regenerarlo antes de 20 min. */
function apnsAuthToken() {
  if (!apnsConfigured()) return null;
  if (apnsToken.value && Date.now() - apnsToken.issuedAt < 45 * 60_000) return apnsToken.value;
  const key = fs.readFileSync(APNS_KEY_PATH, "utf8");
  const value = jwt.sign({ iss: process.env.HESERIA_APNS_TEAM_ID }, key, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: process.env.HESERIA_APNS_KEY_ID },
  });
  apnsToken = { value, issuedAt: Date.now() };
  return value;
}

async function sendApns(token, { title, body, href }) {
  const auth = apnsAuthToken();
  if (!auth) return { ok: false, reason: "sin_credenciales" };

  const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${auth}`,
      "apns-topic": process.env.HESERIA_APNS_BUNDLE_ID ?? "app.heseria.mobile",
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    body: JSON.stringify({
      aps: { alert: { title, body }, sound: "default", badge: 1 },
      href: href ?? "/home",
    }),
  });

  if (res.ok) return { ok: true };
  const detail = await res.text();
  const gone = res.status === 410 || detail.includes("BadDeviceToken");
  return { ok: false, reason: gone ? "token_invalido" : "error", detail };
}

/* ----------------------------------------------------------------- envío */

const tokensFor = (userIds) =>
  userIds.length
    ? db
        .prepare(
          `SELECT token, platform, user_id FROM push_tokens WHERE user_id IN (${userIds
            .map(() => "?")
            .join(",")})`,
        )
        .all(...userIds)
    : [];

const dropToken = db.prepare("DELETE FROM push_tokens WHERE token = ?");

/**
 * Envía un aviso de prueba a un dispositivo concreto. Lo usa `npm run check:push`
 * para comprobar credenciales sin tener que publicar una campaña.
 */
export async function sendTestPush(token, platform = "android") {
  const payload = {
    title: "Heseria",
    body: "Prueba de notificación. Si ves esto, el push está configurado.",
    href: "/notifications",
  };
  return platform === "ios" ? sendApns(token, payload) : sendFcm(token, payload);
}

export function pushConfigured() {
  return { fcm: Boolean(loadFcmAccount()), apns: apnsConfigured() };
}

/**
 * Entrega el aviso a todos los dispositivos registrados de esas personas.
 *
 * Nunca lanza: si el push falla, la notificación ya está en el buzón de la app
 * y eso no debe romper el envío de la campaña.
 */
export async function deliverPush(userIds, payload) {
  const configured = pushConfigured();
  const tokens = tokensFor(userIds);

  if (!configured.fcm && !configured.apns) {
    return { configured: false, attempted: tokens.length, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  // En tandas, para no abrir cientos de conexiones a la vez.
  const batchSize = 50;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((row) =>
        row.platform === "ios" ? sendApns(row.token, payload) : sendFcm(row.token, payload),
      ),
    );
    results.forEach((result, index) => {
      const row = batch[index];
      if (result.status === "fulfilled" && result.value.ok) {
        sent++;
        return;
      }
      failed++;
      const reason = result.status === "fulfilled" ? result.value.reason : "excepcion";
      if (reason === "token_invalido") dropToken.run(row.token);
    });
  }

  return { configured: true, attempted: tokens.length, sent, failed };
}
