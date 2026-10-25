/**
 * HESERIA — Contenido añadido desde la aplicación.
 *
 * Lo que artistas, creadores, iglesias y administración publican, ya sea
 * subiendo un archivo o pegando un enlace. Vive en el servidor: se publica una
 * vez y lo ve **todo el mundo con la app instalada**, sin actualizar nada,
 * porque el contenido viaja como dato y no como código.
 */
import { useCallback, useEffect, useState } from "react";
import type { MediaSource } from "@/lib/media-source";
import type { ID } from "@/types";
import { contentService } from "@/services";

export type MediaKind = "song" | "album" | "movie" | "series" | "video" | "sermon" | "podcast";

export type ContentStatus = "borrador" | "procesando" | "publicado" | "error";

export interface ContentItem {
  id: ID;
  kind: MediaKind;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  durationSec: number;
  source: MediaSource;
  color: string;
  status: ContentStatus;
  createdAt: string;
  ownerId: ID;
  /** Cuántas personas distintas lo han visto. Lo calcula el servidor. */
  views?: number;
  /** ¿Lo ha visto quien mira ahora? */
  seen?: boolean;
}

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  song: "Canción",
  album: "Álbum",
  movie: "Película",
  series: "Serie",
  video: "Video",
  sermon: "Sermón",
  podcast: "Podcast",
};

/** A qué ruta de detalle lleva cada tipo dentro de la app. */
export const MEDIA_KIND_HREF: Record<MediaKind, string> = {
  song: "/music",
  album: "/music",
  movie: "/movies",
  series: "/series",
  video: "/videos",
  sermon: "/sermons",
  podcast: "/podcasts",
};

/**
 * Un contador que sube cada vez que alguien publica, edita o borra, para que
 * las listas abiertas en otras pantallas se refresquen solas.
 */
let version = 0;
const listeners = new Set<() => void>();

export function contentChanged(): void {
  version++;
  listeners.forEach((l) => l());
}

/** Lista reactiva del contenido publicado, opcionalmente filtrada por tipo. */
export function useContent(kind?: MediaKind): {
  items: ContentItem[];
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
} {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [tick, setTick] = useState(version);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const listener = () => setTick(version);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    contentService
      .list(kind)
      .then((data) => {
        if (alive) {
          setItems(data);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e : new Error("Error inesperado"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [kind, tick]);

  return { items, loading, error, reload };
}
