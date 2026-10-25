/**
 * HESERIA — Biblia: marcas, notas y comparación de versiones.
 *
 * Una marca es lo que alguien deja al leer: un resaltado de color, una nota, o
 * simplemente guardarlo. Se identifica por `libro.capítulo.versículo`, sin la
 * versión, para que siga valiendo al cambiar de traducción.
 */
import { Router } from "express";
import { catalog, db } from "../db.js";
import { requireAuth } from "../auth.js";
import { badRequest, notFound, num, oneOf, str, wrap } from "../http.js";

export const bibleRouter = Router();

/** Colores admitidos. Coinciden con los que ofrece la app. */
const COLORS = ["amarillo", "verde", "azul", "rosa", "naranja", "morado"];

const serialize = (row) => ({
  reference: row.reference,
  book: row.book,
  chapter: row.chapter,
  verse: row.verse,
  color: row.color ?? undefined,
  note: row.note ?? undefined,
  saved: Boolean(row.saved),
  updatedAt: row.updated_at,
});

/** Comprueba que el versículo existe antes de dejar marcarlo. */
function findVerse(book, chapter, verse) {
  const doc = catalog.get("bibleChapter", `${book}.${chapter}`);
  if (!doc) return null;
  return doc.verses.find((v) => v.number === verse) ?? null;
}

/* ---------------------------------------------------------------- marcas */

/** Todas las marcas de la persona. Con `?book=&chapter=` solo las de ahí. */
bibleRouter.get(
  "/bible/marks",
  requireAuth,
  wrap((req, res) => {
    const { book, chapter } = req.query;
    const rows =
      book && chapter
        ? db.prepare(
            "SELECT * FROM verse_marks WHERE user_id = ? AND book = ? AND chapter = ? ORDER BY verse",
          ).all(req.user.id, book, Number(chapter))
        : db.prepare(
            "SELECT * FROM verse_marks WHERE user_id = ? ORDER BY updated_at DESC LIMIT 500",
          ).all(req.user.id);
    res.json(rows.map(serialize));
  }),
);

/** Los versículos guardados, con su texto, para la biblioteca. */
bibleRouter.get(
  "/bible/marks/saved",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare(
      "SELECT * FROM verse_marks WHERE user_id = ? AND saved = 1 ORDER BY updated_at DESC",
    ).all(req.user.id);

    res.json(
      rows
        .map((row) => {
          const verse = findVerse(row.book, row.chapter, row.verse);
          const doc = catalog.get("bibleChapter", `${row.book}.${row.chapter}`);
          if (!verse || !doc) return null;
          return {
            ...serialize(row),
            ref: `${doc.bookName} ${row.chapter}:${row.verse}`,
            text: verse.text,
          };
        })
        .filter(Boolean),
    );
  }),
);

/**
 * Crea o actualiza la marca de un versículo.
 *
 * Se envía solo lo que cambia: `{ color }`, `{ note }` o `{ saved }`. Cuando no
 * queda nada —sin color, sin nota y sin guardar— la fila se borra, para no
 * acumular marcas vacías.
 */
bibleRouter.patch(
  "/bible/marks/:book/:chapter/:verse",
  requireAuth,
  wrap((req, res) => {
    const book = str(req.params.book, "libro", { max: 40 });
    const chapter = num(req.params.chapter, "capítulo", { min: 1, max: 200 });
    const verse = num(req.params.verse, "versículo", { min: 1, max: 200 });

    if (!findVerse(book, chapter, verse)) throw notFound("Ese versículo no existe.");

    const reference = `${book}.${chapter}.${verse}`;
    const current = db.prepare("SELECT * FROM verse_marks WHERE user_id = ? AND reference = ?")
      .get(req.user.id, reference);

    const body = req.body ?? {};
    let color = current?.color ?? null;
    let note = current?.note ?? null;
    let saved = current?.saved ?? 0;

    if (body.color !== undefined) {
      color = body.color === null || body.color === "" ? null : oneOf(body.color, COLORS, "color");
    }
    if (body.note !== undefined) {
      const text = str(body.note, "nota", { required: false, max: 2000 });
      note = text || null;
    }
    if (body.saved !== undefined) saved = body.saved ? 1 : 0;

    // Sin color, sin nota y sin guardar, la marca ya no dice nada.
    if (!color && !note && !saved) {
      db.prepare("DELETE FROM verse_marks WHERE user_id = ? AND reference = ?")
        .run(req.user.id, reference);
      return res.json({ reference, book, chapter, verse, saved: false });
    }

    db.prepare(`
      INSERT INTO verse_marks (user_id, reference, book, chapter, verse, color, note, saved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, reference) DO UPDATE SET
        color = excluded.color,
        note = excluded.note,
        saved = excluded.saved,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
    `).run(req.user.id, reference, book, chapter, verse, color, note, saved);

    res.json(
      serialize(
        db.prepare("SELECT * FROM verse_marks WHERE user_id = ? AND reference = ?")
          .get(req.user.id, reference),
      ),
    );
  }),
);

