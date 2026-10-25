import { ExternalLink, Music } from "lucide-react";
import { useEffect, useState } from "react";
import { GenerativeCover } from "@/components/media/covers";
import {
  isAudio,
  isEmbed,
  openInProviderUrl,
  parseMediaUrl,
  parseSpotify,
  PROVIDER_LABEL,
  spotifyHeight,
  type MediaSource,
} from "@/lib/media-source";
import { openExternal } from "@/native";
import { fileService } from "@/services";
import { cn } from "@/lib/utils";

/**
 * HESERIA — Reproductor de una fuente real.
 *
 * El reproductor oficial (iframe) para YouTube, Vimeo y Spotify, y <video> o
 * <audio> nativos para enlaces directos y archivos propios. Nada se simula.
 */
export function MediaPlayer({
  source,
  title,
  seed,
  gradient,
  durationSec = 0,
  className,
}: {
  source: MediaSource;
  title: string;
  seed: string;
  gradient?: string;
  durationSec?: number;
  className?: string;
}) {
  const url = useResolvedUrl(source.url);

  // Sin archivo no se finge una reproducción: se dice que no hay nada.
  if (source.kind === "demo" || !source.url) {
    return (
      <div className={cn("grid aspect-video place-items-center rounded-2xl border border-dashed border-border p-6 text-center", className)}>
        <p className="text-sm text-muted-foreground">Este contenido todavía no tiene un archivo para reproducir.</p>
      </div>
    );
  }
  if (!url) {
    return (
      <div className={cn("grid aspect-video place-items-center rounded-2xl bg-muted", className)}>
        <span className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (isEmbed(source.provider)) {
    return <EmbedPlayer source={source} url={url} title={title} className={className} />;
  }

  if (isAudio(source.provider)) {
    return (
      <div className={cn("overflow-hidden rounded-2xl border border-border bg-surface", className)}>
        <GenerativeCover
          seed={seed}
          gradient={gradient}
          rounded="rounded-none"
          className="aspect-video w-full"
          icon={Music}
          label={title}
        />
        <div className="p-3">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={url} controls preload="metadata" className="w-full">
            Tu navegador no puede reproducir este audio.
          </audio>
        </div>
      </div>
    );
  }

  // Video directo, HLS (nativo en iOS/Safari) y archivos del dispositivo.
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-black", className)}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full"
      >
        Tu navegador no puede reproducir este video.
      </video>
    </div>
  );
}

/** Vista previa compacta usada en la hoja de ingesta. */
export function MediaPreview({ source, title }: { source: MediaSource; title: string }) {
  return (
    <MediaPlayer
      source={source}
      title={title}
      seed={source.url || title}
      gradient="from-indigo-500/70 to-slate-800/70"
    />
  );
}

/**
 * Reproductor para una ficha del catálogo.
 *
 * El proveedor se deduce del enlace: un sermón publicado como enlace de
 * YouTube va al reproductor de YouTube, no a un `<video>` que no lo sabría
 * abrir. Sin enlace, se dice que no hay archivo; nunca se simula.
 */
export function CatalogPlayer({
  videoUrl,
  audioUrl,
  seed,
  gradient,
  title,
  durationSec = 0,
  className,
}: {
  videoUrl?: string;
  audioUrl?: string;
  seed: string;
  gradient?: string;
  title: string;
  durationSec?: number;
  chapters?: { title: string; atSec: number }[];
  className?: string;
}) {
  const raw = videoUrl ?? audioUrl ?? "";
  const parsed = raw.startsWith("fs:")
    ? { kind: "file" as const, url: raw, provider: (audioUrl ? "direct-audio" : "direct-video") as MediaSource["provider"] }
    : parseMediaUrl(raw);
  return (
    <MediaPlayer
      source={parsed ?? { kind: "demo", url: "", provider: "unknown" }}
      title={title}
      seed={seed}
      gradient={gradient}
      durationSec={durationSec}
      className={className}
    />
  );
}

/**
 * La URL que se puede reproducir. Un archivo propio guardado en Firestore
 * (`fs:<id>`) se reúne y se convierte en una URL local; el resto pasa igual.
 */
function useResolvedUrl(raw: string): string {
  const [url, setUrl] = useState(raw.startsWith("fs:") ? "" : raw);
  useEffect(() => {
    if (!raw.startsWith("fs:")) {
      setUrl(raw);
      return;
    }
    let alive = true;
    let objectUrl = "";
    void fileService.blob(raw.slice(3)).then((blob) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => undefined);
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [raw]);
  return url;
}

/* ------------------------------------------------ reproductor del dueño */

/**
 * El reproductor oficial de YouTube, Vimeo o Spotify dentro de la app.
 *
 * Se incrusta su reproductor, no se copia el contenido: las reproducciones y
 * la publicidad siguen siendo suyas, y si el dueño desactiva la incrustación
 * el video no se ve, que es lo correcto. Debajo se dice de dónde viene y se
 * ofrece abrirlo en su app, porque quien publica merece el crédito y quien
 * escucha merece saber dónde está.
 */
function EmbedPlayer({
  source,
  url,
  title,
  className,
}: {
  source: MediaSource;
  url: string;
  title: string;
  className?: string;
}) {
  const spotify = source.provider === "spotify" ? parseSpotify(source.url) : null;
  const openUrl = openInProviderUrl(source);

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border", className)}>
      {spotify ? (
        <iframe
          src={url}
          title={title}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ height: spotifyHeight(spotify.type) }}
          className="w-full border-0"
        />
      ) : (
        <iframe
          src={url}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="aspect-video w-full border-0 bg-black"
        />
      )}

      <div className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
        {/* Se deja envolver: el aviso de Premium importa más que la simetría. */}
        <span className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
          Se reproduce en {PROVIDER_LABEL[source.provider]}
          {spotify && spotify.type === "track"
            ? " · la canción completa requiere Premium"
            : ""}
        </span>
        {openUrl && (
          <button
            type="button"
            onClick={() => void openExternal(openUrl)}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <ExternalLink className="size-3.5" /> Abrir
          </button>
        )}
      </div>
    </div>
  );
}
