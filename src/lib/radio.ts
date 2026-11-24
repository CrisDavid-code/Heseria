/**
 * HESERIA — Reproductor de radio en vivo (uno solo para toda la app).
 *
 * Es en vivo: no hay adelantar, retroceder ni duración. Si la señal se cae, reintenta solo
 * (2, 4, 8, 16 y 30 s) y después avisa «Sin señal». Temporizador de apagado y controles en
 * la pantalla de bloqueo (Media Session). Al sonar la radio se pausa la música, y viceversa.
 */
import { useSyncExternalStore } from "react";
import { playerStore } from "@/store";
import type { RadioStation } from "@/services";

export type RadioStatus = "detenida" | "conectando" | "en-vivo" | "reconectando" | "sin-senal";
interface RadioState {
  station: RadioStation | null;
  status: RadioStatus;
  sleepAt: number | null;
}

let state: RadioState = { station: null, status: "detenida", sleepAt: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<RadioState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

let audio: HTMLAudioElement | null = null;
let retries = 0;
let retryTimer: number | undefined;
let sleepTimer: number | undefined;
const BACKOFF = [2, 4, 8, 16, 30];

function connect() {
  if (!audio || !state.station) return;
  // Una URL nueva fuerza la conexión al directo (sin quedarse en lo que guardó el navegador).
  audio.src = state.station.streamUrl;
  audio.play().catch(() => undefined);
}

function onTrouble() {
  if (!state.station || state.status === "detenida") return;
  window.clearTimeout(retryTimer);
  if (retries >= BACKOFF.length) return set({ status: "sin-senal" });
  set({ status: "reconectando" });
  retryTimer = window.setTimeout(connect, BACKOFF[retries++] * 1000);
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "none";
  audio.addEventListener("playing", () => {
    retries = 0;
    set({ status: "en-vivo" });
  });
  audio.addEventListener("error", onTrouble);
  audio.addEventListener("stalled", onTrouble);
  audio.addEventListener("ended", onTrouble); // un directo no «termina»: se cayó
  // Si la música empieza, la radio se calla.
  playerStore.subscribe(() => {
    if (playerStore.get().playing && state.status !== "detenida") stopRadio();
  });
  return audio;
}

export function playRadio(station: RadioStation) {
  const a = ensureAudio();
  playerStore.set({ playing: false });
  window.clearTimeout(retryTimer);
  retries = 0;
  set({ station, status: "conectando" });
  remember(station.id);
  connect();
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: "En vivo · Heseria",
      artwork: station.logo ? [{ src: station.logo, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("pause", () => stopRadio());
    navigator.mediaSession.setActionHandler("stop", () => stopRadio());
    navigator.mediaSession.setActionHandler("play", () => state.station && playRadio(state.station));
  }
  return a;
}

export function stopRadio() {
  window.clearTimeout(retryTimer);
  window.clearTimeout(sleepTimer);
  audio?.pause();
  if (audio) audio.removeAttribute("src");
  set({ status: "detenida", sleepAt: null });
}

/** Apaga la radio en `minutes` (null = quitar el temporizador). */
export function setSleep(minutes: number | null) {
  window.clearTimeout(sleepTimer);
  if (!minutes) return set({ sleepAt: null });
  sleepTimer = window.setTimeout(stopRadio, minutes * 60_000);
  set({ sleepAt: Date.now() + minutes * 60_000 });
}

export function useRadio() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => state,
  );
}

/* ------------------------------------------------ favoritos e historial (en el teléfono) */

const read = (k: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "[]");
  } catch {
    return [];
  }
};
const write = (k: string, v: string[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento */
  }
};
export const radioFavorites = () => read("heseria.radioFav");
export function toggleRadioFavorite(id: string) {
  const fav = radioFavorites();
  write("heseria.radioFav", fav.includes(id) ? fav.filter((x) => x !== id) : [id, ...fav]);
  set({}); // nuevo estado: las pantallas vuelven a leer los favoritos
}
export const radioHistory = () => read("heseria.radioHistory");
function remember(id: string) {
  write("heseria.radioHistory", [id, ...radioHistory().filter((x) => x !== id)].slice(0, 10));
}
