/**
 * HESERIA — Reconocimiento de fuentes, en el servidor.
 *
 * El cliente ya reconoce el enlace para enseñar una vista previa, pero el
 * servidor **no puede fiarse de eso**: quien publica manda el cuerpo que
 * quiere, y decir «esto es de YouTube» con una URL cualquiera dejaría una
 * dirección arbitraria dentro de un `iframe` en el teléfono de todo el mundo.
 * Así que aquí se vuelve a analizar y el proveedor se deduce, no se acepta.
 *
 * El reflejo de `src/lib/media-source.ts`. Si cambia uno, cambia el otro: la
 * prueba `smoke-sources.mjs` compara las dos listas de casos.
 */

const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/i;
const HLS_EXT = /\.(m3u8)(\?|#|$)/i;

export const SPOTIFY_TYPES = ["track", "album", "playlist", "episode", "show", "artist"];

/** Proveedores cuyo contenido se incrusta en vez de alojarse. */
export const EMBED_PROVIDERS = ["youtube", "vimeo", "spotify"];

function youtubeId(url) {
  if (url.hostname.includes("youtu.be")) return url.pathname.slice(1) || null;
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const embed = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]+)/);
  return embed ? embed[2] : null;
}

function youtubePlaylistId(url) {
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  const list = url.searchParams.get("list");
  return list && !list.startsWith("RD") ? list : null;
}

function vimeoId(url) {
  if (!/(^|\.)vimeo\.com$/.test(url.hostname)) return null;
  const match = url.pathname.match(/\/(\d+)/);
  return match ? match[1] : null;
}

export function parseSpotify(input) {
  const trimmed = String(input ?? "").trim();

  const uri = trimmed.match(/^spotify:(\w+):([A-Za-z0-9]+)/);
  if (uri && SPOTIFY_TYPES.includes(uri[1])) return { type: uri[1], id: uri[2] };

  let url;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!/(^|\.)spotify\.com$/.test(url.hostname)) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  // Spotify antepone el idioma (/intl-es/track/xxx) y sus propias URL de
  // incrustación llevan /embed/. Se descartan esos prefijos para que analizar
  // una fuente ya normalizada devuelva lo mismo que analizar la original.
  while (parts.length > 2 && (parts[0].startsWith("intl-") || parts[0] === "embed")) {
    parts.shift();
  }
  const type = parts[0];
  const id = parts[1];
  if (!type || !id || !SPOTIFY_TYPES.includes(type)) return null;
  return { type, id: id.split("?")[0] };
}

/**
 * Analiza un enlace y devuelve la fuente normalizada, o `null` si no vale.
 *
 * `url` es lo que se reproduce (el reproductor incrustado o el archivo), y
 * `originalUrl` lo que escribió la persona, que es lo que se abre cuando pide
 * verlo en la app del dueño.
 */
export function parseMediaUrl(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return null;

  // Rutas del propio servidor: un archivo ya subido aquí.
  if (trimmed.startsWith("/uploads/") || trimmed.startsWith("/media/")) {
    const provider = AUDIO_EXT.test(trimmed) ? "direct-audio" : "direct-video";
    return { kind: "file", provider, url: trimmed, originalUrl: trimmed };
  }

  const spotifyUri = parseSpotify(trimmed);
  if (spotifyUri && trimmed.startsWith("spotify:")) {
    return {
      kind: "link",
      provider: "spotify",
      url: `https://open.spotify.com/embed/${spotifyUri.type}/${spotifyUri.id}`,
      originalUrl: `https://open.spotify.com/${spotifyUri.type}/${spotifyUri.id}`,
    };
  }

  let url;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const spotify = parseSpotify(url.href);
  if (spotify) {
    return {
      kind: "link",
      provider: "spotify",
      url: `https://open.spotify.com/embed/${spotify.type}/${spotify.id}`,
      originalUrl: `https://open.spotify.com/${spotify.type}/${spotify.id}`,
    };
  }

  const yt = youtubeId(url);
  if (yt) {
    const list = youtubePlaylistId(url);
    return {
      kind: "link",
      provider: "youtube",
      url: list
        ? `https://www.youtube.com/embed/${yt}?list=${encodeURIComponent(list)}`
        : `https://www.youtube.com/embed/${yt}`,
      originalUrl: `https://www.youtube.com/watch?v=${yt}`,
    };
  }

  const ytList = youtubePlaylistId(url);
  if (ytList) {
    return {
      kind: "link",
      provider: "youtube",
      url: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(ytList)}`,
      originalUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(ytList)}`,
    };
  }

  const vm = vimeoId(url);
  if (vm) {
    return {
      kind: "link",
      provider: "vimeo",
      url: `https://player.vimeo.com/video/${vm}`,
      originalUrl: `https://vimeo.com/${vm}`,
    };
  }

  const href = url.href;
  if (HLS_EXT.test(url.pathname)) {
    return { kind: "link", provider: "hls", url: href, originalUrl: href };
  }
  if (VIDEO_EXT.test(url.pathname)) {
    return { kind: "link", provider: "direct-video", url: href, originalUrl: href };
  }
  if (AUDIO_EXT.test(url.pathname)) {
    return { kind: "link", provider: "direct-audio", url: href, originalUrl: href };
  }

  return { kind: "link", provider: "unknown", url: href, originalUrl: href };
}

/** ¿El contenido vive fuera de Heseria y por tanto no se puede descargar? */
export function isExternal(provider) {
  return EMBED_PROVIDERS.includes(provider);
}
