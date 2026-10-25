/**
 * HESERIA — Mapa de verdad.
 *
 * Si el servidor tiene configurada una clave de Google Maps, esto es Google
 * Maps: calles, satélite, zoom y los marcadores donde de verdad están. Si no la
 * tiene, en lugar de mentir con un mapa de adorno se dibuja un radar honesto:
 * cada iglesia en su rumbo y a su distancia real respecto de donde estás, con
 * los anillos de kilómetros marcados. Sirve para orientarse, y se ve que no es
 * una foto de satélite.
 *
 * La clave de Google Maps es de navegador (va en la app) y la protegen sus
 * restricciones en la consola de Google, no ocultarla. Si no hay clave, radar.
 */
import { Compass, MapPin, Navigation } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { openExternal } from "@/native";
import { placeUrl, type MapTarget } from "@/lib/maps";
import { cn } from "@/lib/utils";

export interface GeoPoint {
  id: string;
  label: string;
  meta?: string;
  lat?: number;
  lng?: number;
}

/** Clave de navegador de Google Maps. Vacía: se usa el radar. */
const MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) ?? "";
const GUATEMALA = { lat: 14.6349, lng: -90.5069 };

export function GeoMap({
  title,
  subtitle,
  center,
  points = [],
  radiusKm,
  onSelect,
  className,
}: {
  title: string;
  subtitle?: string;
  /** Dónde estás. Si no hay GPS todavía, se centra en el primer punto. */
  center?: { lat: number; lng: number } | null;
  points?: GeoPoint[];
  radiusKm?: number;
  onSelect?: (point: GeoPoint) => void;
  className?: string;
}) {
  const located = Boolean(center);
  const fallbackCenter = points.find((p) => p.lat != null && p.lng != null);
  const origin =
    center ??
    (fallbackCenter?.lat != null && fallbackCenter.lng != null
      ? { lat: fallbackCenter.lat, lng: fallbackCenter.lng }
      : GUATEMALA);

  const withCoords = points.filter(
    (p): p is GeoPoint & { lat: number; lng: number } => p.lat != null && p.lng != null,
  );

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border", className)}>
      {MAPS_KEY ? (
        <GoogleCanvas
          apiKey={MAPS_KEY}
          origin={origin}
          located={located}
          points={withCoords}
          radiusKm={radiusKm}
          onSelect={onSelect}
        />
      ) : (
        <RadarCanvas
          origin={origin}
          located={located}
          points={withCoords}
          radiusKm={radiusKm}
          onSelect={onSelect}
          loading={false}
        />
      )}

      <div className="border-t border-border px-3.5 py-2.5">
        <p className="text-sm font-medium">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      {points.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {points.slice(0, 4).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect?.(p)}
                disabled={!onSelect}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors enabled:active:bg-secondary"
              >
                <Navigation className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm">{p.label}</span>
                {p.meta && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.meta}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------- Google Maps */

/** Carga el script de Google Maps una sola vez por sesión. */
let googleLoader: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (googleLoader) return googleLoader;

  googleLoader = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Sin navegador."));
      return;
    }
    if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    const params = new URLSearchParams({ key: apiKey, v: "weekly", language: "es", region: "GT" });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleLoader = null; // Para poder reintentar si vuelve la red.
      reject(new Error("No se pudo cargar Google Maps."));
    };
    document.head.appendChild(script);
  });

  return googleLoader;
}

type GoogleNamespace = {
  maps: {
    Map: new (el: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMarker;
    Circle: new (options: Record<string, unknown>) => { setMap(map: unknown): void };
    LatLngBounds: new () => { extend(p: { lat: number; lng: number }): void };
    SymbolPath: { CIRCLE: unknown };
  };
};
interface GoogleMapInstance {
  fitBounds(bounds: unknown, padding?: number): void;
  setCenter(p: { lat: number; lng: number }): void;
  setZoom(z: number): void;
}
interface GoogleMarker {
  addListener(event: string, handler: () => void): void;
  setMap(map: unknown): void;
}

function GoogleCanvas({
  apiKey,
  origin,
  located,
  points,
  radiusKm,
  onSelect,
}: {
  apiKey: string;
  origin: { lat: number; lng: number };
  located: boolean;
  points: (GeoPoint & { lat: number; lng: number })[];
  radiusKm?: number;
  onSelect?: (point: GeoPoint) => void;
}) {
  const node = useRef<HTMLDivElement | null>(null);
  const map = useRef<GoogleMapInstance | null>(null);
  const drawn = useRef<{ setMap(map: unknown): void }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void loadGoogleMaps(apiKey)
      .then(() => {
        if (!alive || !node.current) return;
        const google = (window as unknown as { google: GoogleNamespace }).google;

        map.current ??= new google.maps.Map(node.current, {
          center: origin,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });

        // Se borra lo pintado antes: los resultados cambian con cada filtro.
        for (const item of drawn.current) item.setMap(null);
        drawn.current = [];

        if (located) {
          const you = new google.maps.Marker({
            map: map.current,
            position: origin,
            title: "Tu ubicación",
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: "#22d3ee",
              fillOpacity: 1,
              strokeColor: "#0e7490",
              strokeWeight: 2,
            },
          });
          drawn.current.push(you);

          if (radiusKm) {
            const ring = new google.maps.Circle({
              map: map.current,
              center: origin,
              radius: radiusKm * 1000,
              strokeColor: "#22d3ee",
              strokeOpacity: 0.5,
              strokeWeight: 1,
              fillColor: "#22d3ee",
              fillOpacity: 0.06,
            });
            drawn.current.push(ring);
          }
        }

        for (const point of points) {
          const marker = new google.maps.Marker({
            map: map.current,
            position: { lat: point.lat, lng: point.lng },
            title: point.meta ? `${point.label} · ${point.meta}` : point.label,
          });
          if (onSelect) marker.addListener("click", () => onSelect(point));
          drawn.current.push(marker);
        }

        if (points.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          if (located) bounds.extend(origin);
          for (const p of points) bounds.extend({ lat: p.lat, lng: p.lng });
          map.current.fitBounds(bounds, 48);
        } else {
          map.current.setCenter(origin);
          map.current.setZoom(located ? 14 : 11);
        }
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      });

    return () => {
      alive = false;
    };
  }, [apiKey, origin.lat, origin.lng, located, radiusKm, points, onSelect]);

  if (error) {
    return (
      <div className="grid h-52 place-items-center bg-surface-2 px-6 text-center">
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  return <div ref={node} className="h-52 w-full bg-surface-2" role="application" aria-label="Mapa" />;
}

/* ------------------------------------------------------------- el radar */

const EARTH_KM = 6371;

/** Distancia en kilómetros entre dos coordenadas (fórmula del haversine). */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo en radianes desde `a` hacia `b`, con el norte arriba. */
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x);
}

