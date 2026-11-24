import {
  ChevronDown, Heart, ListMusic, Moon, NotebookPen, Pause, Play, Repeat, Repeat1, Share2, Shuffle,
  SkipBack, SkipForward, Volume1, Volume2, VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GenerativeCover } from "@/components/media/covers";
import { Slider } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { journalService } from "@/services";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { haptic, share, shareUrl } from "@/native";
import { playerStore, playerTick, savePosition, savedPosition, useLibrary, usePlayer } from "@/store";
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

  // Pantalla de bloqueo y auriculares: reproducir, pausar, anterior, siguiente, ±15 s.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !player.track) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({ title: player.track.title, artist: player.track.subtitle ?? "Heseria", album: "Heseria" });
    const h: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => playerStore.set({ playing: true })],
      ["pause", () => playerStore.set({ playing: false })],
      ["nexttrack", () => player.next()],
      ["previoustrack", () => player.prev()],
      ["seekforward", () => player.seek(playerStore.get().positionSec + 15)],
      ["seekbackward", () => player.seek(playerStore.get().positionSec - 15)],
    ];
    for (const [a, fn] of h) { try { ms.setActionHandler(a, fn); } catch { /* acción no disponible */ } }
  }, [player.track?.id]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.playbackRate = player.rate;
  }, [player.rate, src]);

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
      onTimeUpdate={(e) => {
        const sec = Math.floor(e.currentTarget.currentTime);
        playerStore.set({ positionSec: sec });
        if (sec % 5 === 0 && player.track) savePosition(player.track.id, sec);
      }}
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        el.playbackRate = playerStore.get().rate;
        const duration = Math.floor(el.duration);
        if (!Number.isFinite(duration)) return;
        // Audios largos: continúa donde se quedó (si no estaba casi al final).
        const resume = player.track ? savedPosition(player.track.id) : 0;
        if (duration > 300 && resume > 10 && resume < duration - 20) {
          el.currentTime = resume;
          playerStore.set({ positionSec: resume });
          toast(`Continuando desde ${formatDuration(resume)}`);
        }
        const state = playerStore.get();
        playerStore.set({
          queue: state.queue.map((t, i) =>
            i === state.index ? { ...t, durationSec: duration } : t,
          ),
        });
      }}
      onEnded={() => {
        if (player.track) savePosition(player.track.id, null);
        // Siguiente de la cola (siguiente episodio) si lo hay.
        const s = playerStore.get();
        if (s.repeat === "one") return playerStore.set({ positionSec: 0, playing: true });
        if (s.index + 1 < s.queue.length) return playerStore.set({ index: s.index + 1, positionSec: 0, playing: true });
        playerStore.set({ playing: false, positionSec: 0 });
      }}
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
  const library = useLibrary();
  const [noteOpen, setNoteOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteAt, setNoteAt] = useState(0);
  const [busy, setBusy] = useState(false);
  void library;
  const track = player.track;

  async function saveNote() {
    if (!track || !note.trim()) return;
    setBusy(true);
    try {
      await journalService.save({
        kind: "espiritual",
        title: `${track.title} · ${formatDuration(noteAt)}`.slice(0, 200),
        body: note.trim(),
        refs: [],
        tags: ["podcast"],
      });
      toast.success("Nota guardada en Mi diario");
      setNote("");
      setNoteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la nota.");
    } finally {
      setBusy(false);
    }
  }
  if (!track) return null;

  const liked = player.liked.includes(track.id);

  async function onShare() {
    const how = await share({
      title: track!.title,
      text: `Escucha “${track!.title}” en Heseria`,
      url: shareUrl(`/podcasts`),
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
              onClick={() => { setNoteAt(player.positionSec); setNoteOpen(true); }}
              aria-label="Agregar nota"
              className="tap-target grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
            >
              <NotebookPen className="size-5" />
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
              <Heart className={cn("size-6", liked && "fill-rose-500 text-rose-500")} />
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

          {/* Velocidad y temporizador (sirven sobre todo para podcasts y predicaciones). */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={player.cycleRate} aria-label={`Velocidad ${player.rate}x`} className="rounded-full border border-border px-3 py-1.5 font-semibold tabular-nums">
              {player.rate}x
            </button>
            <Moon className="ml-1 size-3.5 text-muted-foreground" aria-hidden />
            {[15, 30, 60].map((m) => (
              <button key={m} type="button" onClick={() => player.setSleep(m)} className="rounded-full border border-border px-2.5 py-1.5">
                {m} min
              </button>
            ))}
            {player.sleepAt && (
              <button type="button" onClick={() => player.setSleep(null)} className="rounded-full border border-primary px-2.5 py-1.5 text-primary">
                Se pausa en {Math.max(1, Math.round((player.sleepAt - Date.now()) / 60_000))} min · quitar
              </button>
            )}
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
              onClick={() => setQueueOpen(true)}
              className="flex flex-col items-center gap-1.5 text-muted-foreground"
            >
              <ListMusic className="size-5" />
              <span className="text-[0.68rem]">Episodios ({player.queue.length})</span>
            </button>
            <button
              type="button"
              onClick={() => { setNoteAt(player.positionSec); setNoteOpen(true); }}
              className="flex flex-col items-center gap-1.5 text-muted-foreground"
            >
              <NotebookPen className="size-5" />
              <span className="text-[0.68rem]">Nota</span>
            </button>
          </div>

          {/* Nota durante la reproducción: queda en Mi diario con el minuto. El audio sigue. */}
          <BottomSheet open={noteOpen} onOpenChange={setNoteOpen}>
            <BottomSheetContent title="Nota" description={`${track.title} · minuto ${formatDuration(noteAt)}`}>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="¿Qué te habló Dios en este mensaje?" className="min-h-28" autoFocus maxLength={10000} />
              <Button full className="mt-3" loading={busy} disabled={!note.trim()} onClick={() => void saveNote()}>Guardar en Mi diario</Button>
            </BottomSheetContent>
          </BottomSheet>

          {/* Lista de reproducción: tocar un episodio lo pone a sonar. */}
          <BottomSheet open={queueOpen} onOpenChange={setQueueOpen}>
            <BottomSheetContent title="Lista de reproducción">
              <ol className="space-y-1">
                {player.queue.map((t, i) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => { playerStore.set({ index: i, positionSec: 0, playing: true }); setQueueOpen(false); }}
                      className={cn("w-full rounded-xl px-3 py-2 text-left text-sm", i === player.index ? "bg-primary/12 font-medium text-primary" : "active:bg-secondary")}
                    >
                      <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>{t.title}
                    </button>
                  </li>
                ))}
              </ol>
            </BottomSheetContent>
          </BottomSheet>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
