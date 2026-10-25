/**
 * HESERIA — Reconocimiento de fuentes de medios.
 *
 * Convierte un enlace pegado por el usuario en algo reproducible: detecta el
 * proveedor, normaliza la URL de reproducción y decide si se renderiza con un
 * `<video>`/`<audio>` nativo o con el reproductor incrustado del dueño.
 *
 * ## Por qué se incrusta en vez de alojar
 *
 * Heseria no tiene licencia sobre la música ni sobre las películas de nadie, y
 * alojar una copia sería una infracción por mucho que el enlace sea público.
 * Incrustar el reproductor oficial es distinto: quien reproduce sigue siendo
 * YouTube o Spotify, la publicidad y las escuchas se las quedan ellos, y el
 * dueño del contenido conserva el poder de quitarlo cuando quiera.
 *
 * Eso impone reglas que **no** se pueden saltar:
 *
 *  · se usa su reproductor, no un extractor de audio ni una descarga,
 *  · no se ocultan sus anuncios ni sus controles,
 *  · si el dueño desactiva la incrustación, el contenido no se ve, y así debe
 *    ser: es su decisión,
 *  · Spotify solo reproduce la canción completa a quien tenga Premium y sesión
 *    iniciada; al resto le da 30 segundos. Eso lo decide Spotify, y la app lo
 *    dice en pantalla en lugar de dejar a la persona pensando que falla algo.
 */

export type MediaProvider =
  | "youtube"
  | "vimeo"
  | "spotify"
  | "direct-video"
  | "direct-audio"
  | "hls"
  | "unknown";

export type SourceKind = "file" | "link" | "demo";

export interface MediaSource {
  kind: SourceKind;
  /** URL de reproducción ya normalizada. */
  url: string;
  /** URL original tal como la escribió el usuario. */
  originalUrl?: string;
  provider: MediaProvider;
  fileName?: string;
  sizeMb?: number;
}

const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/i;
const HLS_EXT = /\.(m3u8)(\?|#|$)/i;

/* ------------------------------------------------------------- YouTube */

/** Extrae el id de un enlace de YouTube en cualquiera de sus formas. */
function youtubeId(url: URL): string | null {
  if (url.hostname.includes("youtu.be")) return url.pathname.slice(1) || null;
  // music.youtube.com usa las mismas rutas que el sitio principal.
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const embed = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]+)/);
  return embed ? embed[2] : null;
}

/** Una lista de reproducción de YouTube, que se incrusta distinto. */
function youtubePlaylistId(url: URL): string | null {
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  const list = url.searchParams.get("list");
  // Las listas «mix» (RD…) las genera YouTube por sesión y no se incrustan.
  return list && !list.startsWith("RD") ? list : null;
}

function vimeoId(url: URL): string | null {
  if (!url.hostname.includes("vimeo.com")) return null;
  const match = url.pathname.match(/\/(\d+)/);
  return match ? match[1] : null;
}

/* ------------------------------------------------------------- Spotify */

/** Lo que Spotify sabe incrustar. */
export const SPOTIFY_TYPES = ["track", "album", "playlist", "episode", "show", "artist"] as const;
export type SpotifyType = (typeof SPOTIFY_TYPES)[number];

export interface SpotifyRef {
  type: SpotifyType;
  id: string;
}

/**
 * Reconoce tanto el enlace (`https://open.spotify.com/track/…`, con o sin
 * prefijo de idioma como `/intl-es/`) como el URI que copia la app de
 * escritorio (`spotify:track:…`).
 */
export function parseSpotify(input: string): SpotifyRef | null {
  const trimmed = input.trim();

  const uri = trimmed.match(/^spotify:(\w+):([A-Za-z0-9]+)/);
  if (uri && (SPOTIFY_TYPES as readonly string[]).includes(uri[1])) {
    return { type: uri[1] as SpotifyType, id: uri[2] };
  }

  let url: URL;
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

  if (!type || !id || !(SPOTIFY_TYPES as readonly string[]).includes(type)) return null;
  return { type: type as SpotifyType, id: id.split("?")[0] };
}

/** La URL del reproductor oficial de Spotify. */
export function spotifyEmbedUrl(ref: SpotifyRef): string {
  return `https://open.spotify.com/embed/${ref.type}/${ref.id}`;
}

/** El enlace para abrirlo en la app de Spotify o en su web. */
export function spotifyOpenUrl(ref: SpotifyRef): string {
  return `https://open.spotify.com/${ref.type}/${ref.id}`;
}

/**
 * Alto del reproductor de Spotify. Una canción cabe en una tira; un álbum o una
 * lista necesitan sitio para mostrar las pistas.
 */
