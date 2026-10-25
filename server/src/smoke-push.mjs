/**
 * HESERIA — Prueba del envío push contra FCM y APNs simulados.
 *
 *   node src/smoke-push.mjs
 *
 * Levanta dos servidores locales que se hacen pasar por Google y por Apple, y
 * genera credenciales de verdad (una clave RSA y una EC, firmadas aquí mismo).
 * Con eso se comprueba **todo el camino del envío** sin necesitar cuentas y sin
 * mandarle nada a nadie:
 *
 *   · que se firma bien el JWT de la cuenta de servicio,
 *   · que se pide y se reutiliza el token de acceso de Google,
 *   · que el cuerpo del mensaje tiene la forma que espera FCM HTTP v1,
 *   · que el JWT de APNs se firma con ES256 y lleva el `kid` correcto,
 *   · que un token de un dispositivo desaparecido se borra de la base,
 *   · que un fallo pasajero **no** borra el token.
 *
 * Lo único que esta prueba no puede cubrir es que Google y Apple acepten unas
 * credenciales concretas: eso depende de las cuentas, no del código.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

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

/* ------------------------------------------------- credenciales de prueba */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heseria-push-"));

// Cuenta de servicio de Firebase, con una clave RSA generada aquí.
const rsa = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const serviceAccount = {
  type: "service_account",
  project_id: "heseria-prueba",
  private_key_id: "clave-de-prueba",
  private_key: rsa.privateKey,
  client_email: "push@heseria-prueba.iam.gserviceaccount.com",
};
const fcmPath = path.join(dir, "fcm.json");
fs.writeFileSync(fcmPath, JSON.stringify(serviceAccount));

// Clave de APNs: Apple usa curva elíptica P-256.
const ec = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const apnsPath = path.join(dir, "apns.p8");
fs.writeFileSync(apnsPath, ec.privateKey);

/* ------------------------------------------------------ servidores falsos */

const recibido = { oauth: [], fcm: [], apns: [] };

/** Devuelve el cuerpo de una petición como texto. */
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });

/** Un token de dispositivo que el servidor falso considerará desaparecido. */
const TOKEN_MUERTO = "token-desaparecido";
const TOKEN_FALLO = "token-con-fallo-pasajero";

const google = http.createServer(async (req, res) => {
  const body = await readBody(req);

  if (req.url === "/token") {
    recibido.oauth.push(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ access_token: "token-de-acceso-simulado", expires_in: 3600 }));
    return;
  }

  if (req.url.includes("/messages:send")) {
    const payload = JSON.parse(body);
    recibido.fcm.push({ url: req.url, auth: req.headers.authorization, payload });

    if (payload.message.token === TOKEN_MUERTO) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { status: "UNREGISTERED" } }));
      return;
    }
    if (payload.message.token === TOKEN_FALLO) {
      res.writeHead(503);
      res.end("servicio no disponible");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ name: "projects/heseria-prueba/messages/1" }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const apple = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const token = req.url.split("/").pop();
  recibido.apns.push({ token, headers: req.headers, payload: JSON.parse(body) });

  if (token === TOKEN_MUERTO) {
    res.writeHead(410);
    res.end(JSON.stringify({ reason: "BadDeviceToken" }));
    return;
  }
  res.writeHead(200);
  res.end();
});

const listen = (server) =>
  new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

const googlePort = await listen(google);
const applePort = await listen(apple);

/* Se apunta el módulo a los servidores falsos antes de cargarlo. */
process.env.HESERIA_FCM_CREDENTIALS = fcmPath;
process.env.HESERIA_FCM_HOST = `http://127.0.0.1:${googlePort}`;
process.env.HESERIA_OAUTH_HOST = `http://127.0.0.1:${googlePort}`;
process.env.HESERIA_APNS_HOST = `http://127.0.0.1:${applePort}`;
process.env.HESERIA_APNS_KEY = apnsPath;
process.env.HESERIA_APNS_KEY_ID = "KEYID12345";
process.env.HESERIA_APNS_TEAM_ID = "TEAM123456";
process.env.HESERIA_APNS_BUNDLE_ID = "app.heseria.mobile";

const { db, newId } = await import("./db.js");
const { deliverPush, pushConfigured, sendTestPush } = await import("./push.js");

console.log("\nHESERIA — envío push contra FCM y APNs simulados\n");

/* ------------------------------------------------------------ detección */

const configured = pushConfigured();
check("detecta las credenciales de FCM", configured.fcm === true, JSON.stringify(configured));
check("detecta las credenciales de APNs", configured.apns === true, JSON.stringify(configured));

/* ----------------------------------------------------- cuentas de prueba */

const user = db.prepare("SELECT id FROM users WHERE status = 'active' LIMIT 1").get();
if (!user) {
  console.log("  Necesitas sembrar la base primero: npm run reset");
  process.exit(1);
}

const tokens = {
  android: `and-${newId("t")}`,
  ios: `ios-${newId("t")}`,
  muerto: TOKEN_MUERTO,
  fallo: TOKEN_FALLO,
};

const insert = db.prepare(
  "INSERT OR REPLACE INTO push_tokens (token, user_id, platform) VALUES (?, ?, ?)",
);
const cleanup = () => {
  for (const t of Object.values(tokens)) {
    db.prepare("DELETE FROM push_tokens WHERE token = ?").run(t);
  }
};
cleanup();

