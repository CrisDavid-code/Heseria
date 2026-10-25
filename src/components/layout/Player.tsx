import {
  ChevronDown, Heart, ListPlus, ListMusic, Pause, Play, Repeat, Repeat1, Share2, Shuffle,
  SkipBack, SkipForward, Volume1, Volume2, VolumeX,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { GenerativeCover } from "@/components/media/covers";
import { Slider } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { haptic, share, shareUrl } from "@/native";
import { playerStore, playerTick, usePlayer } from "@/store";
import { cn, formatDuration } from "@/lib/utils";

/** Single global interval that advances playback. Mounted once by AppShell. */
export function usePlayerClock() {
  useEffect(() => {
    const id = window.setInterval(playerTick, 1000);
    return () => window.clearInterval(id);
  }, []);
}

/* ---------------------------------------------------------- audio engine */

/**
 * Reproduce de verdad las pistas que traen `src` (contenido añadido por enlace
 * o archivo). Las pistas del catálogo de demostración no tienen audio, y para
 * ellas sigue funcionando el reloj simulado.
 */
function AudioEngine() {
  const player = usePlayer();
  const ref = useRef<HTMLAudioElement>(null);
  const src = player.track?.src;

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;
    if (player.playing) {
      void el.play().catch(() => {
        // El navegador puede exigir un gesto del usuario; el botón ya lo es.
      });
    } else {
      el.pause();
    }
  }, [player.playing, src]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.volume = player.volume;
  }, [player.volume]);

  // Sincroniza el arrastre de la barra con el elemento real.
  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;
    if (Math.abs(el.currentTime - player.positionSec) > 1.5) {
      el.currentTime = player.positionSec;
    }
  }, [player.positionSec, src]);

  if (!src) return null;

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      ref={ref}
      src={src}
      preload="metadata"
      className="sr-only"
      onTimeUpdate={(e) => playerStore.set({ positionSec: Math.floor(e.currentTarget.currentTime) })}
      onLoadedMetadata={(e) => {
        const duration = Math.floor(e.currentTarget.duration);
        if (!Number.isFinite(duration)) return;
        const state = playerStore.get();
        playerStore.set({
          queue: state.queue.map((t, i) =>
            i === state.index ? { ...t, durationSec: duration } : t,
          ),
        });
      }}
      onEnded={() => playerStore.set({ playing: false, positionSec: 0 })}
    />
  );
}

/* ------------------------------------------------------------ mini player */

/**
 * Sits directly above the tab bar (spec §9). One tap opens the full player;
 * the only inline control is play/pause, so the touch targets stay generous.
 */
export function MiniPlayer() {
  const player = usePlayer();
  const track = player.track;
  if (!track) return null;

  const progress = (player.positionSec / track.durationSec) * 100;

  return (
    <>
      <AudioEngine />
      <div className="shrink-0 border-t border-border bg-surface/95 backdrop-blur-xl">
        <div className="h-0.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              haptic("light");
              player.setExpanded(true);
            }}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={`Abrir reproductor: ${track.title}`}
          >
            <GenerativeCover
              seed={track.id}
              gradient={track.color}
              className="size-11 shrink-0"
              rounded="rounded-lg"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{track.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{track.subtitle}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptic("light");
              player.toggle();
            }}
            aria-label={player.playing ? "Pausar" : "Reproducir"}
            className="tap-target grid shrink-0 place-items-center rounded-full text-foreground"
          >
            {player.playing ? (
              <Pause className="size-6 fill-current" />
            ) : (
              <Play className="size-6 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={player.next}
            aria-label="Siguiente"
            className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground"
          >
            <SkipForward className="size-5 fill-current" />
          </button>
        </div>
      </div>
      <FullPlayer />
    </>
  );
}

/* ------------------------------------------------------------ full player */

