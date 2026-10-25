/**
 * HESERIA — Reporte automático de fallas (se envían solas a Administración → Comentarios).
 *
 * - Pantallas que fallan: ErrorBoundary llama a `reportError`.
 * - Errores sueltos (una promesa rechazada, un script que truena): `watchErrors` desde main.tsx
 *   los reporta y avisa con un toque para contar más.
 * Cada falla distinta se envía una sola vez por sesión, y como mucho 5, para no inundar.
 */
import { toast } from "sonner";
import { sendFeedback } from "@/services";

const seen = new Set<string>();
const MAX = 5;

/** Ruido conocido de los navegadores que no es una falla de la app. */
const NOISE = /ResizeObserver loop|^Script error\.?$|Network request failed|Failed to fetch|Load failed|AbortError|cancel/i;

export async function reportError(err: unknown, extra = ""): Promise<boolean> {
  const e = err instanceof Error ? err : new Error(String(err ?? "Error desconocido"));
  const key = `${e.message}|${location.pathname}`;
  if (seen.has(key) || seen.size >= MAX) return true;
  seen.add(key);
  try {
    await sendFeedback({
      type: "bug",
      screen: location.pathname,
      message: `Error automático: ${e.message}\n\n${(e.stack ?? "").slice(0, 1500)}${extra ? `\n\n${extra}` : ""}`,
    });
    return true;
  } catch {
    seen.delete(key);
    return false;
  }
}

export function watchErrors() {
  const handle = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err ?? "");
    if (!message || NOISE.test(message)) return;
    void reportError(err).then((ok) => {
      if (!ok) return;
      toast("Encontramos una falla y ya la reportamos", {
        description: "La revisaremos pronto. Si quieres, cuéntanos qué hacías.",
        duration: 8000,
        action: { label: "Contar más", onClick: () => location.assign("/feedback") },
      });
    });
  };
  window.addEventListener("error", (e) => handle(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => handle(e.reason));
}
