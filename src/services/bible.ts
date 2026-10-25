/**
 * HESERIA — La Biblia, dentro de la app.
 *
 * Ocho traducciones empaquetadas en el APK (`public/biblia`):
 *
 *   · RVR1960 (la principal), NTV, LBLA, DHH y TLA — español, con derechos de
 *     autor (`copyright` en versions.json). Salen de `biblias/*.xmm` con
 *     `scripts/build-bible-xmm.mjs`.
 *   · Reina-Valera 1909, King James Version y Bíblia Portuguesa Mundial —
 *     dominio público, de eBible.org con `scripts/build-bible.mjs`.
 *
 * Al ir dentro de la app se leen sin conexión y sin gastar una sola lectura
 * de Firestore. Las marcas de cada persona sí van a la nube, en su cuenta.
 */
import type { BibleBook, BibleChapter, BibleVersion } from "@/types";
import { dailyVerse } from "@/data/daily-verses";

export const DEFAULT_VERSION = "rvr1960";
export const VERSION_IDS = ["rvr1960", "ntv", "lbla", "dhh", "tla", "rv1909", "kjv", "bpm"];

/** Lo que cuesta leer un libro una vez: se guarda para no repetir la descarga. */
const cache = new Map<string, Promise<Record<string, string[]>>>();

const base = () => `${import.meta.env.BASE_URL ?? "/"}biblia`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}/${path}`);
  if (!res.ok) throw new Error("No se pudo abrir ese pasaje.");
  return res.json() as Promise<T>;
}

let booksPromise: Promise<BibleBook[]> | null = null;
let versionsPromise: Promise<BibleVersion[]> | null = null;

export function books(): Promise<BibleBook[]> {
  booksPromise ??= getJson<BibleBook[]>("books.json");
  return booksPromise;
}

export function versions(): Promise<BibleVersion[]> {
  versionsPromise ??= getJson<BibleVersion[]>("versions.json");
  return versionsPromise;
}

/** Todos los capítulos de un libro en una versión. */
export function book(version: string, bookId: string): Promise<Record<string, string[]>> {
  const v = VERSION_IDS.includes(version) ? version : DEFAULT_VERSION;
  const key = `${v}/${bookId}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = getJson<Record<string, string[]>>(`${v}/${bookId}.json`);
    // Si falla, se olvida para poder reintentar con red.
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}

export async function bookName(bookId: string): Promise<string> {
  return (await books()).find((b) => b.id === bookId)?.name ?? bookId;
}

export async function chapter(bookId: string, n: number, version = DEFAULT_VERSION): Promise<BibleChapter> {
  const [data, name] = await Promise.all([book(version, bookId), bookName(bookId)]);
  const verses = data[String(n)];
  if (!verses) throw new Error(`${name} no tiene capítulo ${n}.`);
  return {
    book: bookId,
    bookName: name,
    chapter: n,
    version,
    verses: verses.map((text, i) => ({ number: i + 1, text })),
  };
}

export async function verseText(bookId: string, n: number, v: number, version = DEFAULT_VERSION) {
  const data = await book(version, bookId);
  return data[String(n)]?.[v - 1] ?? "";
}

/* -------------------------------------------------------------- búsqueda */

/**
 * Busca en toda la RVR1960. La primera búsqueda descarga los 66 libros (unos
 * 4 MB, ya dentro del APK) y las siguientes son instantáneas.
 */
export async function search(q: string, max = 60): Promise<{ ref: string; text: string }[]> {
  const needle = fold(q.trim());
  if (needle.length < 3) return [];
  const all = await books();
  const out: { ref: string; text: string }[] = [];
  for (const b of all) {
    const data = await book(DEFAULT_VERSION, b.id);
    for (const [ch, verses] of Object.entries(data)) {
      verses.forEach((text, i) => {
        if (out.length < max && fold(text).includes(needle)) {
          out.push({ ref: `${b.name} ${ch}:${i + 1}`, text });
        }
      });
      if (out.length >= max) return out;
    }
  }
  return out;
}

function fold(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* ------------------------------------------------------ versículo del día */

export async function verseOfTheDay(date = new Date()): Promise<{ ref: string; text: string; book: string; chapter: number; verse: number }> {
  const [bookId, ch, v] = dailyVerse(date);
  const [text, name] = await Promise.all([verseText(bookId, ch, v), bookName(bookId)]);
  return { ref: `${name} ${ch}:${v}`, text, book: bookId, chapter: ch, verse: v };
}

/* -------------------------------------------------------------- análisis */

const STOP = new Set([
  "para", "como", "este", "esta", "esto", "pero", "porque", "cuando", "donde", "sobre",
  "entre", "desde", "hasta", "todo", "toda", "todos", "todas", "cada", "ellos", "ellas",
  "nosotros", "vosotros", "aquel", "aquella", "también", "estos", "estas", "aquí", "allí",
  "dijo", "tiene", "será", "eran", "fueron", "había", "hijos", "cual", "cuales", "pues",
  "entonces", "mismo", "misma", "hacia", "según", "sino", "aunque", "contra", "luego",
  "delante", "dice", "dijeron", "habló", "hizo", "vuestro", "vuestra", "nuestro", "nuestra",
]);

export async function analysis(bookId: string, n: number) {
  const c = await chapter(bookId, n);
  const words = c.verses.flatMap((v) => v.text.split(/[^\p{L}]+/u)).filter(Boolean);
  const counts = new Map<string, number>();
  for (const raw of words) {
    const word = raw.toLowerCase();
    if (word.length < 4 || STOP.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return {
    bookName: c.bookName,
    chapter: n,
    verses: c.verses.length,
    words: words.length,
    characters: c.verses.reduce((sum, v) => sum + v.text.length, 0),
    readingMinutes: Math.max(1, Math.ceil(words.length / 200)),
    longestVerse: c.verses.reduce((a, b) => (b.text.length > a.text.length ? b : a)).number,
    frequent: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word, count]) => ({ word, count })),
    texts: c.verses,
  };
}