/* --------------------------------------------------------- comparación */

/**
 * El mismo versículo en todas las versiones disponibles.
 *
 * Hoy el texto de demostración es igual en todas, así que la comparación
 * enseña la mecánica pero no diferencias reales. Marcamos cuáles requieren
 * licencia: al conectar una API autorizada, esas traen su texto propio y esta
 * pantalla empieza a servir de verdad.
 */
bibleRouter.get(
  "/bible/compare/:book/:chapter/:verse",
  wrap((req, res) => {
    const book = str(req.params.book, "libro", { max: 40 });
    const chapter = num(req.params.chapter, "capítulo", { min: 1, max: 200 });
    const verse = num(req.params.verse, "versículo", { min: 1, max: 200 });

    const doc = catalog.get("bibleChapter", `${book}.${chapter}`);
    if (!doc) throw notFound("Ese capítulo no existe.");
    const found = doc.verses.find((v) => v.number === verse);
    if (!found) throw notFound("Ese versículo no existe.");

    const versions = catalog.all("bibleVersion");
    res.json({
      ref: `${doc.bookName} ${chapter}:${verse}`,
      book,
      chapter,
      verse,
      versions: versions.map((v) => ({
        id: v.id,
        name: v.name,
        abbreviation: v.abbreviation ?? v.id.toUpperCase(),
        licensed: v.licensed !== false,
        text: found.text,
      })),
    });
  }),
);

/* ------------------------------------------------------------- análisis */

/**
 * Datos del capítulo que ayudan a estudiarlo: longitud, tiempo de lectura,
 * palabras que más se repiten y los versículos que más ha marcado la
 * comunidad.
 *
 * Todo sale de lo que hay: nada de esto pretende ser exégesis.
 */
bibleRouter.get(
  "/bible/analysis/:book/:chapter",
  wrap((req, res) => {
    const book = str(req.params.book, "libro", { max: 40 });
    const chapter = num(req.params.chapter, "capítulo", { min: 1, max: 200 });

    const doc = catalog.get("bibleChapter", `${book}.${chapter}`);
    if (!doc) throw notFound("Ese capítulo no existe.");

    const words = doc.verses
      .flatMap((v) => v.text.toLowerCase().match(/[\p{L}]+/gu) ?? [])
      .filter((w) => w.length > 3);

    // Palabras vacías: no aportan nada a un recuento de frecuencia.
    const STOP = new Set([
      "para", "como", "este", "esta", "esto", "pero", "porque", "cuando", "donde",
      "sobre", "entre", "desde", "hasta", "todo", "toda", "todos", "todas", "cada",
      "ellos", "ellas", "nosotros", "vosotros", "aquel", "aquella", "también",
      "texto", "demostración", "versículo", "heseria", "línea", "ejemplo",
    ]);

    const counts = new Map();
    for (const word of words) {
      if (STOP.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }

    const frequent = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word, count]) => ({ word, count }));

    const characters = doc.verses.reduce((n, v) => n + v.text.length, 0);

    // Lo que la comunidad ha resaltado en este capítulo.
    const popular = db.prepare(`
      SELECT verse, COUNT(*) AS n FROM verse_marks
      WHERE book = ? AND chapter = ? AND (color IS NOT NULL OR saved = 1)
      GROUP BY verse ORDER BY n DESC LIMIT 5
    `).all(book, chapter);

    res.json({
      book,
      bookName: doc.bookName,
      chapter,
      verses: doc.verses.length,
      words: words.length,
      characters,
      /** A 200 palabras por minuto, redondeado hacia arriba. */
      readingMinutes: Math.max(1, Math.ceil(words.length / 200)),
      longestVerse: doc.verses.reduce((a, b) => (b.text.length > a.text.length ? b : a)).number,
      frequent,
      popular: popular.map((p) => ({
        verse: p.verse,
        marks: p.n,
        text: doc.verses.find((v) => v.number === p.verse)?.text ?? "",
      })),
    });
  }),
);

void badRequest;
