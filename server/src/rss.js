/**
 * HESERIA — Lectura de feeds de podcast (RSS 2.0 + itunes).
 *
 * ## Por qué esto sí y Spotify no
 *
 * Un feed de podcast existe **para que las apps lo descarguen**: el `enclosure`
 * apunta a un MP3 servido sin DRM, y todo reproductor de podcasts del mundo lo
 * baja para oírlo sin conexión. Ese es el trato que acepta quien publica un
 * podcast. Con Spotify el trato es el contrario: audio cifrado que solo su
 * reproductor puede abrir.
 *
 * Así que aquí sí se puede tener audio de verdad dentro de Heseria, guardable
 * en el teléfono, sin pedirle permiso a nadie y sin romper nada.
 *
 * ## Lo que sí hay que cuidar
 *
 *  · **El feed lo escribe un tercero.** Todo lo que viene dentro es texto ajeno:
 *    se limpia el HTML, se recortan las longitudes y nunca se ejecuta nada.
 *  · **La URL la elige quien publica en Heseria**, así que el servidor haría la
 *    petición por ella. Eso es un SSRF si no se filtra: se bloquean las
 *    direcciones privadas y todo lo que no sea http(s).
 *  · **Un feed puede ser enorme.** Se corta la descarga y el número de
 *    episodios, para que un feed de 4 000 capítulos no tumbe el servidor.
 */
import { XMLParser } from "fast-xml-parser";

/**
 * Tope de descarga. Un programa con veinte años de episodios llega a los 20 MB
 * de XML, así que 40 deja margen sin abrir la puerta a que alguien nos haga
 * bajar un archivo de gigas.
 */
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_EPISODES = 300;
const TIMEOUT_MS = 20000;

/* ------------------------------------------------------------ seguridad */

/**
 * Rechaza lo que no debe pedirse desde el servidor.
 *
 * Sin esto, quien publica podría poner `http://127.0.0.1:4000/api/...` o una
 * dirección de la red interna y usar a Heseria como puente para leerla. Es el
 * agujero clásico (SSRF) de cualquier función que «traiga una URL».
 */
export function assertSafeFeedUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    throw new Error("Esa dirección no es válida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("El feed debe empezar por http:// o https://.");
  }

  const host = url.hostname.toLowerCase();
  const privado =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "[::1]" ||
    host.startsWith("[fc") ||
    host.startsWith("[fd");

  if (privado) {
    throw new Error("No se pueden leer feeds de direcciones internas.");
  }
  return url.href;
}

/* -------------------------------------------------------------- limpieza */

/**
 * Decodifica las entidades del texto: las con nombre (`&amp;`) y las
 * numéricas (`&#237;`, `&#x00ED;`).
 *
 * Hace falta porque los feeds las escapan dos veces: el XML lleva `&amp;#237;`,
 * el analizador deja `&#237;` y sin este paso en pantalla se lee «b&#237;blico»
 * en vez de «bíblico». Solo se traducen caracteres, nunca se ejecuta nada.
 */
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => safeChar(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeChar(parseInt(code, 16)))
    // El & va al final: si no, un `&amp;lt;` se convertiría en `<`.
    .replace(/&amp;/gi, "&");
}

/** Un punto de código válido, o la entidad tal cual si no lo es. */
function safeChar(code) {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** Convierte las etiquetas de bloque en saltos y borra el resto. */
function removeTags(text) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "");
}

/**
 * Quita etiquetas y deja texto legible. Lo que llega es de un tercero.
 *
 * Se alterna descodificar y quitar etiquetas **dos veces** porque los feeds
 * escapan el HTML dos veces: el XML trae `&amp;lt;p&amp;gt;`, que tras la primera
 * vuelta sigue siendo el texto `<p>`. Con una sola pasada acabarían viéndose
 * etiquetas sueltas en la descripción del episodio.
 */
export function stripHtml(value, max = 4000) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : String(value?.["#text"] ?? "");

  let out = removeTags(decodeEntities(text));
  out = removeTags(decodeEntities(out));

  return out
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** El texto de un nodo que puede venir como cadena o como objeto. */
function text(node, max = 400) {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node).trim().slice(0, max);
  if (typeof node === "object") {
    if ("#text" in node) return String(node["#text"]).trim().slice(0, max);
    if ("@_href" in node) return String(node["@_href"]).trim().slice(0, max);
  }
  return "";
}

/** Siempre una lista, venga uno o varios. */
const list = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