function FullPlayer() {
  const player = usePlayer();
  const track = player.track;
  if (!track) return null;

  const liked = player.liked.includes(track.id);

  async function onShare() {
    const how = await share({
      title: track!.title,
      text: `Escucha “${track!.title}” en Heseria`,
      url: shareUrl(`/music`),
    });
    if (how === "clipboard") toast.success("Enlace copiado");
    else if (how === "failed") toast.error("No pudimos compartir");
  }

  return (
    <BottomSheet open={player.expanded} onOpenChange={player.setExpanded}>
      <BottomSheetContent
        title={track.title}
        fullScreen
        showHandle={false}
        className="bg-background [&>div:first-child]:hidden"
      >
        <div className="mx-auto flex h-full max-w-md flex-col">
          <div className="flex items-center justify-between pb-6">
            <button
              type="button"
              onClick={() => player.setExpanded(false)}
              aria-label="Minimizar reproductor"
              className="tap-target grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
            >
              <ChevronDown className="size-6" />
            </button>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Reproduciendo
            </p>
            <button
              type="button"
              onClick={() => toast.success("Añadida a una playlist")}
              aria-label="Añadir a playlist"
              className="tap-target grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
            >
              <ListPlus className="size-5" />
            </button>
          </div>

          <GenerativeCover
            seed={track.id}
            gradient={track.color}
            rounded="rounded-3xl"
            className="aspect-square w-full shadow-[var(--shadow-lift)]"
            label={track.title}
          />

          <div className="mt-7 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-semibold">{track.title}</h2>
              <p className="truncate text-sm text-muted-foreground">{track.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                haptic(liked ? "light" : "success");
                player.toggleLike(track.id);
              }}
              aria-label="Me gusta"
              aria-pressed={liked}
              className={cn(
                "tap-target grid shrink-0 place-items-center rounded-full transition-colors",
                liked ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Heart className={cn("size-6", liked && "fill-current")} />
            </button>
          </div>

          <div className="mt-6">
            <Slider
              value={[player.positionSec]}
              max={track.durationSec}
              step={1}
              onValueChange={([v]) => player.seek(v)}
              aria-label="Posición de reproducción"
            />
            <div className="mt-2 flex justify-between text-[0.7rem] tabular-nums text-muted-foreground">
              <span>{formatDuration(player.positionSec)}</span>
              <span>{formatDuration(track.durationSec)}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={player.toggleShuffle}
              aria-label="Reproducción aleatoria"
              aria-pressed={player.shuffle}
              className={cn(
                "tap-target grid place-items-center rounded-full transition-colors",
                player.shuffle ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Shuffle className="size-5" />
            </button>
            <button
              type="button"
              onClick={player.prev}
              aria-label="Anterior"
              className="tap-target grid place-items-center rounded-full text-foreground"
            >
              <SkipBack className="size-7 fill-current" />
            </button>
            <button
              type="button"
              onClick={() => {
                haptic("medium");
                player.toggle();
              }}
              aria-label={player.playing ? "Pausar" : "Reproducir"}
              className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
            >
              {player.playing ? (
                <Pause className="size-7 fill-current" />
              ) : (
                <Play className="size-7 fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={player.next}
              aria-label="Siguiente"
              className="tap-target grid place-items-center rounded-full text-foreground"
            >
              <SkipForward className="size-7 fill-current" />
            </button>
            <button
              type="button"
              onClick={player.cycleRepeat}
              aria-label={`Repetir: ${player.repeat}`}
              aria-pressed={player.repeat !== "off"}
              className={cn(
                "tap-target grid place-items-center rounded-full transition-colors",
                player.repeat !== "off" ? "text-primary" : "text-muted-foreground",
              )}
            >
              {player.repeat === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
            </button>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => player.setVolume(player.volume > 0 ? 0 : 0.8)}
              aria-label={player.volume > 0 ? "Silenciar" : "Activar sonido"}
              className="shrink-0 text-muted-foreground"
            >
              {player.volume === 0 ? (
                <VolumeX className="size-4" />
              ) : player.volume < 0.5 ? (
                <Volume1 className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>
            <Slider
              value={[player.volume * 100]}
              max={100}
              step={1}
              onValueChange={([v]) => player.setVolume(v / 100)}
              aria-label="Volumen"
            />
          </div>

          <div className="mt-auto flex items-center justify-around pt-6">
            <button
              type="button"
              onClick={onShare}
              className="flex flex-col items-center gap-1.5 text-muted-foreground"
            >
              <Share2 className="size-5" />
              <span className="text-[0.68rem]">Compartir</span>
            </button>
            <button
              type="button"
              onClick={() => toast.info(`${player.queue.length} pistas en la cola`)}
              className="flex flex-col items-center gap-1.5 text-muted-foreground"
            >
              <ListMusic className="size-5" />
              <span className="text-[0.68rem]">Cola</span>
            </button>
            <button
              type="button"
              onClick={() => toast.success("Añadida a una playlist")}
              className="flex flex-col items-center gap-1.5 text-muted-foreground"
            >
              <ListPlus className="size-5" />
              <span className="text-[0.68rem]">Playlist</span>
            </button>
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
