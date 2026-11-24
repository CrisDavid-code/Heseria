/**
 * HESERIA — Memorizar versículos con repaso espaciado.
 *
 * Se agregan desde el lector («Memorizar este versículo»). Para repasar se ocultan palabras
 * (más mientras más nivel), se pueden pedir pistas y la persona dice si lo recordó: el próximo
 * repaso se aleja (1, 2, 4, 7, 15, 30 días) o vuelve a mañana. El progreso es privado.
 */
import { Brain, Eye, Lightbulb, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { memoryService, type MemoryVerse } from "@/services";
import { useScreen } from "@/store/screen";
import { formatDate } from "@/lib/utils";
import { hideWords as hide } from "@/lib/memorize";

function Practice({ verse, onDone }: { verse: MemoryVerse; onDone: () => void }) {
  const [hints, setHints] = useState(0);
  const [shown, setShown] = useState(false);
  const masked = useMemo(() => hide(verse.text, verse.level, hints), [verse, hints]);

  async function answer(remembered: boolean) {
    try {
      await memoryService.review(verse, remembered);
      toast.success(remembered ? "¡Muy bien! Lo repasarás más adelante." : "Sin problema: lo repasamos mañana.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
      <p className="text-sm font-semibold text-primary">{verse.ref}</p>
      <p className="mt-3 font-display text-lg leading-relaxed" aria-live="polite">{shown ? verse.text : masked}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!shown && (
          <>
            <Button size="sm" variant="outline" onClick={() => setHints((h) => h + 1)}>
              <Lightbulb className="size-3.5" /> Pista
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShown(true)}>
              <Eye className="size-3.5" /> Ver completo
            </Button>
          </>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => void answer(false)}>Aún no</Button>
        <Button onClick={() => void answer(true)}>Lo recordé</Button>
      </div>
    </div>
  );
}

export default function Memorize() {
  usePageMeta("Memorizar", "Guarda la Palabra en tu corazón.");
  useScreen({ title: "Memorizar" });
  const verses = useAsync(() => memoryService.list(), []);
  const [current, setCurrent] = useState<string | null>(null);

  const now = new Date().toISOString();
  const due = (verses.data ?? []).filter((v) => v.nextReview <= now);
  const active = verses.data?.find((v) => v.id === current) ?? due[0];

  return (
    <div className="space-y-5">
      <p className="font-display text-lg">«En mi corazón he guardado tus dichos.» <span className="text-sm text-muted-foreground">Salmos 119:11</span></p>

      {verses.loading ? (
        <ListSkeleton count={3} />
      ) : verses.error ? (
        <ErrorState onRetry={verses.reload} />
      ) : !verses.data?.length ? (
        <EmptyState
          icon={Brain}
          title="Aún no tienes versículos"
          description="En la Biblia, toca un versículo y elige «Memorizar este versículo»."
          actionLabel="Abrir la Biblia"
          actionHref="/bible"
        />
      ) : (
        <>
          {active ? (
            <Practice key={active.id + active.level} verse={active} onDone={() => { setCurrent(null); verses.reload(); }} />
          ) : (
            <p className="rounded-2xl bg-surface-2 p-4 text-sm">¡Al día! No tienes repasos pendientes hoy.</p>
          )}
          <section>
            <h2 className="mb-2 text-section font-semibold">Tus versículos ({verses.data.length})</h2>
            <ul className="space-y-2">
              {verses.data.map((v) => (
                <li key={v.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setCurrent(v.id)}>
                    <span className="block font-medium">{v.ref}</span>
                    <span className="mt-1 block">
                      <Progress value={(v.level / 5) * 100} className="h-1.5" />
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Nivel {v.level}/5 · {v.nextReview <= now ? "repasar hoy" : `próximo repaso ${formatDate(v.nextReview)}`}
                    </span>
                  </button>
                  <Link to={`/bible/${v.book}/${v.chapter}`} className="text-xs font-medium text-primary">Leer</Link>
                  <button
                    type="button"
                    aria-label={`Quitar ${v.ref}`}
                    className="tap-target grid place-items-center rounded-full text-muted-foreground"
                    onClick={async () => {
                      if (!confirm(`¿Quitar ${v.ref} de Memorizar?`)) return;
                      await memoryService.remove(v.id).catch(() => toast.error("No se pudo quitar."));
                      verses.reload();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
