/**
 * HESERIA — Lectura de feeds de podcast en el propio teléfono.
 *
 * Sin servidor propio, el feed se lee desde la app. Dentro del APK se usa el
 * HTTP nativo de Capacitor, que no pasa por las restricciones CORS del
 * navegador: así se puede leer cualquier feed público, igual que lo hace
 * cualquier app de podcasts. En el navegador solo funcionan los feeds que
 * permiten CORS (sirve para probar).
 *
 * Todo lo que trae el feed lo escribió un tercero: se limpia el HTML y se
 * recortan los textos; nunca se ejecuta nada de lo que llega.
 */
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const MAX_EPISODES = 200;

export interface FeedShow {
  feedUrl: string;
  title: string;
  author: string;
  description: string;
  language: string;
  link: string;
  image: string;
  categories: string[];
}

export interface FeedEpisode {
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  mime: string;
  sizeBytes: number;
  durationSec: number;
  publishedAt: string;
  episodeNumber: number | null;
  season: number | null;
  image: string;
}

/** Descarga texto. En el teléfono, sin CORS. */
export async function fetchText(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
      headers: { Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8" },
      responseType: "text",
      connectTimeout: 20000,
      readTimeout: 30000,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`El servidor del feed respondió ${res.status}.`);
    }
    return typeof res.data === "string" ? res.data : String(res.data ?? "");
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`El servidor del feed respondió ${res.status}.`);
  return res.text();
}

/** Solo direcciones públicas por http(s). */
export function assertFeedUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Esa dirección no es válida.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("El feed debe empezar por https://.");
  }
  return url.href;
}

/* -------------------------------------------------------------- limpieza */

/** Texto plano a partir del HTML de un tercero. El navegador lo descodifica. */
export function stripHtml(html: string, max = 4000): string {
  if (!html) return "";
  // Dos vueltas: los feeds escapan el HTML dos veces (`&lt;p&gt;`).
  let text = html;
  for (let i = 0; i < 2; i++) {
    const doc = new DOMParser().parseFromString(
      text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n"),
      "text/html",
    );
    // `textContent` no ejecuta scripts ni carga imágenes: solo extrae texto.
    text = doc.body.textContent ?? "";
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

/** `01:23:45`, `23:45` o segundos sueltos. */
export function parseDuration(raw: string | null | undefined): number {
  const value = (raw ?? "").trim();
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Math.min(86400, Number(value));
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return Math.min(86400, Math.round(parts.reduce((t, n) => t * 60 + n, 0)));
}

/* ---------------------------------------------------------------- lectura */

const ITUNES = "http://www.itunes.com/dtds/podcast-1.0.dtd";

function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === name && !c.namespaceURI?.includes("itunes")) return c;
  return null;
}
function itunes(el: Element, name: string): Element | null {
  const list = el.getElementsByTagNameNS(ITUNES, name);
  // Solo hijos directos: un <itunes:image> de un episodio no es la portada del programa.
  for (const c of Array.from(list)) if (c.parentElement === el) return c;
  return null;
}
const text = (el: Element | null, max = 400) => (el?.textContent ?? "").trim().slice(0, max);

export function parseFeed(xml: string, feedUrl: string): { show: FeedShow; episodes: FeedEpisode[] } {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Ese archivo no es un feed que sepamos leer.");
  const channel = doc.querySelector("rss > channel, channel");
  if (!channel) throw new Error("La dirección no devolvió un feed de podcast.");

  const image =
    itunes(channel, "image")?.getAttribute("href") ||
    text(child(channel, "image")?.querySelector("url") ?? null, 600);

  const show: FeedShow = {
    feedUrl,
    title: stripHtml(text(child(channel, "title"), 300), 160) || "Podcast sin título",
    author: stripHtml(text(itunes(channel, "author"), 200), 120),
    description: stripHtml(
      channel.querySelector(":scope > description")?.textContent || text(itunes(channel, "summary"), 4000),
      2000,
    ),
    language: text(child(channel, "language"), 16),
    link: text(child(channel, "link"), 600),
    image: image || "",
    categories: Array.from(channel.getElementsByTagNameNS(ITUNES, "category"))
      .map((c) => c.getAttribute("text") ?? "")
      .filter(Boolean)
      .slice(0, 6),
  };

  const episodes: FeedEpisode[] = [];
  for (const item of Array.from(channel.querySelectorAll(":scope > item"))) {
    const enclosure = item.querySelector("enclosure");
    const audioUrl = enclosure?.getAttribute("url") ?? "";
    const type = enclosure?.getAttribute("type") ?? "";
    // Sin audio no hay episodio que reproducir.
    if (!/^https?:\/\//i.test(audioUrl)) continue;
    if (type && !type.startsWith("audio/")) continue;

    const date = new Date(text(child(item, "pubDate"), 64));
    episodes.push({
      guid: text(child(item, "guid"), 300) || audioUrl,
      title: stripHtml(text(child(item, "title"), 400), 200) || "Episodio sin título",
      description: stripHtml(
        text(itunes(item, "summary"), 8000) || item.querySelector("description")?.textContent || "",
        3000,
      ),
      audioUrl,
      mime: type || "audio/mpeg",
      sizeBytes: Number(enclosure?.getAttribute("length")) || 0,
      durationSec: parseDuration(text(itunes(item, "duration"), 20)),
      publishedAt: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
      episodeNumber: Number(text(itunes(item, "episode"), 8)) || null,
      season: Number(text(itunes(item, "season"), 8)) || null,
      image: itunes(item, "image")?.getAttribute("href") || show.image,
    });
    if (episodes.length >= MAX_EPISODES) break;
  }

  if (episodes.length === 0) throw new Error("El feed no trae episodios con audio.");
  episodes.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { show, episodes };
}

export async function readFeed(raw: string) {
  const url = assertFeedUrl(raw);
  return parseFeed(await fetchText(url), url);
}
