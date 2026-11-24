/**
 * Iglesias cercanas en vivo desde OpenStreetMap (Overpass, gratis y sin clave). La lista
 * guardada en Firestore es fija; aquí se consulta alrededor de la persona, así aparecen
 * todas las que estén cargadas en el mapa cerca de ella, con su contacto y horario si lo
 * tienen. Datos © colaboradores de OpenStreetMap (ODbL).
 */
import type { Church } from "@/types";

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Lo que claramente no es una congregación evangélica (por nombre o etiqueta). */
const NOT_EVANGELICAL = /catol|parroquia|capilla|virgen|nuestra senora|catedral|ermita|beato|sagrado corazon|divino nino|inmaculada|cristo rey|santuario|basilica|cenaculo|testigos? de jehova|salon del reino|luz del mundo|mormon|santos de los ultimos|jesus nazareno|senor de esquipulas|\bsan |\bsanta |\bsanto /;
const NOT_EVANGELICAL_TAG = /catholic|roman|orthodox|jehovah|latter|mormon/;

const LABELS: [RegExp, string][] = [
  [/asamblea|assemblies/, "Asambleas de Dios"],
  [/pentecost/, "Pentecostal"],
  [/bautista|baptist/, "Bautista"],
  [/\belim\b/, "Elim"],
  [/principe de paz/, "Príncipe de Paz"],
  [/iglesia de dios|church_of_god/, "Iglesia de Dios"],
  [/presbiter/, "Presbiteriana"],
  [/metodist|methodist/, "Metodista"],
  [/luteran|lutheran/, "Luterana"],
  [/menonit|mennonite/, "Menonita"],
  [/nazaren/, "Nazarena"],
  [/adventist/, "Adventista"],
  [/apostol|profet/, "Apostólica"],
];

/** Nombre de la denominación para mostrar, o null si no corresponde. */
export function classify(tags: Record<string, string>): string | null {
  const name = fold(tags.name ?? "");
  const den = fold(tags.denomination ?? "");
  if (NOT_EVANGELICAL.test(name) || NOT_EVANGELICAL_TAG.test(den)) return null;
  for (const [re, label] of LABELS) if (re.test(den) || re.test(name)) return label;
  return den || /evangel|cristian|christian|iglesia|templo|ministerio|tabernaculo|congregacion/.test(name) ? "Evangélica" : "Cristiana";
}

interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

export function toChurch(e: OsmElement): Church | null {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!t.name || lat == null || lng == null) return null;
  const denomination = classify(t);
  if (!denomination) return null;
  const city = t["addr:city"] || t["addr:town"] || t["addr:village"] || t["addr:suburb"] || t["addr:place"] || "";
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const hours = t.service_times || t.opening_hours || "";
  return {
    id: `osm-${e.type[0]}${e.id}`,
    name: t.name.trim().slice(0, 120),
    denomination,
    city: city.trim(),
    country: t["addr:country"] === "GT" || !t["addr:country"] ? "Guatemala" : t["addr:country"],
    language: "Español",
    description: [street && `Dirección: ${street}${city ? `, ${city}` : ""}.`, t.description].filter(Boolean).join(" ")
      || "Información pública de OpenStreetMap. Si administras esta iglesia, completa horarios y contacto desde la app.",
    members: 0,
    services: hours ? [{ day: hours.slice(0, 120), time: "", type: "Cultos" }] : [],
    ministries: [],
    pastorId: "",
    contact: {
      phone: t.phone || t["contact:phone"] || "",
      site: t.website || t["contact:website"] || t["contact:facebook"] || "",
      email: t.email || t["contact:email"] || "",
    },
    color: "",
    distanceKm: 0,
    lat,
    lng,
    live: true,
  } as Church;
}

const live = new Map<string, Church>();
/** Una iglesia traída en vivo (para abrir su ficha). */
export const liveChurch = (id: string) => live.get(id) ?? null;

/** Todas las iglesias del mapa en `radiusKm` alrededor del punto (prueba varios servidores). */
export async function nearbyFromOsm(lat: number, lng: number, radiusKm: number): Promise<Church[]> {
  const key = `heseria.osm.${lat.toFixed(2)},${lng.toFixed(2)},${radiusKm}`;
  try {
    const hit = sessionStorage.getItem(key);
    if (hit) return remember(JSON.parse(hit) as Church[]);
  } catch { /* sin almacenamiento */ }
  const r = Math.round(radiusKm * 1000);
  const q = `[out:json][timeout:25];(nwr["amenity"="place_of_worship"]["religion"="christian"](around:${r},${lat},${lng}););out center tags;`;
  let lastError: unknown;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[] };
      const out = json.elements.map(toChurch).filter((c): c is Church => Boolean(c));
      try { sessionStorage.setItem(key, JSON.stringify(out)); } catch { /* lleno */ }
      return remember(out);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function remember(list: Church[]) {
  for (const c of list) live.set(c.id, c);
  return list;
}
