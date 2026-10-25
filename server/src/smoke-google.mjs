/**
 * HESERIA — Prueba de «entrar con Google» de punta a punta.
 *
 *   node src/smoke-google.mjs
 *
 * Google firma los ID token con una clave privada suya y publica la pública.
 * Aquí se hace exactamente lo mismo con una clave generada al vuelo y un
 * servidor local que se hace pasar por el de las claves de Google. Así se
 * comprueba lo que de verdad importa, que es que el servidor no acepte
 * cualquier token:
 *
 *   · un token bien firmado y para esta app: entra,
 *   · la primera vez crea la cuenta; la segunda reconoce a la misma persona,
 *   · un token firmado por otra clave: rechazado,
 *   · un token emitido para otra app (aud distinto): rechazado,
 *   · un token caducado: rechazado,
 *   · un correo sin verificar en Google: rechazado,
 *   · una cuenta que ya existía con contraseña: se enlaza, no se duplica.
 *
 * Nada de esto toca la red ni necesita una cuenta de Google.
 */
import crypto from "node:crypto";
import http from "node:http";
import jwt from "jsonwebtoken";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FALLA ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ------------------------------------------------- la clave «de Google» */

const KID = "clave-de-prueba";
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const otra = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, use: "sig", alg: "RS256" };

const certs = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "max-age=3600" });
  res.end(JSON.stringify({ keys: [jwk] }));
});
const certsPort = await new Promise((resolve) =>
  certs.listen(0, "127.0.0.1", () => resolve(certs.address().port)),
);

const CLIENT_ID = "111111111111-heseria.apps.googleusercontent.com";
process.env.HESERIA_GOOGLE_CERTS = `http://127.0.0.1:${certsPort}/certs`;
process.env.HESERIA_GOOGLE_CLIENT_IDS = CLIENT_ID;
process.env.HESERIA_GOOGLE_CONFIG = "/ruta/que/no/existe.json";

/** Firma un ID token como lo haría Google. */
function idToken(claims = {}, { key = privateKey, kid = KID } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub: "1234567890",
      email: "prueba.google@heseria.app",
      email_verified: true,
      given_name: "Ana",
      family_name: "Ixchel",
      name: "Ana Ixchel",
      iat: now,
      exp: now + 3600,
      ...claims,
    },
    key,
    { algorithm: "RS256", header: { kid } },
  );
}

/* ------------------------------------------------------- el servidor real */

const PORT = 4399;
process.env.PORT = String(PORT);
await import("./index.js");
const BASE = `http://127.0.0.1:${PORT}`;

