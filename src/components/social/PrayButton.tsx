/**
 * «Estoy orando»: corazón rojo cuando ya oras, conteo de quienes oran y se puede quitar.
 * El estado inicial viene de la base (prayers/{id}/prayedBy/{uid}).
 */
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { haptic } from "@/native";
import { prayerService } from "@/services";
import { cn } from "@/lib/utils";

export function PrayButton({ id, count: initial, className }: { id: string; count: number; className?: string }) {
  const [praying, setPraying] = useState(false);
  const [count, setCount] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void prayerService.prayedByMe(id).then((v) => alive && setPraying(v), () => undefined);
    return () => { alive = false; };
  }, [id]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    haptic(praying ? "light" : "success");
    // Se ve al instante; luego se ajusta a lo que diga la base.
    setPraying(!praying);
    setCount((n) => Math.max(0, n + (praying ? -1 : 1)));
    try {
      const r = await prayerService.pray(id);
      setCount(r.prayingCount);
      if (!praying) toast.success("Gracias por orar. Se lo hicimos saber.");
    } catch (err) {
      setPraying(praying);
      setCount(initial);
      toast.error(err instanceof Error ? err.message : "No se pudo registrar tu oración.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={praying}
      aria-label={praying ? "Dejar de marcar que oro" : "Estoy orando"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        praying ? "border-rose-500/40 bg-rose-500/10 text-rose-500" : "border-border text-muted-foreground active:bg-secondary",
        className,
      )}
    >
      <Heart className={cn("size-4", praying && "fill-rose-500 text-rose-500")} />
      {praying ? "Orando" : "Estoy orando"}
      <span className="tabular-nums">· {count}</span>
    </button>
  );
}
