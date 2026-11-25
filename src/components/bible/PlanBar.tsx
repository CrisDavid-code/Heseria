/**
 * Al leer desde un plan (/bible/genesis/1?plan=…&dia=…): barra con el día, en qué capítulo va
 * («2 de 3»), el siguiente capítulo del plan y «Terminar el día», que lo marca y vuelve al plan.
 */
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/hooks/useAsync";
import { passageChapters } from "@/lib/reference";
import { haptic } from "@/native";
import { planService } from "@/services";
import { bibleBooks } from "@/store/directory";

export function PlanBar({ book, chapter }: { book: string; chapter: number }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const planId = params.get("plan");
  const day = Number(params.get("dia"));
  const plan = useAsync(async () => (planId ? planService.get(planId) : null), [planId]);
  if (!planId || !day || !plan.data) return null;

  const d = plan.data.days.find((x) => x.day === day);
  if (!d) return null;
  const chapters = passageChapters(d.passage, bibleBooks);
  const i = chapters.findIndex((c) => c.book === book && c.chapter === chapter);
  const next = i >= 0 ? chapters[i + 1] : undefined;
  const back = `/plans/${planId}#dia-${day}`;
  // Se llegó desde el plan: regresar a esa misma entrada (sin duplicarla en el historial).
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(back, { replace: true });
  };

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2">
        <button type="button" onClick={goBack} aria-label="Volver al plan" className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground">
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{plan.data.title} · Día {day}</p>
          <p className="truncate text-sm font-medium">
            {d.passage}
            {chapters.length > 1 && i >= 0 && <span className="text-muted-foreground"> · {i + 1} de {chapters.length}</span>}
          </p>
        </div>
        {next ? (
          <Button size="sm" onClick={() => navigate(`/bible/${next.book}/${next.chapter}?plan=${planId}&dia=${day}`, { replace: true })}>
            {next.name} {next.chapter} <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={async () => {
              haptic("success");
              await planService.markDay(planId, day).catch(() => undefined);
              toast.success(`¡Día ${day} completado!`);
              goBack();
            }}
          >
            <Check className="size-4" /> Terminar el día
          </Button>
        )}
      </div>
    </div>
  );
}
