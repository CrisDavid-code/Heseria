/**
 * HESERIA — Servidor de la API.
 *
 *   npm start          → arranca en el puerto 4000
 *   npm run reset      → rehace la base de datos desde el dataset
 *
 * Sirve tres cosas:
 *   /api/*      la API que consume la aplicación móvil
 *   /media/*    el audio y el video de prueba generados
 *   /uploads/*  los archivos que sube la gente desde la app
 */
import cors from "cors";
import express from "express";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db, MEDIA_DIR, UPLOAD_DIR } from "./db.js";
import { optionalAuth } from "./auth.js";
import { HttpError } from "./http.js";
import { seed } from "./seed.js";

import { authRouter } from "./routes/auth.js";
import { catalogRouter } from "./routes/catalog.js";
import { socialRouter } from "./routes/social.js";
import { meRouter } from "./routes/me.js";
import { contentRouter } from "./routes/content.js";
import { broadcastRouter, dispatchScheduled } from "./routes/broadcast.js";
import { analyticsRouter } from "./routes/analytics.js";
import { adminRouter } from "./routes/admin.js";
import { bibleRouter } from "./routes/bible.js";
import { paymentsRouter } from "./routes/payments.js";
import { filesRouter } from "./routes/files.js";
import { podcastsRouter } from "./routes/podcasts.js";
import { attachRealtime, onlineCount } from "./realtime.js";
import { pushConfigured } from "./push.js";
import { mailConfigured } from "./mailer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", true);

/**
 * CORS abierto a cualquier origen: la app empaquetada se sirve desde
 * `capacitor://localhost` (iOS) o `https://localhost` (Android), y en
 * desarrollo desde `http://localhost:5173`. No se usan cookies — la sesión
 * viaja en la cabecera Authorization — así que no hay riesgo de CSRF.
 */
app.use(cors({ origin: true, credentials: false, maxAge: 86400 }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

/* ------------------------------------------------------- archivos estáticos */

const staticOptions = {
  maxAge: "7d",
  setHeaders(res) {
    // `Accept-Ranges` permite al reproductor saltar en la línea de tiempo.
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
};

app.use("/media", express.static(MEDIA_DIR, staticOptions));
app.use("/uploads", express.static(UPLOAD_DIR, staticOptions));

/* --------------------------------------------------------------- rutas */

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "heseria-api",
    version: "1.1.0",
    time: new Date().toISOString(),
    users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
    online: onlineCount(),
    // Qué integraciones externas están configuradas en esta instalación.
    features: {
      realtime: true,
      calls: true,
      email: mailConfigured(),
      push: pushConfigured(),
    },
  });
});

/**
 * Configuración que el cliente necesita para funcionar.
 *
 * La clave del mapa vive aquí y no en el paquete de la app: así se cambia o se
 * revoca sin publicar una versión nueva, y no queda escrita en el repositorio.
 * Es una clave de navegador —Google la ve en cada petición—, así que lo que la
 * protege de verdad son las restricciones que se le ponen en la consola de
 * Google (por dominio y por API), no el secreto.
 */
app.get("/api/config", (_req, res) => {
  const googleMapsKey = process.env.HESERIA_GOOGLE_MAPS_KEY ?? null;
  res.json({
    maps: {
      provider: googleMapsKey ? "google" : "none",
      googleMapsKey,
      // Guatemala, por si aún no hay señal de GPS.
      defaultCenter: { lat: 14.6349, lng: -90.5069 },
    },
  });
});

/** Qué medios de prueba trae el servidor. Útil para verificar la instalación. */
app.get("/api/media/manifest", (_req, res) => {
  const file = path.join(MEDIA_DIR, "manifest.json");
  if (!fs.existsSync(file)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(file, "utf8")));
});

/**
 * Cifras públicas para la portada web. Solo agregados, ningún dato personal.
 */
app.get("/api/public/stats", (_req, res) => {
  const n = (sql) => db.prepare(sql).get().n ?? 0;
  res.json({
    churches: n("SELECT COUNT(*) AS n FROM catalog WHERE kind = 'church'"),
    users: n("SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
    content:
      n("SELECT COUNT(*) AS n FROM catalog WHERE kind IN ('song','sermon','video','movie','series','course','podcast','devotional','plan')") +
      n("SELECT COUNT(*) AS n FROM content WHERE published = 1"),
    prayers: n("SELECT COUNT(*) AS n FROM prayers"),
  });
});

app.use("/api/auth", authRouter);

const api = express.Router();
api.use(optionalAuth);
// El orden importa: las rutas literales de la cuenta («/courses/enrolled»)
// deben registrarse antes que las paramétricas del catálogo («/courses/:id»),
// o Express hará coincidir la primera con la segunda.
api.use(meRouter);
api.use(paymentsRouter);
// Antes que el catálogo: /files/:id no debe caer en ninguna ruta con :id.
api.use("/files", filesRouter);
// Antes del catálogo: /podcast-feeds no debe caer en ninguna ruta con :id.
api.use(podcastsRouter);
// Antes del catálogo: «/bible/marks» no debe caer en «/bible/:book/:chapter».
api.use(bibleRouter);
api.use(catalogRouter);
api.use(socialRouter);
api.use(contentRouter);
api.use(analyticsRouter);
api.use(adminRouter);
api.use("/broadcast", broadcastRouter);
app.use("/api", api);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Esa ruta de la API no existe.", code: "not_found" });
});

/* --------------------------------------------------------- errores */

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "El archivo supera el tamaño permitido.", code: "too_large" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "La petición es demasiado grande.", code: "too_large" });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido.", code: "bad_json" });
  }
  console.error("[heseria] error no controlado:", err);
  res.status(500).json({ error: "Algo falló en el servidor.", code: "server_error" });
});

/* ------------------------------------------------------------- arranque */

/** Direcciones IPv4 de la máquina, para conectar el teléfono por wifi. */
export function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);
}

const result = seed({ reset: process.argv.includes("--reset") });

// Las campañas programadas se despachan cada minuto.
const timer = setInterval(() => {
  try {
    dispatchScheduled();
  } catch (err) {
    console.error("[heseria] fallo al despachar campañas programadas:", err.message);
  }
}, 60_000);
timer.unref?.();

/*
 * El servidor HTTP se crea a mano porque el WebSocket comparte puerto con la
 * API: `attachRealtime` se engancha a él en la ruta /ws.
 */
const server = http.createServer(app);
attachRealtime(server);

server.listen(PORT, "0.0.0.0", () => {
  const addresses = lanAddresses();
  const push = pushConfigured();
  console.log("");
  console.log("  HESERIA API");
  console.log(`  local     http://localhost:${PORT}`);
  for (const address of addresses) console.log(`  red       http://${address}:${PORT}`);
  console.log(`  base      ${path.relative(process.cwd(), path.join(here, "../data/heseria.db"))}`);
  console.log(
    result.skipped
      ? "  datos     ya sembrados"
      : `  datos     sembrados (${result.users} cuentas, ${result.catalog} elementos de catálogo)`,
  );
  console.log("  tiempo real  mensajes, notificaciones y llamadas en /ws");
  console.log(
    `  correo       ${mailConfigured() ? "SMTP configurado" : "sin SMTP — se guarda en outbox/"}`,
  );
  console.log(
    `  push         ${push.fcm || push.apns
      ? [push.fcm && "FCM", push.apns && "APNs"].filter(Boolean).join(" + ")
      : "sin credenciales — solo dentro de la app"}`,
  );
  console.log("");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