function RadarCanvas({
  origin,
  located,
  points,
  radiusKm,
  onSelect,
  loading,
}: {
  origin: { lat: number; lng: number };
  located: boolean;
  points: (GeoPoint & { lat: number; lng: number })[];
  radiusKm?: number;
  onSelect?: (point: GeoPoint) => void;
  loading: boolean;
}) {
  const placed = useMemo(() => {
    const measured = points.map((p) => ({
      point: p,
      km: distanceKm(origin, p),
      rad: bearing(origin, p),
    }));
    // La escala la marca la iglesia más lejana que se muestra, no el radio de
    // búsqueda: si no, con un radio de 25 km todo quedaría apiñado en el centro.
    const furthest = Math.max(...measured.map((m) => m.km), 0.5);

    return measured.map(({ point, km, rad }) => {
      // El radio se reparte de 0 a 44 % del alto, para que nada toque el borde.
      const r = (km / furthest) * 44;
      return {
        point,
        km,
        left: 50 + r * Math.sin(rad),
        top: 50 - r * Math.cos(rad),
      };
    });
  }, [origin.lat, origin.lng, points, radiusKm]);

  const scale = Math.max(...placed.map((p) => p.km), 0.5);

  return (
    <div className="relative h-52 overflow-hidden bg-surface-2">
      {/*
        Todo el radar vive en un cuadrado centrado. Si se estirara al ancho de
        la tarjeta, los anillos saldrían ovalados y los rumbos mentirían: algo
        al noreste aparecería casi al este.
      */}
      <div className="absolute left-1/2 top-0 aspect-square h-full -translate-x-1/2">
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <ellipse
              key={f}
              cx="50"
              cy="50"
              rx={44 * f}
              ry={44 * f}
              fill="none"
              stroke="currentColor"
              strokeOpacity={f === 1 ? 0.22 : 0.1}
              strokeWidth="0.4"
              className="text-foreground"
            />
          ))}
          <line x1="50" y1="6" x2="50" y2="94" stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.4" className="text-foreground" />
          <line x1="6" y1="50" x2="94" y2="50" stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.4" className="text-foreground" />
        </svg>

        {/* El norte, para que los rumbos se lean. */}
        <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[0.6rem] font-semibold text-muted-foreground">
          N
        </span>

        {located && (
          <span
            className="absolute left-1/2 top-1/2 grid size-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary ring-4 ring-primary/20"
            aria-label="Tu ubicación"
          />
        )}

        {placed.slice(0, 12).map(({ point, km, left, top }) => (
          <button
            key={point.id}
            type="button"
            onClick={() => onSelect?.(point)}
            disabled={!onSelect}
            style={{ left: `${left}%`, top: `${top}%` }}
            className="absolute -translate-x-1/2 -translate-y-full"
            aria-label={`${point.label}, a ${km.toFixed(1)} kilómetros`}
            title={`${point.label} · ${km.toFixed(1)} km`}
          >
            <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background">
              <MapPin className="size-3.5" />
            </span>
          </button>
        ))}
      </div>

      <span className="absolute bottom-2 left-2.5 flex items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-[0.6rem] text-muted-foreground backdrop-blur">
        <Compass className="size-3" />
        {loading ? "Cargando mapa…" : `Distancias reales · anillo exterior ${scale < 10 ? scale.toFixed(1) : scale.toFixed(0)} km`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------ lugar sin GPS */

/**
 * Un lugar del que solo sabemos su nombre y su ciudad: un salón alquilado, una
 * comunidad rural. Dibujar un mapa ahí sería inventarse una posición, así que
 * se muestra la dirección y se deja que la app de mapas la busque, que es donde
 * esa búsqueda se hace bien.
 */
export function PlaceLink({
  title,
  subtitle,
  target,
  className,
}: {
  title: string;
  subtitle?: string;
  target: MapTarget;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void openExternal(placeUrl(target))}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-border p-3.5 text-left transition-colors active:bg-secondary",
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
        <MapPin className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      <span className="shrink-0 text-xs font-medium text-primary">Ver en el mapa</span>
    </button>
  );
}