insert.run(tokens.android, user.id, "android");
insert.run(tokens.ios, user.id, "ios");

/* ---------------------------------------------------------------- envío */

console.log("\nEnvío a los dos sistemas");

const result = await deliverPush([user.id], {
  title: "Nuevo en Heseria",
  body: "Un contenido nuevo te espera.",
  href: "/content/abc",
});

check("informa de que hay credenciales", result.configured === true, JSON.stringify(result));
check("entrega a los dos dispositivos", result.sent === 2 && result.failed === 0, JSON.stringify(result));

/* ------------------------------------------------------------ FCM */

console.log("\nLo que recibió Google");

const fcm = recibido.fcm.find((r) => r.payload.message.token === tokens.android);
check("llamó al proyecto correcto", fcm?.url.includes("/v1/projects/heseria-prueba/messages:send"), fcm?.url);
check("usó el token de acceso obtenido", fcm?.auth === "Bearer token-de-acceso-simulado", fcm?.auth);
check("envió título y cuerpo", fcm?.payload.message.notification?.title === "Nuevo en Heseria");
check(
  "incluyó el destino para abrir la pantalla",
  fcm?.payload.message.data?.href === "/content/abc",
  JSON.stringify(fcm?.payload.message.data),
);
check("pidió prioridad alta en Android", fcm?.payload.message.android?.priority === "high");

// El JWT que se le mandó a Google debe validar contra la clave pública.
const assertion = new URLSearchParams(recibido.oauth[0]).get("assertion");
let jwtValido = false;
try {
  const [head, body, sig] = assertion.split(".");
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${head}.${body}`);
  jwtValido = verifier.verify(rsa.publicKey, Buffer.from(sig, "base64url"));
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  check("el JWT identifica la cuenta de servicio", claims.iss === serviceAccount.client_email, claims.iss);
  check(
    "el JWT pide el permiso de mensajería",
    claims.scope === "https://www.googleapis.com/auth/firebase.messaging",
    claims.scope,
  );
} catch (err) {
  check("el JWT de Google se pudo analizar", false, err.message);
}
check("el JWT está firmado con la clave privada", jwtValido);

/* ------------------------------------------------------------ APNs */

console.log("\nLo que recibió Apple");

const apns = recibido.apns.find((r) => r.token === tokens.ios);
check("usó el identificador de la app", apns?.headers["apns-topic"] === "app.heseria.mobile", apns?.headers["apns-topic"]);
check("marcó el aviso como alerta", apns?.headers["apns-push-type"] === "alert");
check("envió el título dentro de aps", apns?.payload.aps?.alert?.title === "Nuevo en Heseria");
check("incluyó el destino", apns?.payload.href === "/content/abc");

const bearer = apns?.headers.authorization?.replace("bearer ", "");
try {
  const [head, body] = bearer.split(".");
  const header = JSON.parse(Buffer.from(head, "base64url").toString());
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  check("el JWT de Apple usa ES256", header.alg === "ES256", header.alg);
  check("el JWT lleva el identificador de la clave", header.kid === "KEYID12345", header.kid);
  check("el JWT identifica el equipo", claims.iss === "TEAM123456", claims.iss);
} catch (err) {
  check("el JWT de Apple se pudo analizar", false, err.message);
}

/* ------------------------------------------------ tokens que ya no valen */

console.log("\nLimpieza de dispositivos");

insert.run(tokens.muerto, user.id, "android");
const conMuerto = await deliverPush([user.id], { title: "Prueba", body: "x", href: "/home" });
check("cuenta el fallo del dispositivo desaparecido", conMuerto.failed >= 1, JSON.stringify(conMuerto));
check(
  "borra el token del dispositivo desaparecido",
  !db.prepare("SELECT 1 FROM push_tokens WHERE token = ?").get(tokens.muerto),
);

insert.run(tokens.fallo, user.id, "android");
const conFallo = await deliverPush([user.id], { title: "Prueba", body: "x", href: "/home" });
check("cuenta el fallo pasajero", conFallo.failed >= 1, JSON.stringify(conFallo));
check(
  "conserva el token tras un fallo pasajero",
  Boolean(db.prepare("SELECT 1 FROM push_tokens WHERE token = ?").get(tokens.fallo)),
);

/* ---------------------------------------------------------- envío suelto */

console.log("\nEnvío de prueba dirigido");

const directo = await sendTestPush(tokens.android, "android");
check("sendTestPush entrega en Android", directo.ok === true, JSON.stringify(directo));
const directoIos = await sendTestPush(tokens.ios, "ios");
check("sendTestPush entrega en iOS", directoIos.ok === true, JSON.stringify(directoIos));

/* --------------------------------------------------- token reaprovechado */

const antes = recibido.oauth.length;
await deliverPush([user.id], { title: "Otra", body: "y", href: "/home" });
check(
  "reutiliza el token de acceso en vez de pedir otro",
  recibido.oauth.length === antes,
  `${antes} → ${recibido.oauth.length}`,
);

/* ------------------------------------------------------------- limpieza */

cleanup();
google.close();
apple.close();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} correctas · ${failed} fallidas`);
if (failures.length) {
  console.log("\n  Fallos:");
  for (const f of failures) console.log(`   · ${f}`);
}
console.log("");
process.exit(failed ? 1 : 0);
