/**
 * HESERIA — Servidor push gratuito (Cloudflare Workers). Plantilla del skill, reducida a lo que usa
 * Heseria: cada día a las 7:00 (Guatemala) envía el versículo del día a todos los dispositivos web
 * suscritos (pushTokens/{token} en Firestore, que la app escribe al activar el aviso).
 *
 * La clave de la cuenta de servicio vive solo como secreto del Worker. El APK no lo necesita:
 * programa su propio aviso local (src/native → scheduleDailyVerse).
 *
 * GET /libro/<id>/<archivo>.pdf: los libros de dominio público del lector (solo los de la lista).
 * GET /prueba?token=<FCM> envía el versículo de hoy a ese dispositivo (para probar sin esperar).
 */
import { dailyVerse } from "../../../src/data/daily-verses";
import books from "../../../src/content/books.json";

export interface Env {
  FIREBASE_SERVICE_ACCOUNT: string;
  SITE: string;
  DATABASE: string;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(sendDaily(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/libro/")) return book(url, req);
    const token = url.searchParams.get("token");
    if (url.pathname !== "/prueba" || !token) return new Response("Heseria push", { status: 200 });
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
    const msg = await todaysMessage(env);
    const res = await send(sa, await accessToken(sa), token, msg);
    return new Response(JSON.stringify({ status: res.status }), { headers: { "Content-Type": "application/json" } });
  },
};

async function todaysMessage(env: Env) {
  const [book, ch, v] = dailyVerse(new Date());
  const [books, data] = await Promise.all([
    fetch(`${env.SITE}/biblia/books.json`).then((r) => r.json() as Promise<{ id: string; name: string }[]>),
    fetch(`${env.SITE}/biblia/rvr1960/${book}.json`).then((r) => r.json() as Promise<Record<string, string[]>>),
  ]);
  const name = books.find((b) => b.id === book)?.name ?? book;
  return { title: `Versículo del día · ${name} ${ch}:${v}`, body: data[String(ch)]?.[v - 1] ?? "", link: `/bible/${book}/${ch}` };
}

/**
 * Cada hora: el versículo del día a los dispositivos cuyo horario elegido (en UTC) es esta
 * hora. Los registrados antes de existir los horarios (sin `hours`) lo reciben a las 13:00 UTC
 * (7:00 en Guatemala), como siempre.
 */
async function sendDaily(env: Env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
  const token = await accessToken(sa);
  const msg = await todaysMessage(env);
  const hour = new Date().getUTCHours();
  const root = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/${env.DATABASE}/documents`;
  const auth = { Authorization: `Bearer ${token}` };

  const names: string[] = [];
  // 1) Quienes eligieron esta hora (consulta: solo se leen los que coinciden).
  const q = await fetch(`${root}:runQuery`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "pushTokens" }],
        where: { fieldFilter: { field: { fieldPath: "hours" }, op: "ARRAY_CONTAINS", value: { integerValue: String(hour) } } },
        select: { fields: [{ fieldPath: "uid" }] },
      },
    }),
  });
  if (!q.ok) throw new Error(`firestore ${q.status}`);
  for (const row of (await q.json()) as { document?: { name: string } }[]) if (row.document) names.push(row.document.name);

  // 2) A las 13:00 UTC, los antiguos sin horario.
  if (hour === 13) {
    let pageToken = "";
    do {
      const res = await fetch(`${root}/pushTokens?pageSize=300&mask.fieldPaths=hours${pageToken ? `&pageToken=${pageToken}` : ""}`, { headers: auth });
      if (!res.ok) throw new Error(`firestore ${res.status}`);
      const page = (await res.json()) as { documents?: { name: string; fields?: { hours?: unknown } }[]; nextPageToken?: string };
      for (const d of page.documents ?? []) if (!d.fields?.hours) names.push(d.name);
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
  }

  let sent = 0;
  for (const name of names) {
    const device = decodeURIComponent(name.split("/").pop()!);
    const r = await send(sa, token, device, msg);
    if (r.ok) sent++;
    // Token vencido o inválido: se borra para no reintentarlo.
    else if (r.status === 404 || r.status === 400) {
      await fetch(`https://firestore.googleapis.com/v1/${name}`, { method: "DELETE", headers: auth });
    }
  }
  console.log(`versículo del día (hora UTC ${hour}) enviado a ${sent} dispositivos`);
}

function send(sa: ServiceAccount, token: string, device: string, m: { title: string; body: string; link: string }) {
  return fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: device,
        notification: { title: m.title, body: m.body },
        data: { link: m.link, title: m.title, body: m.body },
        webpush: { headers: { TTL: "43200" }, fcm_options: { link: m.link } },
      },
    }),
  });
}

/** OAuth con la cuenta de servicio: JWT RS256 firmado con WebCrypto (sin dependencias). */
async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${enc({ alg: "RS256", typ: "JWT" })}.${enc(claims)}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${data}.${b64url(sig)}`,
  });
  if (!res.ok) throw new Error(`oauth ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

function b64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Los libros del lector están en Internet Archive, que no deja leer sus archivos desde otra
 * página (CORS). El Worker los entrega con el permiso y en caché. Solo los de la lista
 * (src/content/books.json): no es un acceso abierto a cualquier archivo.
 */
const BOOKS = new Set((books as { url: string }[]).map((b) => new URL(b.url).pathname));

async function book(url: URL, req: Request): Promise<Response> {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, HEAD" } });
  if (!BOOKS.has(url.pathname)) return new Response("No encontrado", { status: 404, headers: cors });
  const [, , id, file] = url.pathname.split("/");
  const res = await fetch(`https://archive.org/download/${id}/${file}`, {
    method: req.method === "HEAD" ? "HEAD" : "GET",
    cf: { cacheEverything: true, cacheTtl: 60 * 60 * 24 * 30 },
  } as RequestInit);
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/pdf");
  const len = res.headers.get("Content-Length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "public, max-age=604800");
  return new Response(res.body, { status: res.status, headers });
}