// Un momento para que el servidor abra el puerto.
for (let i = 0; i < 50; i++) {
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (res.ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const { db } = await import("./db.js");
const borrar = (email) => db.prepare("DELETE FROM users WHERE email = ?").run(email);

console.log("\nHESERIA — entrar con Google (Google simulado)\n");

/* ------------------------------------------------------------ el anuncio */

console.log("Qué anuncia el servidor");
{
  const res = await fetch(`${BASE}/api/auth/providers`);
  const data = await res.json();
  check("GET /api/auth/providers responde", res.status === 200, `estado ${res.status}`);
  check("anuncia Google habilitado", data.google?.enabled === true, JSON.stringify(data));
  check("publica el client id, que no es secreto", data.google?.clientId === CLIENT_ID, JSON.stringify(data));
}

/* ------------------------------------------------------- cuenta nueva */

console.log("\nCuenta nueva desde Google");
borrar("prueba.google@heseria.app");
let primerId = null;
{
  const { status, data } = await post("/api/auth/google", { idToken: idToken(), device: "prueba" });
  check("crea la cuenta y devuelve 201", status === 201, `estado ${status} ${JSON.stringify(data)}`);
  check("marca que fue creada", data?.created === true, JSON.stringify(data?.created));
  check("devuelve token de acceso", typeof data?.accessToken === "string" && data.accessToken.length > 20);
  check("devuelve token de refresco", typeof data?.refreshToken === "string" && data.refreshToken.length > 20);
  check(
    "toma el nombre de Google",
    data?.user?.firstName === "Ana" && data?.user?.lastName === "Ixchel",
    JSON.stringify(data?.user?.name),
  );
  check("entra con el rol más bajo", data?.user?.role === "user", String(data?.user?.role));
  primerId = data?.user?.id ?? null;
}

/* --------------------------------------------------- la misma persona */

console.log("\nLa segunda vez es la misma persona");
{
  const { status, data } = await post("/api/auth/google", { idToken: idToken() });
  check("entra sin crear otra cuenta", status === 200 && data?.created === false, `estado ${status}`);
  check("es el mismo usuario", data?.user?.id === primerId, `${data?.user?.id} vs ${primerId}`);
}

/* --------------------------------------------- tokens que no valen nada */

console.log("\nTokens que deben rechazarse");
{
  const firmadoPorOtro = idToken({}, { key: otra.privateKey });
  const { status } = await post("/api/auth/google", { idToken: firmadoPorOtro });
  check("rechaza un token firmado por otra clave", status === 401, `estado ${status}`);
}
{
  const paraOtraApp = idToken({ aud: "999-otra.apps.googleusercontent.com" });
  const { status } = await post("/api/auth/google", { idToken: paraOtraApp });
  check("rechaza un token emitido para otra app", status === 401, `estado ${status}`);
}
{
  const now = Math.floor(Date.now() / 1000);
  const caducado = idToken({ iat: now - 7200, exp: now - 3600 });
  const { status } = await post("/api/auth/google", { idToken: caducado });
  check("rechaza un token caducado", status === 401, `estado ${status}`);
}
{
  const otroEmisor = idToken({ iss: "https://accounts.example.com" });
  const { status } = await post("/api/auth/google", { idToken: otroEmisor });
  check("rechaza un token de otro emisor", status === 401, `estado ${status}`);
}
{
  const sinVerificar = idToken({
    email: "sin.verificar@heseria.app",
    email_verified: false,
    sub: "999",
  });
  const { status, data } = await post("/api/auth/google", { idToken: sinVerificar });
  check("rechaza un correo sin verificar en Google", status === 401, `estado ${status}`);
  check("lo dice con su código", data?.code === "email_unverified", JSON.stringify(data));
  check(
    "y no crea la cuenta",
    !db.prepare("SELECT id FROM users WHERE email = ?").get("sin.verificar@heseria.app"),
  );
}
{
  const { status } = await post("/api/auth/google", { idToken: "esto-no-es-un-jwt" });
  check("rechaza un texto cualquiera", status === 401, `estado ${status}`);
}
{
  const otroKid = idToken({}, { kid: "kid-que-google-no-publica" });
  const { status } = await post("/api/auth/google", { idToken: otroKid });
  check("rechaza una firma con un kid desconocido", status === 401, `estado ${status}`);
}

/* ------------------------------------------------- enlazar con la cuenta */

console.log("\nEnlaza con una cuenta que ya existía");
const correoConClave = "con.clave@heseria.app";
borrar(correoConClave);
{
  const alta = await post("/api/auth/register", {
    firstName: "Mario",
    lastName: "Pop",
    email: correoConClave,
    password: "UnaClaveLarga123",
    acceptedTerms: true,
  });
  check("se registra primero con contraseña", alta.status === 201, `estado ${alta.status}`);
  const idOriginal = alta.data?.user?.id;

  const conGoogle = await post("/api/auth/google", {
    idToken: idToken({
      email: correoConClave,
      sub: "sub-de-mario",
      given_name: "Mario",
      family_name: "Pop",
    }),
  });
  check("entra con Google sin duplicar la cuenta", conGoogle.status === 200, `estado ${conGoogle.status}`);
  check(
    "conserva el mismo id",
    conGoogle.data?.user?.id === idOriginal,
    `${conGoogle.data?.user?.id} vs ${idOriginal}`,
  );

  const cuantas = db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?").get(correoConClave);
  check("sigue habiendo una sola cuenta con ese correo", cuantas.n === 1, String(cuantas.n));

  const sigueLaClave = await post("/api/auth/login", {
    email: correoConClave,
    password: "UnaClaveLarga123",
  });
  check("la contraseña original sigue sirviendo", sigueLaClave.status === 200, `estado ${sigueLaClave.status}`);
}

/* ----------------------------- la cuenta de Google no tiene contraseña */

console.log("\nUna cuenta creada con Google no tiene contraseña que adivinar");
{
  const intento = await post("/api/auth/login", {
    email: "prueba.google@heseria.app",
    password: "",
  });
  check("no se entra con contraseña vacía", intento.status === 401, `estado ${intento.status}`);
  const otroIntento = await post("/api/auth/login", {
    email: "prueba.google@heseria.app",
    password: "123456",
  });
  check("ni con una cualquiera", otroIntento.status === 401, `estado ${otroIntento.status}`);
}

/* -------------------------------------------------------------- limpieza */

borrar("prueba.google@heseria.app");
borrar(correoConClave);

console.log(`\n${passed} bien, ${failed} mal`);
if (failures.length > 0) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  · ${f}`);
}
process.exit(failed === 0 ? 0 : 1);