/**
 * `01:23:45`, `23:45` o `2025` (segundos sueltos) → segundos.
 * Apple admite las tres formas en `itunes:duration`.
 */
export function parseDuration(value) {
  const raw = text(value, 20);
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Math.min(86400, Number(raw));

  const parts = raw.split(":").map((n) => Number(n));
  if (parts.some((n) => Number.isNaN(n))) return 0;

  const seconds = parts.reduce((total, n) => total * 60 + n, 0);
  return Number.isFinite(seconds) ? Math.min(86400, Math.max(0, Math.round(seconds))) : 0;
}

/** Una fecha utilizable, o la de hoy si el feed la trae rota. */
function parseDate(value) {
  const raw = text(value, 64);
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

/* -------------------------------------------------------------- lectura */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  // Los feeds usan itunes:, content:, media:… y nos interesa conservarlos.
  removeNSPrefix: false,
  processEntities: true,
});

/**
 * Descarga el feed. Corta por tiempo y por tamaño: un servidor lento o un
 * archivo gigante no pueden dejar colgada la petición de quien publica.
 */
async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: {
      // Identificarse es de buena educación y algunos servidores lo exigen.
      "User-Agent": "Heseria/1.0 (podcast reader; +https://heseria.app)",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`El servidor del feed respondió ${res.status}.`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("El feed es demasiado grande.");

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) throw new Error("El feed es demasiado grande.");

  return new TextDecoder("utf-8").decode(buffer);
}

/**
 * Lee un feed y devuelve el programa y sus episodios, ya normalizados.
 *
 * Solo se conservan los episodios con un `enclosure` de audio: un capítulo sin
 * archivo no se puede reproducir, y enseñarlo sería prometer algo que no está.
 */
export async function readPodcastFeed(rawUrl) {
  const url = assertSafeFeedUrl(rawUrl);
  const xml = await fetchFeed(url);

  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new Error("Ese archivo no es un feed que sepamos leer.");
  }

  const channel = doc?.rss?.channel ?? doc?.channel;
  if (!channel) throw new Error("La dirección no devolvió un feed de podcast.");

  const image =
    text(channel["itunes:image"]?.["@_href"], 600) ||
    text(channel.image?.url, 600) ||
    "";

  const show = {
    feedUrl: url,
    title: stripHtml(channel.title, 160) || "Podcast sin título",
    author:
      stripHtml(channel["itunes:author"], 120) ||
      stripHtml(channel.managingEditor, 120) ||
      "",
    description:
      stripHtml(channel.description, 2000) ||
      stripHtml(channel["itunes:summary"], 2000),
    language: text(channel.language, 16),
    link: text(channel.link, 600),
    image,
    categories: list(channel["itunes:category"])
      .map((c) => text(c?.["@_text"], 60))
      .filter(Boolean)
      .slice(0, 6),
    explicit: /^(yes|true)$/i.test(text(channel["itunes:explicit"], 8)),
  };

  const episodes = [];
  for (const item of list(channel.item)) {
    const enclosure = list(item.enclosure)[0];
    const audioUrl = text(enclosure?.["@_url"], 1200);
    const type = text(enclosure?.["@_type"], 80);

    // Sin archivo de audio no hay episodio que reproducir.
    if (!audioUrl) continue;
    if (type && !type.startsWith("audio/")) continue;
    if (!/^https?:\/\//i.test(audioUrl)) continue;

    episodes.push({
      guid: text(item.guid, 300) || audioUrl,
      title: stripHtml(item.title, 200) || "Episodio sin título",
      description:
        stripHtml(item["itunes:summary"], 4000) ||
        stripHtml(item.description, 4000) ||
        stripHtml(item["content:encoded"], 4000),
      audioUrl,
      mime: type || "audio/mpeg",
      sizeBytes: Number(text(enclosure?.["@_length"], 20)) || 0,
      durationSec: parseDuration(item["itunes:duration"]),
      publishedAt: parseDate(item.pubDate),
      episodeNumber: Number(text(item["itunes:episode"], 8)) || null,
      season: Number(text(item["itunes:season"], 8)) || null,
      image: text(item["itunes:image"]?.["@_href"], 600) || show.image,
      explicit: /^(yes|true)$/i.test(text(item["itunes:explicit"], 8)),
    });

    if (episodes.length >= MAX_EPISODES) break;
  }

  if (episodes.length === 0) {
    throw new Error("El feed no trae episodios con audio descargable.");
  }

  // Del más reciente al más antiguo, que es como se escucha un podcast.
  episodes.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return { show, episodes };
}
