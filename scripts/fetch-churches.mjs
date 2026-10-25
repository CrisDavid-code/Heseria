/**
 * HESERIA — Descarga las iglesias cristianas de Guatemala desde OpenStreetMap.
 *
 *   node scripts/fetch-churches.mjs <salida.json>
 *
 * Datos de OpenStreetMap, © colaboradores de OpenStreetMap, licencia ODbL: se
 * pueden usar citando la fuente, y la app la cita en Configuración y en el mapa.
 * Los servidores públicos de Overpass se saturan, así que se prueba con varios
 * espejos y con esperas crecientes.
 */
import fs from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("Uso: node scripts/fetch-churches.mjs <salida.json>");
  process.exit(1);
}

// Guatemala por su recuadro: más barato para el servidor que buscar el área.
const BBOX = "13.7,-92.25,17.82,-88.2";
const QUERY = `[out:json][timeout:150];(node["amenity"="place_of_worship"]["religion"="christian"](${BBOX});way["amenity"="place_of_worship"]["religion"="christian"](${BBOX}););out center tags;`;

const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

for (let attempt = 0; attempt < 12; attempt++) {
  const host = MIRRORS[attempt % MIRRORS.length];
  try {
    const res = await fetch(host, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "Heseria/1.0 (directorio de iglesias evangelicas de Guatemala)",
      },
      body: "data=" + encodeURIComponent(QUERY),
      signal: AbortSignal.timeout(200000),
    });
    const text = await res.text();
    if (text.trim().startsWith("{")) {
      const json = JSON.parse(text);
      fs.writeFileSync(out, text);
      console.log(`listo desde ${host}: ${json.elements.length} lugares (base ${json.osm3s?.timestamp_osm_base})`);
      process.exit(0);
    }
    console.log(`intento ${attempt + 1} · ${host} · ${res.status} ocupado`);
  } catch (err) {
    console.log(`intento ${attempt + 1} · ${host} · ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 4000 + attempt * 3000));
}
console.error("Ningún servidor de Overpass respondió. Intenta más tarde.");
process.exit(1);
