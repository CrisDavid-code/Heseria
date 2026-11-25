/**
 * Voces de lectura. Como ReadEra, Heseria usa el motor de voz del teléfono; la diferencia la
 * hace elegir la voz: las neuronales («Natural», «Online», Google en red, «Enhanced/Premium» en
 * iPhone) suenan humanas, las básicas suenan robóticas. Se elige la mejor en español y la
 * persona puede cambiarla en Configuración → Lectura en voz alta.
 */
import { Capacitor } from "@capacitor/core";

export interface Voice { id: string; name: string; lang: string; local: boolean; index: number; quality: number }

const KEY = "heseria.voice";

/** Cuanto más alto, más natural (heurística por nombre, sin garantías del sistema). */
export function quality(name: string, lang: string, local: boolean): number {
  const n = name.toLowerCase();
  let q = 0;
  if (/natural|neural|wavenet|online/.test(n)) q += 50; // Edge/Windows y voces neuronales
  if (/premium|enhanced|mejorad/.test(n)) q += 40; // iPhone
  if (/network|-x-.*-network/.test(n) || !local) q += 30; // Google en red (Android)
  if (/google/.test(n)) q += 20; // Chrome
  if (/compact|espeak|pico/.test(n)) q -= 40; // motores básicos
  if (/^es-(us|mx|419)/i.test(lang)) q += 5; // acento latinoamericano
  return q;
}

export async function listVoices(): Promise<Voice[]> {
  let raw: { name: string; lang: string; localService: boolean; voiceURI?: string }[] = [];
  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
    raw = (await TextToSpeech.getSupportedVoices()).voices;
  } else if ("speechSynthesis" in window) {
    raw = speechSynthesis.getVoices();
    if (!raw.length) {
      // Chrome carga las voces de forma diferida.
      await new Promise<void>((r) => { speechSynthesis.onvoiceschanged = () => r(); setTimeout(r, 1500); });
      raw = speechSynthesis.getVoices();
    }
  }
  return raw
    .map((v, index) => ({ id: v.voiceURI || v.name, name: v.name, lang: v.lang, local: v.localService, index, quality: quality(v.name, v.lang, v.localService) }))
    .filter((v) => /^es/i.test(v.lang))
    .sort((a, b) => b.quality - a.quality || a.name.localeCompare(b.name));
}

export function chosenVoiceId(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function chooseVoice(id: string | null) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
  cached = null;
}

/** Voces neuronales de Heseria ya descargadas en este teléfono (las más naturales). */
export async function neuralInstalled(): Promise<Voice[]> {
  const { installedVoices, NEURAL_VOICES } = await import("@/lib/neural-voice");
  const have = await installedVoices();
  return NEURAL_VOICES.filter((n) => have.includes(n.id)).map((n, index) => ({
    id: `neural:${n.id}`, name: n.name, lang: n.id.slice(0, 5).replace("_", "-"), local: true, index: -1 - index, quality: 200,
  }));
}

let cached: Promise<Voice | null> | null = null;
/** La voz elegida o, si no eligió, la más natural disponible (neuronal descargada primero). */
export function currentVoice(): Promise<Voice | null> {
  cached ??= Promise.all([neuralInstalled(), listVoices()])
    .then(([n, vs]) => [...n, ...vs])
    .then((vs) => vs.find((v) => v.id === chosenVoiceId()) ?? vs[0] ?? null)
    .catch(() => null);
  return cached;
}

/** Nombre legible: «Google español de Estados Unidos (red)». */
export function voiceLabel(v: Voice): string {
  const extra = !v.local ? " · alta calidad (red)" : "";
  return `${v.name.replace(/^Microsoft\s+/i, "")} (${v.lang})${extra}`;
}

/**
 * Lo que se dice en voz alta: sin asteriscos ni marcas de notas (*, †, ¶, [a]…), que no son
 * parte del texto. Se conservan ¡ ¿ y la puntuación, que dan las pausas y la entonación.
 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[[a-z0-9]{1,3}\]/gi, "") // llamadas de nota: [a], [12]
    .replace(/[*†‡¶§#_~|<>{}\[\]\\/^]+/g, " ")
    .replace(/\s+([,.;:!?»)])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
