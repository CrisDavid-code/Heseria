/**
 * HESERIA — Convierte las Biblias en formato .xmm (carpeta `biblias/`) al
 * formato de la app.
 *
 *   node scripts/build-bible-xmm.mjs
 *
 * Cada .xmm es un XML `<bible><b n="Génesis"><c n="1"><v n="1">texto</v>…`
 * con los 66 libros en orden canónico. Sale a `public/biblia/<id>/<libro>.json`
 * con la misma forma que `build-bible.mjs` (`{ "1": ["v1", "v2", …] }`) y se
 * añaden a `versions.json` sin tocar las versiones que ya había.
 *
 * Estas traducciones tienen derechos de autor: `copyright` se muestra en el
 * lector. Publicarlas en tiendas requiere el permiso de cada editorial.
 */
import fs from "node:fs";
import path from "node:path";

const VERSIONS = [
  { id: "rvr1960", file: "Reina-Valera 1960.xmm", abbr: "RVR1960", name: "Reina-Valera 1960",
    copyright: "Reina-Valera 1960 © Sociedades Bíblicas en América Latina, 1960. Renovado © Sociedades Bíblicas Unidas, 1988." },
  { id: "ntv", file: "Nueva Traducción Viviente.xmm", abbr: "NTV", name: "Nueva Traducción Viviente",
    copyright: "Nueva Traducción Viviente © Tyndale House Foundation, 2010." },
  { id: "lbla", file: "La Biblia de Las Americas.xmm", abbr: "LBLA", name: "La Biblia de las Américas",
    copyright: "La Biblia de las Américas © The Lockman Foundation, 1986, 1995, 1997." },
  { id: "dhh", file: "Dios Habla Hoy.xmm", abbr: "DHH", name: "Dios Habla Hoy",
    copyright: "Dios Habla Hoy © Sociedades Bíblicas Unidas, 1966, 1970, 1979, 1983, 1996." },
  { id: "tla", file: "Traducción en Lenguaje Actual.xmm", abbr: "TLA", name: "Traducción en Lenguaje Actual",
    copyright: "Traducción en Lenguaje Actual © Sociedades Bíblicas Unidas, 2000." },
];

const SRC = "biblias";
const OUT = path.join("public", "biblia");
/** Ids de los libros en orden canónico, los mismos de las otras versiones. */
const BOOK_IDS = JSON.parse(fs.readFileSync(path.join(OUT, "books.json"), "utf8")).map((b) => b.id);

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Quita las llamadas a notas ([1], [a]) y los espacios dobles del origen. */
function clean(text) {
  return decode(text)
    .replace(/\s*\[[0-9a-z]{1,3}\]/g, "")
    .replace(/\s+([,.;:!?»)])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function convert(v) {
  const xml = fs.readFileSync(path.join(SRC, v.file), "utf8");
  const books = [...xml.matchAll(/<b n="[^"]*">([\s\S]*?)<\/b>/g)];
  if (books.length !== BOOK_IDS.length) throw new Error(`${v.file}: ${books.length} libros, se esperaban 66`);
  fs.mkdirSync(path.join(OUT, v.id), { recursive: true });
  let total = 0;
  books.forEach(([, body], i) => {
    const out = {};
    for (const [, n, chapter] of body.matchAll(/<c n="(\d+)">([\s\S]*?)<\/c>/g)) {
      const verses = [];
      for (const [, num, text] of chapter.matchAll(/<v n="(\d+)">([\s\S]*?)<\/v>/g)) {
        // Por número: un versículo unido al anterior (TLA) queda vacío, sin correr los demás.
        verses[Number(num) - 1] = clean(text);
        total++;
      }
      out[n] = Array.from(verses, (t) => t ?? "");
    }
    fs.writeFileSync(path.join(OUT, v.id, `${BOOK_IDS[i]}.json`), JSON.stringify(out));
  });
  return total;
}

const resumen = {};
for (const v of VERSIONS) resumen[v.id] = convert(v);

const file = path.join(OUT, "versions.json");
const current = JSON.parse(fs.readFileSync(file, "utf8")).filter((x) => !VERSIONS.some((v) => v.id === x.id));
const added = VERSIONS.map(({ id, abbr, name, copyright }) => ({ id, abbr, name, language: "es", licensed: true, copyright }));
// Las nuevas primero: la RVR1960 encabeza la lista.
fs.writeFileSync(file, JSON.stringify([...added, ...current]));
console.log("versículos por versión:", resumen);
