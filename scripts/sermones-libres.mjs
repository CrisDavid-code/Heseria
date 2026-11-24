/**
 * HESERIA — Sermones en español con licencia libre, desde Internet Archive.
 *
 *   node scripts/sermones-libres.mjs            (escribe src/content/sermons.json)
 *
 * Solo predicadores que publican su propio material y declaran licencia (Creative Commons o
 * dominio público): la colección general de archive.org mezcla películas y música subidas sin
 * derechos, por eso hay una lista cerrada. Cada sermón guarda autor, licencia y enlace a la
 * fuente; el audio se reproduce desde archive.org (no se copia).
 */
import fs from "node:fs";

const PREACHERS = [
  "Edgar I. Galdámez", "Julio Martinez", "Julio Martínez", "Guillermo Bernáldez", "Guillermo Bernáldez Flores",
  "Jonatán Córdova", "Gilberto Rocha", "Samuel Pagan", "Noé Velázquez", "Jorge Lozano",
  "Carlos Anduce", "David Ruiz", "Gustavo Chavez", "Obispo Daniel Rivera", "Roberto Andrade", "Victor Cayul",
  "Raul Bonilla", "Ramon Elizondo", "Rev. Jose Alberto Padilla", "Alberto Roldán",
];
const MAX_PER_PREACHER = 25;

const LICENSES = [
  [/publicdomain\/(mark|zero)|licenses\/publicdomain/, "Dominio público"],
  [/by-nc-nd/, "CC BY-NC-ND"], [/by-nc-sa/, "CC BY-NC-SA"], [/by-nc\//, "CC BY-NC"],
  [/by-nd/, "CC BY-ND"], [/by-sa/, "CC BY-SA"], [/by\//, "CC BY"],
];
const licenseName = (url) => LICENSES.find(([re]) => re.test(url))?.[1] ?? null;

async function json(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(40000) });
      if (r.ok) return await r.json();
    } catch { /* reintenta */ }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`No se pudo leer ${url}`);
}

const seconds = (v) => {
  if (!v) return 0;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v));
  return String(v).split(":").map(Number).reduce((a, n) => a * 60 + n, 0);
};
const clean = (t) => String(t).replace(/_/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
const fold = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** «10 20210307 Gilberto Rocha Ocúpate De Tus Negocios» → «Ocúpate De Tus Negocios». */
export function sermonTitle(raw, creator) {
  let t = clean(raw);
  const date = /^(\d{2})-(\d{2})-(\d{4})\s*\/\s*/.exec(t);
  if (date) return `Predicación del ${date[1]}/${date[2]}/${date[3]}`;
  t = t.replace(/^\d{1,3}\s+\d{6,8}\s+/, "").replace(/^\d{1,3}\s+\d{1,2}[a-z]{3}\s+\d{2}\s+/i, "").replace(/^\d{1,3}\s+\d{6}\s+/, "");
  for (const name of creator.split(/\s+y\s+|\s*\/\s*/)) {
    const i = fold(t).indexOf(fold(name.trim()));
    if (name.trim().length > 3 && i >= 0) t = (t.slice(0, i) + t.slice(i + name.trim().length)).trim();
  }
  t = t.replace(/\s*-?mp\s?3$/i, "").replace(/^[-–:,.\s]+|[-–:,\s]+$/g, "");
  return t || clean(raw);
}

if (process.argv[2] === "--probar") {
  const eq = (a, b) => { if (a !== b) throw new Error(`«${a}» ≠ «${b}»`); };
  eq(sermonTitle("10 20210307 Gilberto Rocha Ocúpate De Tus Negocios", "Gilberto Rocha"), "Ocúpate De Tus Negocios");
  eq(sermonTitle("42 24sep 17 Noe Velazquez Examinando", "Noe Velazquez"), "Examinando");
  eq(sermonTitle("08-06-2013 / Roberto Andrade", "Roberto Andrade"), "Predicación del 08/06/2013");
  eq(sermonTitle("La Solución Para El Afán", "Edgar I. Galdámez"), "La Solución Para El Afán");
  console.log("títulos: ok");
  process.exit(0);
}

const out = [];
const seen = new Set();
for (const who of PREACHERS) {
  const q = encodeURIComponent(`creator:("${who}") AND mediatype:audio AND licenseurl:*`);
  const res = await json(`https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=licenseurl&fl[]=creator&fl[]=date&rows=${MAX_PER_PREACHER}&sort[]=downloads+desc&output=json`);
  for (const doc of res.response.docs) {
    const license = licenseName(doc.licenseurl ?? "");
    if (!license || seen.has(doc.identifier)) continue;
    seen.add(doc.identifier);
    const meta = await json(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`).catch(() => null);
    const mp3 = (meta?.files ?? []).filter((f) => /\.mp3$/i.test(f.name) && !/_64kb|_sample/i.test(f.name)).slice(0, 1)[0];
    if (!mp3) continue;
    const durationSec = seconds(mp3.length);
    if (durationSec && durationSec < 300) continue; // fragmentos y anuncios, no sermones completos
    const creator = clean(Array.isArray(doc.creator) ? doc.creator[0] : doc.creator ?? who);
    out.push({
      id: `ia-${doc.identifier}`.replace(/[^\w-]/g, "-").slice(0, 120),
      kind: "sermon",
      title: sermonTitle(doc.title ?? doc.identifier, creator),
      subtitle: creator,
      description: `Predicación de ${creator}. Licencia: ${license} (${doc.licenseurl}). Fuente: https://archive.org/details/${doc.identifier}`,
      category: "Predicación",
      durationSec,
      source: {
        kind: "link",
        url: `https://archive.org/download/${doc.identifier}/${encodeURIComponent(mp3.name)}`,
        originalUrl: `https://archive.org/details/${doc.identifier}`,
        provider: "direct-audio",
      },
      license,
      status: "publicado",
      ownerId: "heseria",
      createdAt: doc.date ? new Date(doc.date).toISOString() : new Date().toISOString(),
    });
  }
  console.log(`${who}: ${out.length} en total`);
}

fs.writeFileSync(new URL("../src/content/sermons.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`sermones: ${out.length}`);