export function spotifyHeight(type: SpotifyType): number {
  return type === "track" || type === "episode" ? 152 : 352;
}

/* --------------------------------------------------------------- parseo */

/**
 * Analiza un enlace. Devuelve `null` si no es una URL válida.
 * No hace peticiones de red: quien decide de verdad si el contenido existe y
 * si se puede incrustar es el propio proveedor al cargar su reproductor.
 */
export function parseMediaUrl(input: string): MediaSource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // El URI de Spotify no es una URL http, así que se mira antes.
  const spotifyUri = parseSpotify(trimmed);
  if (spotifyUri && trimmed.startsWith("spotify:")) {
    return {
      kind: "link",
      provider: "spotify",
      url: spotifyEmbedUrl(spotifyUri),
      originalUrl: trimmed,
    };
  }

  let url: URL;
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
      url: spotifyEmbedUrl(spotify),
      originalUrl: trimmed,
    };
  }

  const yt = youtubeId(url);
  if (yt) {
    const list = youtubePlaylistId(url);
    return {
      kind: "link",
      provider: "youtube",
      // Si el enlace venía dentro de una lista, se conserva: quien lo pegó
      // quería compartir la serie entera, no solo el primer video.
      url: list
        ? `https://www.youtube.com/embed/${yt}?list=${encodeURIComponent(list)}`
        : `https://www.youtube.com/embed/${yt}`,
      originalUrl: trimmed,
    };
  }

  const ytList = youtubePlaylistId(url);
  if (ytList) {
    return {
      kind: "link",
      provider: "youtube",
      url: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(ytList)}`,
      originalUrl: trimmed,
    };
  }

  const vm = vimeoId(url);
  if (vm) {
    return {
      kind: "link",
      provider: "vimeo",
      url: `https://player.vimeo.com/video/${vm}`,
      originalUrl: trimmed,
    };
  }

  const href = url.href;
  if (HLS_EXT.test(url.pathname)) {
    return { kind: "link", provider: "hls", url: href, originalUrl: trimmed };
  }
  if (VIDEO_EXT.test(url.pathname)) {
    return { kind: "link", provider: "direct-video", url: href, originalUrl: trimmed };
  }
  if (AUDIO_EXT.test(url.pathname)) {
    return { kind: "link", provider: "direct-audio", url: href, originalUrl: trimmed };
  }

  return { kind: "link", provider: "unknown", url: href, originalUrl: trimmed };
}

/* ------------------------------------------------------------ etiquetas */

/** Etiqueta legible del proveedor, para mostrarla en la interfaz. */
export const PROVIDER_LABEL: Record<MediaProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  spotify: "Spotify",
  "direct-video": "Video directo",
  "direct-audio": "Audio directo",
  hls: "Streaming HLS",
  unknown: "Enlace externo",
};

/** Dónde se abre el contenido si la persona prefiere su app. */
export function openInProviderUrl(source: MediaSource): string | null {
  if (source.provider === "spotify") {
    const ref = parseSpotify(source.originalUrl ?? source.url);
    return ref ? spotifyOpenUrl(ref) : source.originalUrl ?? null;
  }
  if (source.provider === "youtube" || source.provider === "vimeo") {
    return source.originalUrl ?? null;
  }
  return null;
}

/** ¿Se reproduce con el reproductor del proveedor en vez de con `<video>`? */
export function isEmbed(provider: MediaProvider): boolean {
  return provider === "youtube" || provider === "vimeo" || provider === "spotify";
}

/** ¿Es audio? Decide si el reproductor global de la app puede tomarlo. */
export function isAudio(provider: MediaProvider): boolean {
  return provider === "direct-audio";
}

/**
 * ¿El contenido vive fuera de Heseria?
 *
 * Importa para dos cosas: no se puede descargar para escuchar sin conexión, y
 * hay que dar crédito al sitio de origen.
 */
export function isExternal(provider: MediaProvider): boolean {
  return provider === "youtube" || provider === "vimeo" || provider === "spotify";
}

/**
 * ¿El navegador puede reproducirlo tal cual?
 * HLS solo funciona nativamente en Safari/iOS; en Android hace falta hls.js,
 * que se añadirá junto con el streaming real.
 */
export function isPlayable(source: MediaSource): boolean {
  if (isEmbed(source.provider)) return true;
  if (source.provider === "direct-video" || source.provider === "direct-audio") return true;
  if (source.provider === "hls") return true;
  return source.kind === "file";
}

/** Fuente de demostración para el contenido del dataset, que no tiene archivos. */
export const DEMO_SOURCE: MediaSource = {
  kind: "demo",
  url: "",
  provider: "unknown",
};
