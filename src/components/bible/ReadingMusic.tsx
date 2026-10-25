/**
 * HESERIA — Música instrumental mientras se lee (Biblia y devocionales).
 *
 * Suena sola al abrir la lectura, salvo que la persona la desactive o ya esté escuchando
 * algo en el reproductor. Se puede pausar, cambiar de pista o apagar para siempre (se
 * vuelve a encender en Configuración → Lectura). Pistas originales de public/musica.
 */
import { Music2, Pause, Play, SkipForward, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { playerStore, preferencesStore, usePreferences } from "@/store";

export interface Instrumental {
  id: string;
  title: string;
  verse: string;
  durationSec: number;
  src: string;
}

let listPromise: Promise<Instrumental[]> | null = null;
export function instrumentals(): Promise<Instrumental[]> {
  listPromise ??= fetch("/musica/index.json").then((r) => (r.ok ? r.json() : []));
  return listPromise;
}

export function ReadingMusic() {
  const { readingMusic } = usePreferences();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [tracks, setTracks] = useState<Instrumental[]>([]);
  const [index, setIndex] = useState(() => new Date().getDate());
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!readingMusic) return;
    let cancelled = false;
    void instrumentals().then((list) => !cancelled && setTracks(list));
    return () => {
      cancelled = true;
    };
  }, [readingMusic]);

  const track = tracks.length ? tracks[index % tracks.length] : null;

  // Arranca al abrir la lectura y cambia de pista sin cortar el gesto de la persona.
  useEffect(() => {
    if (!track || !readingMusic) return;
    const el = (audio.current ??= new Audio());
    el.loop = true;
    el.volume = 0.35;
    el.src = track.src;
    // Si ya suena una canción en el reproductor, no se encima.
    if (playerStore.get().playing) return;
    el.play().then(() => setPlaying(true), () => setPlaying(false)); // sin gesto, el navegador puede negarse
  }, [track, readingMusic]);

  // Al salir de la lectura, silencio.
  useEffect(() => () => audio.current?.pause(), []);

  if (!readingMusic || !track) return null;

  const toggle = () => {
    const el = audio.current!;
    if (el.paused) {
      playerStore.set({ playing: false });
      void el.play().then(() => setPlaying(true));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="mb-4 flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-sm">
      <Music2 className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {playing ? "Sonando" : "Música para leer"}: <span className="text-foreground">{track.title}</span>
      </span>
      <button type="button" onClick={toggle} aria-label={playing ? "Pausar música" : "Reproducir música"}
        className="tap-target grid place-items-center rounded-full active:bg-secondary">
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <button type="button" onClick={() => setIndex((i) => i + 1)} aria-label="Otra pista"
        className="tap-target grid place-items-center rounded-full active:bg-secondary">
        <SkipForward className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          audio.current?.pause();
          preferencesStore.set({ readingMusic: false });
        }}
        aria-label="Desactivar música al leer"
        className="tap-target grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
