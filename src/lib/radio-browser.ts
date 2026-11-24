/**
 * Emisoras cristianas desde Radio Browser (radio-browser.info): directorio abierto y gratuito
 * que comprueba a diario que cada transmisión responda (`lastcheckok`). Heseria no aloja ni
 * retransmite el audio: el reproductor se conecta a la transmisión pública de cada emisora.
 *
 * Se excluyen las católicas y las transmisiones sin https (el navegador las bloquea en una
 * página segura). Las que publica la administración (Administración → Radios) van primero.
 */
import type { RadioStation } from "@/services";

const MIRRORS = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://fi1.api.radio-browser.info"];

interface RbStation {
  stationuuid: string; name: string; url_resolved: string; homepage: string; favicon: string;
  tags: string; country: string; countrycode: string; state: string; language: string; lastcheckok: number; votes: number;
}

const NOT_EVANGELICAL = /catol|cathol|radio maria|radio maría|ewtn|diocesis|diócesis|parroquia|testigos de jehova/i;

/** ¿Es una emisora que corresponde mostrar? (cristiana no católica, https y en línea). */
export function acceptable(s: Pick<RbStation, "name" | "tags" | "url_resolved" | "lastcheckok">): boolean {
  return s.lastcheckok === 1 && /^https:\/\//.test(s.url_resolved) && !NOT_EVANGELICAL.test(`${s.name} ${s.tags}`);
}

function toStation(s: RbStation): RadioStation {
  return {
    id: `rb-${s.stationuuid}`,
    name: s.name.trim().slice(0, 120),
    description: s.tags.split(",").slice(0, 4).join(" · "),
    logo: /^https:\/\//.test(s.favicon) ? s.favicon : "",
    country: s.country || s.countrycode,
    region: s.state ?? "",
    language: /spanish|español/i.test(s.language) || !s.language ? "Español" : s.language,
    categories: s.tags.split(",").filter(Boolean).slice(0, 6),
    site: s.homepage,
    source: "Radio Browser",
    streamUrl: s.url_resolved,
    status: "activa",
    verifiedAt: null,
    rights: "Transmisión pública de la emisora (directorio Radio Browser).",
  };
}

async function query(params: string): Promise<RbStation[]> {
  let last: unknown;
  for (const base of MIRRORS) {
    try {
      const res = await fetch(`${base}/json/stations/search?${params}&hidebroken=true`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as RbStation[];
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

let cache: Promise<RadioStation[]> | null = null;

/** Emisoras cristianas de Guatemala primero y luego de habla hispana, por popularidad. */
export function christianStations(): Promise<RadioStation[]> {
  cache ??= (async () => {
    const gt = ["christian", "cristiana", "evangelica", "gospel", "religious", "christian-gospel"].map((t) => `countrycode=GT&tag=${t}&limit=100`);
    const es = ["cristiana", "evangelica", "christian", "evangelio"].map((t) => `language=spanish&tag=${t}&order=votes&reverse=true&limit=150`);
    const lists = await Promise.allSettled([...gt, "countrycode=GT&name=viva&limit=20", ...es].map(query));
    const seen = new Set<string>();
    const out: RadioStation[] = [];
    for (const r of lists) {
      if (r.status !== "fulfilled") continue;
      for (const s of r.value) {
        if (seen.has(s.stationuuid) || !acceptable(s)) continue;
        seen.add(s.stationuuid);
        out.push(toStation(s));
      }
    }
    if (!out.length && lists.every((r) => r.status === "rejected")) throw new Error("No se pudo cargar el directorio de radios.");
    return out;
  })().catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
}

/** Busca por nombre en todo el directorio (p. ej. una emisora que la persona conoce). */
export async function searchStations(name: string): Promise<RadioStation[]> {
  const list = await query(`name=${encodeURIComponent(name)}&order=votes&reverse=true&limit=40`);
  return list.filter(acceptable).map(toStation);
}
