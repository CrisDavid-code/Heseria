/**
 * Entiende una referencia bíblica escrita a mano: «Juan 3:16», «1 cor 13», «salmo 23»,
 * «Génesis 1.1», «apoc 21». Devuelve el libro (por prefijo del nombre, sin tildes ni
 * mayúsculas), el capítulo y el versículo, o null si no es una referencia válida.
 */
export interface BookLite { id: string; name: string; chapters: number }

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
/** Nombres que la gente escribe distinto al índice. */
const ALIAS: Record<string, string> = { salmo: "salmos", sal: "salmos", cantar: "cantares", apoc: "apocalipsis", hch: "hechos" };

export function parseReference(input: string, books: BookLite[]): { book: BookLite; chapter: number; verse: number | null } | null {
  const m = /^((?:[1-3]\s*)?[a-zñ]+)\.?\s+(\d{1,3})(?:\s*[:.,]\s*(\d{1,3}))?$/.exec(fold(input));
  if (!m) return null;
  let name = m[1].replace(/^([1-3])\s*/, "$1 ");
  name = ALIAS[name] ?? name;
  const book = books.find((b) => fold(b.name) === name) ?? books.find((b) => fold(b.name).startsWith(name));
  if (!book) return null;
  const chapter = Number(m[2]);
  if (chapter < 1 || chapter > book.chapters) return null;
  return { book, chapter, verse: m[3] ? Number(m[3]) : null };
}

/**
 * «Génesis 1-3; Éxodo 1» → los capítulos a leer, en orden: [Génesis 1, 2, 3, Éxodo 1].
 * Sirve a los planes: «Leer pasaje» abre cada capítulo del día y deja volver al plan.
 */

export interface PassageChapter { book: string; name: string; chapter: number }

export function passageChapters(text: string, books: BookLite[]): PassageChapter[] {
  const out: PassageChapter[] = [];
  for (const raw of text.split(/[;,]\s*(?=\D)/)) {
    const seg = raw.trim();
    // «Libro A-B» o «Libro A:v-w» (rango de capítulos solo si no hay «:»).
    const m = /^(.*?\D)\s*(\d{1,3})(?::\d{1,3})?(?:\s*[-–]\s*(\d{1,3}))?(?::\d{1,3})?$/.exec(seg);
    if (!m) continue;
    const ref = parseReference(`${m[1].trim()} ${m[2]}`, books);
    if (!ref) continue;
    const to = m[3] && !seg.includes(":") ? Math.min(Number(m[3]), ref.book.chapters) : ref.chapter;
    for (let c = ref.chapter; c <= Math.max(ref.chapter, to); c++) out.push({ book: ref.book.id, name: ref.book.name, chapter: c });
  }
  return out;
}
