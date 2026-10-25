/**
 * HESERIA — Diagnóstico de las credenciales push.
 *
 *   npm run check:push                  comprueba la configuración
 *   npm run check:push -- --send        envía un aviso a todos los dispositivos
 *   npm run check:push -- <token>       envía solo a ese dispositivo
 *
 * Revisa una por una las piezas que hacen falta y dice exactamente cuál falta y
 * dónde ponerla. Si se le pasa el token de un dispositivo, le manda un aviso de
 * verdad para cerrar el círculo.
 *
 * El token de un dispositivo se obtiene desde la propia app: Ajustes →
 * Notificaciones → Activar. Queda guardado en la tabla `push_tokens`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const credentials = path.join(root, "credentials");

const ok = (m) => console.log(`  ✓ ${m}`);
const no = (m, ayuda) => {
  console.log(`  ✗ ${m}`);
  if (ayuda) console.log(`      ${ayuda}`);
};
const rel = (p) => path.relative(process.cwd(), p);

console.log("\nHESERIA — diagnóstico de notificaciones push\n");

/* ------------------------------------------------------------------ FCM */

console.log("Android · Firebase Cloud Messaging");

const fcmPath = process.env.HESERIA_FCM_CREDENTIALS ?? path.join(credentials, "fcm-service-account.json");
let fcmListo = false;

if (!fs.existsSync(fcmPath)) {
  no(
    `Falta la cuenta de servicio en ${rel(fcmPath)}`,
    "Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.",
  );
} else {
  try {
    const account = JSON.parse(fs.readFileSync(fcmPath, "utf8"));
    const faltan = ["project_id", "client_email", "private_key"].filter((k) => !account[k]);
    if (faltan.length) {
      no(`El archivo no parece una cuenta de servicio: falta ${faltan.join(", ")}`);
    } else if (!account.private_key.includes("BEGIN PRIVATE KEY")) {
      no("La clave privada está mal copiada. Debe empezar por -----BEGIN PRIVATE KEY-----");
    } else {
      ok(`Cuenta de servicio del proyecto «${account.project_id}»`);
      fcmListo = true;
    }
  } catch (err) {
    no(`El archivo no es JSON válido: ${err.message}`);
  }
}

const googleServices = path.resolve(root, "../android/app/google-services.json");
if (!fs.existsSync(googleServices)) {
  no(
    `Falta google-services.json en ${rel(googleServices)}`,
    "Firebase → Configuración del proyecto → Tus apps → app.heseria.mobile → Descargar.",
  );
} else {
  try {
    const cfg = JSON.parse(fs.readFileSync(googleServices, "utf8"));
    const paquetes = (cfg.client ?? []).map((c) => c.client_info?.android_client_info?.package_name);
    if (paquetes.includes("app.heseria.mobile")) {
      ok("google-services.json con el identificador app.heseria.mobile");
    } else {
      no(
        `google-services.json es de otra app: ${paquetes.join(", ") || "sin apps"}`,
        "Añade una app Android con el identificador app.heseria.mobile y vuelve a descargarlo.",
      );
    }
  } catch (err) {
    no(`google-services.json no es JSON válido: ${err.message}`);
  }
}

/* ----------------------------------------------------------------- APNs */

console.log("\niOS · Apple Push Notification service");

const apnsPath = process.env.HESERIA_APNS_KEY ?? path.join(credentials, "apns.p8");
let apnsListo = false;

if (!fs.existsSync(apnsPath)) {
  no(
    `Falta la clave en ${rel(apnsPath)}`,
    "Apple Developer → Certificates, Identifiers & Profiles → Keys → nueva clave con APNs activado.",
  );
} else if (!fs.readFileSync(apnsPath, "utf8").includes("BEGIN PRIVATE KEY")) {
  no("El archivo .p8 no tiene el formato esperado.");
} else {
  const faltan = [
    !process.env.HESERIA_APNS_KEY_ID && "HESERIA_APNS_KEY_ID",
    !process.env.HESERIA_APNS_TEAM_ID && "HESERIA_APNS_TEAM_ID",
  ].filter(Boolean);
  if (faltan.length) {
    no(
      `Falta definir ${faltan.join(" y ")}`,
      "El Key ID sale del nombre del archivo (AuthKey_XXXXXXXXXX.p8); el Team ID, arriba a la derecha en Apple Developer.",
    );
  } else {
    ok(`Clave de APNs ${process.env.HESERIA_APNS_KEY_ID} del equipo ${process.env.HESERIA_APNS_TEAM_ID}`);
    apnsListo = true;
  }
}

/* --------------------------------------------------------- dispositivos */

console.log("\nDispositivos registrados");

const { db } = await import("./db.js");
const filas = db.prepare("SELECT platform, COUNT(*) AS n FROM push_tokens GROUP BY platform").all();

if (!filas.length) {
  no(
    "Ningún dispositivo ha registrado su token todavía",
    "Abre la app en un teléfono y entra en Ajustes → Notificaciones → Activar.",
  );
} else {
  for (const f of filas) ok(`${f.n} dispositivo(s) ${f.platform}`);
}

/* ------------------------------------------------------ envío de prueba */

const argumento = process.argv[2];
const aTodos = argumento === "--send" || argumento === "--enviar";

if (argumento) {
  console.log("\nEnvío de prueba");

  const destinos = aTodos
    ? db.prepare("SELECT token, platform FROM push_tokens").all()
    : [
        db.prepare("SELECT token, platform FROM push_tokens WHERE token = ?").get(argumento) ?? {
          token: argumento,
          platform: argumento.startsWith("ios-") ? "ios" : "android",
        },
      ];

  if (!destinos.length) {
    no(
      "No hay ningún dispositivo al que enviar",
      "Abre la app en el teléfono: Ajustes → Notificaciones → Activar push en este dispositivo.",
    );
  } else {
    const { sendTestPush } = await import("./push.js");
    for (const destino of destinos) {
      const resultado = await sendTestPush(destino.token, destino.platform);
      const etiqueta = `${destino.platform} · …${destino.token.slice(-8)}`;
      if (resultado.ok) {
        ok(`Entregado a ${etiqueta}. Míralo en el teléfono.`);
      } else {
        no(
          `No se pudo entregar a ${etiqueta}: ${resultado.reason}`,
          resultado.detail ? String(resultado.detail).slice(0, 300) : undefined,
        );
      }
    }
  }
}

/* ------------------------------------------------------------- resumen */

console.log("\n" + "─".repeat(60));
if (fcmListo || apnsListo) {
  console.log(
    `  Listo para enviar: ${[fcmListo && "Android", apnsListo && "iOS"].filter(Boolean).join(" y ")}.`,
  );
  console.log("  Reinicia el servidor para que tome las credenciales.");
} else {
  console.log("  Todavía no hay credenciales. Las notificaciones seguirán llegando");
  console.log("  dentro de la app, pero no como aviso del sistema con la app cerrada.");
}
console.log("");

if (!argumento) {
  console.log("  Para enviar un aviso de prueba a los dispositivos registrados:");
  console.log("    npm run check:push -- --send\n");
}
