/**
 * HESERIA — Sugerir una función o reportar una falla (módulo 10 del skill).
 *
 * Se usa en Configuración y en la pantalla pública `/feedback`, así una falla
 * al entrar también puede reportarse. La captura es opcional y se comprime en
 * el teléfono antes de enviarla.
 */
import { ImagePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { sendFeedback } from "@/services";
import { cn } from "@/lib/utils";

export function FeedbackForm({
  screen,
  allowIdea = true,
  onSent,
}: {
  screen: string;
  /** Las sugerencias piden sesión (reglas); sin ella solo se reportan fallas. */
  allowIdea?: boolean;
  onSent?: () => void;
}) {
  const [type, setType] = useState<"bug" | "idea">("bug");
  const [message, setMessage] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!shot) return setPreview("");
    const url = URL.createObjectURL(shot);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [shot]);

  async function send() {
    setBusy(true);
    try {
      await sendFeedback({ type, message: message.trim(), screen, screenshot: type === "bug" ? shot : null });
      setMessage("");
      setShot(null);
      toast.success("Gracias. Lo leerá la administración.");
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {allowIdea && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de comentario">
          {(["bug", "idea"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={type === k}
              onClick={() => setType(k)}
              className={cn(
                "rounded-full border px-3 py-2 text-sm font-medium",
                type === k ? "border-primary bg-primary/10 text-primary" : "border-border",
              )}
            >
              {k === "bug" ? "Reportar una falla" : "Sugerir una función"}
            </button>
          ))}
        </div>
      )}
      <Textarea
        className="mt-3"
        value={message}
        maxLength={4000}
        aria-label={type === "bug" ? "Describe la falla" : "Describe tu idea"}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={
          type === "bug"
            ? "¿Qué pasó, en qué pantalla y qué estabas haciendo?"
            : "¿Qué función te gustaría ver en Heseria y para qué te serviría?"
        }
      />
      {type === "bug" && (
        <div className="mt-3">
          {preview ? (
            <div className="relative inline-block">
              <img src={preview} alt="Captura adjunta" className="max-h-40 rounded-lg border border-border" />
              <button
                type="button"
                onClick={() => setShot(null)}
                aria-label="Quitar captura"
                className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-foreground text-background"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-primary">
              <ImagePlus className="size-4" /> Adjuntar captura de pantalla (opcional)
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setShot(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Se envía también el modelo de navegador, el tamaño de pantalla y la versión de la app para
        reproducir el problema. Nada más.
      </p>
      <Button full size="lg" className="mt-3" loading={busy} disabled={message.trim().length < 5} onClick={() => void send()}>
        Enviar
      </Button>
    </div>
  );
}
