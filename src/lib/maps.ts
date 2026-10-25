/**
 * HESERIA — Enlaces a la app de mapas.
 *
 * No hace falta ninguna clave para esto: son enlaces universales de Google
 * Maps. En el teléfono los recoge la app de mapas instalada y en el navegador
 * se abren en la web. Con coordenadas apunta al punto exacto; sin ellas, busca
 * por nombre y ciudad, que es lo mejor que se puede hacer con esa información.
 */

/** A dónde se quiere llegar. */
export interface MapTarget {
  lat?: number | null;
  lng?: number | null;
  /** Nombre del lugar, para buscarlo cuando no hay coordenadas. */
  label?: string;
  /** Ciudad o dirección, para acotar la búsqueda. */
  address?: string;
}

function destination(target: MapTarget): string {
  if (Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
    return `${target.lat},${target.lng}`;
  }
  return [target.label, target.address].filter(Boolean).join(", ");
}

/** Cómo llegar: abre la ruta desde donde esté la persona. */
export function directionsUrl(target: MapTarget): string {
  const params = new URLSearchParams({ api: "1", destination: destination(target) });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Ver el lugar en el mapa, sin ruta. */
export function placeUrl(target: MapTarget): string {
  const params = new URLSearchParams({ api: "1", query: destination(target) });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
