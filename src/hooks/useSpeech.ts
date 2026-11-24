/**
 * HESERIA — Lectura en voz alta, fragmento por fragmento (versículos, párrafos).
 *
 * Web: el motor de voz del navegador. APK/iOS: el plugin nativo (el WebView de Android no trae
 * motor de voz). Se habla un fragmento a la vez, así se sabe con certeza cuál está sonando, se
 * puede resaltar, adelantar o retroceder por fragmento y reanudar donde se quedó. No se simula
 * seguimiento palabra por palabra: los motores no lo dan de forma fiable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

type State = "idle" | "playing" | "paused";
const RATES = [0.75, 1, 1.25, 1.5] as const;

async function speakOne(text: string, rate: number): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
    await TextToSpeech.speak({ text, lang: "es-ES", rate, category: "playback" });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = rate;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === "interrupted" || e.error === "canceled" ? resolve() : reject(new Error(e.error)));
    speechSynthesis.speak(u);
  });
}

async function stopAll() {
  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
    await TextToSpeech.stop().catch(() => undefined);
  } else if ("speechSynthesis" in window) speechSynthesis.cancel();
}

export const speechSupported = () => Capacitor.isNativePlatform() || "speechSynthesis" in window;

export function useSpeech(parts: string[]) {
  const [state, setState] = useState<State>("idle");
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0); // cada reproducción tiene su número: una anterior que termina no sigue leyendo

  const playFrom = useCallback(
    async (start: number) => {
      await stopAll();
      const id = ++run.current;
      setError(null);
      setState("playing");
      for (let i = start; i < parts.length; i++) {
        if (run.current !== id) return;
        setIndex(i);
        if (!parts[i]?.trim()) continue;
        try {
          await speakOne(parts[i], rate);
        } catch (e) {
          if (run.current !== id) return;
          setError(e instanceof Error && e.message ? `No se pudo leer en voz alta (${e.message}).` : "No se pudo leer en voz alta.");
          setState("idle");
          return;
        }
      }
      if (run.current === id) {
        setState("idle");
        setIndex(0);
      }
    },
    [parts, rate],
  );

  const pause = useCallback(() => {
    run.current++;
    void stopAll();
    setState("paused");
  }, []);
  const stop = useCallback(() => {
    run.current++;
    void stopAll();
    setState("idle");
    setIndex(0);
  }, []);

  // Al salir de la pantalla (o cambiar de capítulo), silencio.
  useEffect(() => () => {
    run.current++;
    void stopAll();
  }, [parts]);

  return {
    state, index, rate, error,
    play: () => void playFrom(state === "paused" ? index : 0),
    pause, stop,
    next: () => void playFrom(Math.min(parts.length - 1, index + 1)),
    prev: () => void playFrom(Math.max(0, index - 1)),
    playAt: (i: number) => void playFrom(i),
    cycleRate: () => setRate((r) => RATES[(RATES.indexOf(r as (typeof RATES)[number]) + 1) % RATES.length]),
  };
}
