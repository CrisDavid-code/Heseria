/**
 * HESERIA — Prepara las Biblias de dominio público para la app.
 *
 *   node scripts/build-bible.mjs <carpeta-con-los-vpl>
 *
 * Fuente: eBible.org, formato VPL («GEN 1:1 texto»). Las tres traducciones son
 * de dominio público según su propia ficha:
 *
 *   · Reina-Valera 1909 (spaRV1909)            — español
 *   · King James Version (eng-kjv)             — inglés (dominio público fuera del Reino Unido)
 *   · Bíblia Portuguesa Mundial (porbrbsl)     — portugués
 *
 * Se quedan solo los 66 libros del canon protestante: algunas de estas
 * ediciones traen los deuterocanónicos y Heseria es una app evangélica.
 *
 * Sale a `public/biblia/<version>/<libro>.json` con la forma
 * `{ "1": ["versículo 1", "versículo 2", …], "2": [...] }`. Un archivo por libro
 * para que la app descargue solo lo que se lee, y todo va dentro del APK: la
 * Biblia funciona sin conexión.
 */
import fs from "node:fs";
import path from "node:path";

/** USFM → [id de la app, nombre en español, testamento]. Orden canónico. */
export const BOOKS = [
  ["GEN", "genesis", "Génesis", "AT"], ["EXO", "exodo", "Éxodo", "AT"],
  ["LEV", "levitico", "Levítico", "AT"], ["NUM", "numeros", "Números", "AT"],
  ["DEU", "deuteronomio", "Deuteronomio", "AT"], ["JOS", "josue", "Josué", "AT"],
  ["JDG", "jueces", "Jueces", "AT"], ["RUT", "rut", "Rut", "AT"],
  ["1SA", "1-samuel", "1 Samuel", "AT"], ["2SA", "2-samuel", "2 Samuel", "AT"],
  ["1KI", "1-reyes", "1 Reyes", "AT"], ["2KI", "2-reyes", "2 Reyes", "AT"],
  ["1CH", "1-cronicas", "1 Crónicas", "AT"], ["2CH", "2-cronicas", "2 Crónicas", "AT"],
  ["EZR", "esdras", "Esdras", "AT"], ["NEH", "nehemias", "Nehemías", "AT"],
  ["EST", "ester", "Ester", "AT"], ["JOB", "job", "Job", "AT"],
  ["PSA", "salmos", "Salmos", "AT"], ["PRO", "proverbios", "Proverbios", "AT"],
  ["ECC", "eclesiastes", "Eclesiastés", "AT"], ["SOL", "cantares", "Cantares", "AT"],
  ["ISA", "isaias", "Isaías", "AT"], ["JER", "jeremias", "Jeremías", "AT"],
  ["LAM", "lamentaciones", "Lamentaciones", "AT"], ["EZE", "ezequiel", "Ezequiel", "AT"],
  ["DAN", "daniel", "Daniel", "AT"], ["HOS", "oseas", "Oseas", "AT"],
  ["JOE", "joel", "Joel", "AT"], ["AMO", "amos", "Amós", "AT"],
  ["OBA", "abdias", "Abdías", "AT"], ["JON", "jonas", "Jonás", "AT"],
  ["MIC", "miqueas", "Miqueas", "AT"], ["NAH", "nahum", "Nahúm", "AT"],
  ["HAB", "habacuc", "Habacuc", "AT"], ["ZEP", "sofonias", "Sofonías", "AT"],
  ["HAG", "hageo", "Hageo", "AT"], ["ZEC", "zacarias", "Zacarías", "AT"],
  ["MAL", "malaquias", "Malaquías", "AT"],
  ["MAT", "mateo", "Mateo", "NT"], ["MAR", "marcos", "Marcos", "NT"],
  ["LUK", "lucas", "Lucas", "NT"], ["JOH", "juan", "Juan", "NT"],
  ["ACT", "hechos", "Hechos", "NT"], ["ROM", "romanos", "Romanos", "NT"],
  ["1CO", "1-corintios", "1 Corintios", "NT"], ["2CO", "2-corintios", "2 Corintios", "NT"],
  ["GAL", "galatas", "Gálatas", "NT"], ["EPH", "efesios", "Efesios", "NT"],
  ["PHI", "filipenses", "Filipenses", "NT"], ["COL", "colosenses", "Colosenses", "NT"],
  ["1TH", "1-tesalonicenses", "1 Tesalonicenses", "NT"],
  ["2TH", "2-tesalonicenses", "2 Tesalonicenses", "NT"],
  ["1TI", "1-timoteo", "1 Timoteo", "NT"], ["2TI", "2-timoteo", "2 Timoteo", "NT"],
  ["TIT", "tito", "Tito", "NT"], ["PHM", "filemon", "Filemón", "NT"],
  ["HEB", "hebreos", "Hebreos", "NT"], ["JAM", "santiago", "Santiago", "NT"],
  ["1PE", "1-pedro", "1 Pedro", "NT"], ["2PE", "2-pedro", "2 Pedro", "NT"],
  ["1JO", "1-juan", "1 Juan", "NT"], ["2JO", "2-juan", "2 Juan", "NT"],
  ["3JO", "3-juan", "3 Juan", "NT"], ["JUD", "judas", "Judas", "NT"],
  ["REV", "apocalipsis", "Apocalipsis", "NT"],
];

