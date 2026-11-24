/** Controles de lectura en voz alta (useSpeech): reproducir/pausar, anterior, siguiente, detener y velocidad. */
import { Pause, Play, SkipBack, SkipForward, Square, Volume2 } from "lucide-react";
import { speechSupported, type useSpeech } from "@/hooks/useSpeech";

export function SpeechBar({ speech, label }: { speech: ReturnType<typeof useSpeech>; label: string }) {
  if (!speechSupported()) return null;
  const active = speech.state !== "idle";
  const btn = "tap-target grid place-items-center rounded-full active:bg-secondary disabled:opacity-40";
  return (
    <div className="mb-4" role="group" aria-label="Lectura en voz alta">
      <div className="flex items-center gap-1 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-sm">
        <Volume2 className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {speech.state === "playing" ? "Leyendo en voz alta…" : speech.state === "paused" ? "En pausa" : label}
        </span>
        {active && (
          <button type="button" onClick={speech.prev} aria-label="Anterior" className={btn}>
            <SkipBack className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={speech.state === "playing" ? speech.pause : speech.play}
          aria-label={speech.state === "playing" ? "Pausar lectura" : "Leer en voz alta"}
          className={`${btn} text-primary`}
        >
          {speech.state === "playing" ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        {active && (
          <>
            <button type="button" onClick={speech.next} aria-label="Siguiente" className={btn}>
              <SkipForward className="size-4" />
            </button>
            <button type="button" onClick={speech.stop} aria-label="Detener lectura" className={btn}>
              <Square className="size-3.5" />
            </button>
          </>
        )}
        <button type="button" onClick={speech.cycleRate} aria-label={`Velocidad ${speech.rate}x`} className="min-h-9 rounded-full px-2 text-xs font-semibold tabular-nums">
          {speech.rate}x
        </button>
      </div>
      {speech.error && <p className="mt-1.5 px-3 text-xs text-destructive" role="alert">{speech.error}</p>}
    </div>
  );
}
