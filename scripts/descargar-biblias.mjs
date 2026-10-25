/**
 * HESERIA — Trae las versiones con derechos de autor antes de compilar.
 *
 *   node scripts/descargar-biblias.mjs
 *
 * RVR1960, NTV, LBLA, DHH y TLA no se guardan en este repositorio público: se toman de la web ya
 * publicada (heseria.web.app/biblia) y van dentro del APK y de la nueva publicación. Si falta un
 * solo libro, se detiene: así nunca se publica una versión incompleta ni se pierden.
 * Respaldo original (.xmm y JSON): repositorio privado CrisDavid-code/Heseria-App.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.SITE ?? "https://heseria.web.app";
const VERSIONS = ["rvr1960", "ntv", "lbla", "dhh", "tla"];
const OUT = path.join("public", "biblia");
const books = JSON.parse(fs.readFileSync(path.join(OUT, "books.json"), "utf8"));

let total = 0;
for (const v of VERSIONS) {
  fs.mkdirSync(path.join(OUT, v), { recursive: true });
  await Promise.all(
    books.map(async ({ id, chapters }) => {
      const res = await fetch(`${SITE}/biblia/${v}/${id}.json`);
      if (!res.ok) throw new Error(`${v}/${id}: HTTP ${res.status}`);
      const data = await res.json();
      // Que sea de verdad el libro y no la página de inicio que Hosting devuelve para rutas desconocidas.
      if (Object.keys(data).length !== chapters) throw new Error(`${v}/${id}: ${Object.keys(data).length} capítulos, se esperaban ${chapters}`);
      fs.writeFileSync(path.join(OUT, v, `${id}.json`), JSON.stringify(data));
      total++;
    }),
  );
}
console.log(`Biblias protegidas: ${total} libros de ${VERSIONS.length} versiones`);