const VERSIONS = [
  { id: "rv1909", file: "spaRV1909/spaRV1909_vpl.txt", abbr: "RV1909", name: "Reina-Valera 1909", language: "es" },
  { id: "kjv", file: "engkjv/eng-kjv_vpl.txt", abbr: "KJV", name: "King James Version", language: "en" },
  { id: "bpm", file: "porbrbsl/porbrbsl_vpl.txt", abbr: "BPM", name: "Bíblia Portuguesa Mundial", language: "pt" },
];

const src = process.argv[2];
if (!src) {
  console.error("Uso: node scripts/build-bible.mjs <carpeta-con-los-vpl>");
  process.exit(1);
}

const OUT = path.join("public", "biblia");
const byCode = new Map(BOOKS.map(([code, id]) => [code, id]));

/** Limpia el texto: la KJV marca en corchetes las palabras añadidas al traducir. */
function clean(text) {
  return text
    .replace(/\[|\]/g, "")
    .replace(/¶\s*/g, "") // marca de párrafo de la KJV
    .replace(/\s+([,.;:!?])/g, "$1") // la BPM deja espacios antes de la puntuación
    .replace(/\s+/g, " ")
    .trim();
}

const resumen = {};
for (const v of VERSIONS) {
  const lines = fs.readFileSync(path.join(src, v.file), "utf8").split(/\r?\n/);
  /** libro → capítulo → versículos */
  const books = new Map();

  for (const line of lines) {
    const m = /^([1-3A-Z]{3}) (\d+):(\d+) (.*)$/.exec(line);
    if (!m) continue;
    const id = byCode.get(m[1]);
    if (!id) continue; // deuterocanónico u otro: fuera
    const chapter = Number(m[2]);
    const verse = Number(m[3]);
    const chapters = books.get(id) ?? new Map();
    const verses = chapters.get(chapter) ?? [];
    // Posición por número: un versículo que falte deja un hueco, no corre los demás.
    verses[verse - 1] = clean(m[4]);
    chapters.set(chapter, verses);
    books.set(id, chapters);
  }

  fs.mkdirSync(path.join(OUT, v.id), { recursive: true });
  let total = 0;
  for (const [id, chapters] of books) {
    const obj = {};
    for (const [n, verses] of [...chapters].sort((a, b) => a[0] - b[0])) {
      obj[n] = Array.from(verses, (t) => t ?? "");
      total += verses.length;
    }
    fs.writeFileSync(path.join(OUT, v.id, `${id}.json`), JSON.stringify(obj));
  }
  resumen[v.id] = { libros: books.size, versiculos: total };
}

// El índice de libros sale de la RV1909, que es la principal.
const rv = path.join(OUT, "rv1909");
const index = BOOKS.map(([, id, name, testament]) => {
  const data = JSON.parse(fs.readFileSync(path.join(rv, `${id}.json`), "utf8"));
  return { id, name, testament, chapters: Object.keys(data).length };
});
fs.writeFileSync(path.join(OUT, "books.json"), JSON.stringify(index));
fs.writeFileSync(
  path.join(OUT, "versions.json"),
  JSON.stringify(VERSIONS.map(({ id, abbr, name, language }) => ({ id, abbr, name, language, licensed: true }))),
);

console.log(JSON.stringify(resumen, null, 1));
console.log("libros en el índice:", index.length);
