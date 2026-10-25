/**
 * HESERIA — Directorio real de iglesias evangélicas de Guatemala.
 *
 *   node scripts/build-churches.mjs <osm.json> <guatemala-geometry.json>
 *
 * Toma los lugares de culto cristianos de OpenStreetMap (© colaboradores de
 * OpenStreetMap, ODbL) y se queda con los que:
 *
 *   1. están **dentro de Guatemala** (el recuadro de búsqueda roza El Salvador,
 *      Honduras, México y Belice; se recorta con el contorno del país),
 *   2. son **evangélicos o protestantes**: por la etiqueta `denomination` o, si
 *      no la tienen, por un nombre que lo diga claramente.
 *
 * Se descartan las católicas, Testigos de Jehová, mormones, La Luz del Mundo y
 * adventistas, y las que solo se llaman «Iglesia» sin más: no se puede saber
 * qué son y es mejor no adivinar.
 *
 * Nada se inventa: nombre, posición, teléfono y web son los de OpenStreetMap.
 * Lo que no tiene, queda vacío.
 */
import fs from "node:fs";

const [osmPath, geomPath] = process.argv.slice(2);
if (!osmPath || !geomPath) {
  console.error("Uso: node scripts/build-churches.mjs <osm.json> <guatemala.json>");
  process.exit(1);
}

const osm = JSON.parse(fs.readFileSync(osmPath, "utf8"));
const geometry = JSON.parse(fs.readFileSync(geomPath, "utf8"));
const rings = geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);

/** ¿El punto cae dentro del contorno? (ray casting) */
function inside(lng, lat) {
  return rings.some((ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  });
}

const fold = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Etiqueta de OSM → nombre que se muestra. `null` = no es evangélica. */
const DENOMINATIONS = {
  evangelical: "Evangélica", evangelica: "Evangélica", evangalica: "Evangélica",
  protestant: "Evangélica", christian: "Cristiana evangélica", cristiana: "Cristiana evangélica",
  nondenominational: "Cristiana evangélica", united: "Evangélica",
  pentecostal: "Pentecostal", "neo-pentecostal": "Neopentecostal",
  baptist: "Bautista", baptist_reformed: "Bautista reformada",
  assemblies_of_god: "Asambleas de Dios", asambleas_de_dios: "Asambleas de Dios",
  presbyterian: "Presbiteriana", reform: "Reformada", nazarene: "Nazarena",
  methodist: "Metodista", lutheran: "Luterana", church_of_god: "Iglesia de Dios",
  mennonite: "Menonita", anglican: "Anglicana", episcopal: "Episcopal",
  church_of_christ: "Iglesia de Cristo",
};

/** Lo que no es evangélico, por etiqueta o por nombre. */
const NOT_EVANGELICAL = /catol|parroquia|capilla|virgen|nuestra senora|catedral|ermita|beato|sagrado corazon|divino nino|inmaculada|cristo rey|santuario|basilica|cenaculo|testigos? de jehova|salon del reino|luz del mundo|mormon|santos de los ultimos|adventista|jesus nazareno|senor de esquipulas|\bsan |\bsanta |\bsanto /;

/** Nombres que dicen claramente que es evangélica, cuando falta la etiqueta. */
const BY_NAME = [
  [/asamblea/, "Asambleas de Dios"],
  [/pentecost/, "Pentecostal"],
  [/bautista/, "Bautista"],
  [/\belim\b/, "Elim"],
  [/principe de paz/, "Príncipe de Paz"],
  [/iglesia de dios/, "Iglesia de Dios"],
  [/presbiter/, "Presbiteriana"],
  [/metodist/, "Metodista"],
  [/luteran/, "Luterana"],
  [/menonit/, "Menonita"],
  [/nazaren[oa] (del )?(iglesia|templo)|iglesia del nazareno/, "Nazarena"],
  [/calvary chapel/, "Calvary Chapel"],
  [/apostol|profet/, "Apostólica"],
  [/evangel/, "Evangélica"],
  [/(iglesia|templo|congregacion|comunidad|centro|ministerio|mision) cristian/, "Cristiana evangélica"],
  [/tabernaculo|monte sinai|aposento alto|bethel|betel|bethesda|betesda|shalom|el shaddai|casa de dios|fraternidad cristiana|ministerios? /, "Evangélica"],
];

function classify(tags) {
  const name = fold(tags.name ?? "");
  const den = fold(tags.denomination ?? "").trim().replace(/\s+/g, "_");
  if (NOT_EVANGELICAL.test(name)) return null;
  if (den) return DENOMINATIONS[den] ?? null; // con etiqueta: manda la etiqueta
  for (const [re, label] of BY_NAME) if (re.test(name)) return label;
  return null;
}

/** Horario tal como lo escribió quien lo cargó en OSM. */
function services(tags) {
  const raw = tags.service_times || tags.opening_hours;
  return raw ? [{ day: String(raw).slice(0, 120), time: "", type: "Cultos" }] : [];
}

const seen = new Set();
const churches = [];
for (const e of osm.elements) {
  const tags = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!tags.name || lat == null || lng == null) continue;
  if (!inside(lng, lat)) continue;
  const denomination = classify(tags);
  if (!denomination) continue;

  // El mismo templo cargado dos veces (punto y edificio) se cuenta una vez.
  const key = `${fold(tags.name)}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || tags["addr:place"] || "";
  churches.push({
    id: `osm-${e.type[0]}${e.id}`,
    name: tags.name.trim().slice(0, 120),
    denomination,
    city: city.trim(),
    country: "Guatemala",
    language: "Español",
    description:
      `Congregación ${denomination.toLowerCase()}${city ? ` en ${city}` : ""}. ` +
      "Información pública de OpenStreetMap: si administras esta iglesia, escríbenos para completar horarios y contacto.",
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    services: services(tags),
    contact: {
      phone: tags.phone || tags["contact:phone"] || "",
      site: tags.website || tags["contact:website"] || "",
      email: tags.email || tags["contact:email"] || "",
    },
    members: 0,
    source: "OpenStreetMap",
    osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
  });
}

churches.sort((a, b) => a.name.localeCompare(b.name, "es"));
fs.mkdirSync("src/content", { recursive: true });
fs.writeFileSync("src/content/churches.json", JSON.stringify(churches));

const by = {};
for (const c of churches) by[c.denomination] = (by[c.denomination] ?? 0) + 1;
console.log(`${churches.length} iglesias evangélicas en Guatemala`);
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(" · "));
console.log("con ciudad:", churches.filter((c) => c.city).length, "· con teléfono:", churches.filter((c) => c.contact.phone).length);
