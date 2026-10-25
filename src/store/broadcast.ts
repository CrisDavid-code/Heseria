/**
 * HESERIA — Campañas de notificación.
 *
 * Los envíos manuales, las reglas automáticas y sus métricas viven en el
 * servidor. Enviar una campaña deja una notificación en el buzón de cada
 * destinatario, y esa persona la ve desde cualquier dispositivo.
 *
 * El aviso del sistema operativo con la app cerrada necesita credenciales de
 * FCM y APNs; ver docs/push-notifications.md.
 */
import { useCallback, useEffect, useState } from "react";
import type { ID } from "@/types";
import { broadcastService, type Segment } from "@/services";

export type SegmentId =
  | "todos"
  | "activos"
  | "inactivos"
  | "mi-iglesia"
  | "jovenes"
  | "musicos"
  | "maestros"
  | "creadores";

/**
 * Metadatos de los segmentos. El **tamaño** no está aquí a propósito: lo
 * calcula el servidor contando cuentas reales, y llega con `useSegments`.
 */
export const SEGMENT_META: { id: SegmentId; label: string; description: string }[] = [
  { id: "todos", label: "Todos los usuarios", description: "Cualquiera con la app instalada" },
  { id: "activos", label: "Activos (30 días)", description: "Abrieron la app el último mes" },
  { id: "inactivos", label: "Inactivos (30 días)", description: "No abren la app hace un mes" },
  { id: "mi-iglesia", label: "Mi iglesia", description: "Miembros de tu congregación" },
  { id: "jovenes", label: "Jóvenes", description: "Interés declarado en contenido juvenil" },
  { id: "musicos", label: "Músicos", description: "Equipos de alabanza y estudiantes de música" },
  { id: "maestros", label: "Maestros", description: "Docentes de la Academia" },
  { id: "creadores", label: "Creadores y artistas", description: "Publican contenido en la plataforma" },
];

export const segmentMeta = (id: SegmentId) =>
  SEGMENT_META.find((s) => s.id === id) ?? SEGMENT_META[0];

export type CampaignStatus = "borrador" | "programada" | "enviando" | "enviada";
export type CampaignSource = "manual" | "automatica";

export interface Campaign {
  id: ID;
  title: string;
  body: string;
  segment: SegmentId;
  /** Ruta interna que se abre al tocar la notificación (deep link). */
  href?: string;
  status: CampaignStatus;
  source: CampaignSource;
  createdAt: string;
  scheduledAt?: string;
  sentAt?: string;
  audience: number;
  delivered: number;
  opened: number;
  contentId?: ID;
}

export type AutoEvent =
  | "content.published"
  | "event.created"
  | "devotional.daily"
  | "prayer.answered"
  | "course.published";

export interface AutoRule {
  id: string;
  event: AutoEvent;
  label: string;
  description: string;
  /** Plantilla del mensaje. `{titulo}` se sustituye al dispararse. */
  template: string;
  body?: string;
  segment: SegmentId;
  enabled: boolean;
}

/* ------------------------------------------------------------------ hooks */

function useRemote<T>(load: () => Promise<T>, fallback: T, deps: unknown[] = []) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((result) => {
        if (alive) {
          setData(result);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e : new Error("Error inesperado"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // El llamador decide cuándo recargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload };
}

export function useCampaigns() {
  return useRemote<Campaign[]>(() => broadcastService.campaigns(), []);
}

export function useAutoRules() {
  return useRemote<AutoRule[]>(() => broadcastService.rules(), []);
}

/** Segmentos con el tamaño real de audiencia calculado por el servidor. */
export function useSegments() {
  return useRemote<Segment[]>(
    () => broadcastService.segments(),
    SEGMENT_META.map((s) => ({ ...s, size: 0 })),
  );
}
