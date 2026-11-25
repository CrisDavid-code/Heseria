/**
 * Voces neuronales naturales (Piper) que corren en el propio teléfono: no son robóticas, no
 * necesitan servidor ni cuenta y, una vez descargadas, funcionan sin conexión. Licencias
 * abiertas (ver cada voz). El modelo se descarga una sola vez (~60 MB) y queda guardado.
 */
export interface NeuralVoice { id: string; name: string; mb: number; license: string }

export const NEURAL_VOICES: NeuralVoice[] = [
  { id: "es_MX-claude-high", name: "Claude · natural, México (alta calidad)", mb: 63, license: "Apache-2.0" },
  { id: "es_MX-ald-medium", name: "Ald · natural, México", mb: 63, license: "Unlicense" },
  { id: "es_ES-davefx-medium", name: "Davefx · natural, España", mb: 63, license: "CC0" },
];

type Vits = typeof import("@diffusionstudio/vits-web");
let lib: Promise<Vits> | null = null;
const load = () => (lib ??= import("@diffusionstudio/vits-web"));

/** El navegador puede guardar el modelo y ejecutarlo. */
export const neuralSupported = () =>
  typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && Boolean(navigator.storage && "getDirectory" in navigator.storage);

export async function installedVoices(): Promise<string[]> {
  if (!neuralSupported()) return [];
  try {
    return (await (await load()).stored()) as string[];
  } catch {
    return [];
  }
}

export async function installVoice(id: string, onProgress?: (pct: number) => void) {
  const v = await load();
  await v.download(id as Parameters<Vits["download"]>[0], (p) => onProgress?.(p.total ? Math.round((p.loaded / p.total) * 100) : 0));
}

export async function removeVoice(id: string) {
  await (await load()).remove(id as Parameters<Vits["remove"]>[0]);
}

// Se sintetiza el siguiente fragmento mientras suena el actual: lectura continua.
const cache = new Map<string, Promise<Blob>>();
export function prepare(text: string, id: string): Promise<Blob> {
  const key = `${id}|${text}`;
  let p = cache.get(key);
  if (!p) {
    p = load().then((v) => v.predict({ text, voiceId: id as Parameters<Vits["predict"]>[0]["voiceId"] }));
    cache.set(key, p);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
    p.catch(() => cache.delete(key));
  }
  return p;
}

let current: { el: HTMLAudioElement; done: () => void } | null = null;

export async function speakNeural(text: string, id: string, rate: number): Promise<void> {
  const blob = await prepare(text, id);
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const el = new Audio(url);
      el.playbackRate = rate;
      current = { el, done: resolve };
      el.onended = () => resolve();
      el.onerror = () => reject(new Error("audio"));
      el.play().catch(reject);
    });
  } finally {
    current = null;
    URL.revokeObjectURL(url);
  }
}

export function stopNeural() {
  if (!current) return;
  current.el.pause();
  current.done();
  current = null;
}
