import { Bell, BookMarked, Check, NotebookPen, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { AsyncBoundary, DetailSkeleton, GridSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Chip, Progress, Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { haptic } from "@/native";
import { planService } from "@/services";
import { useLibrary } from "@/store";
import { useScreen } from "@/store/screen";
import { cn, formatCompact } from "@/lib/utils";

/* ------------------------------------------------------------------ list */

export function PlansList() {
  usePageMeta("Planes", "Planes bíblicos y espirituales guiados, día a día.");
  useScreen({ title: "Planes" });

  const [category, setCategory] = useState("Todos");
  const plans = useAsync(() => planService.list(), []);

  const categories = ["Todos", ...new Set((plans.data ?? []).map((p) => p.category))];
  const visible =
    category === "Todos" ? plans.data : plans.data?.filter((p) => p.category === category);
  const active = plans.data?.filter((p) => p.progress > 0) ?? [];

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section>
          <h2 className="mb-3 text-section font-semibold tracking-tight">En curso</h2>
          <div className="space-y-3">
            {active.map((p) => (
              <Link
                key={p.id}
                to={`/plans/${p.id}`}
                className="surface-card flex items-center gap-3.5 p-4 transition-colors active:bg-secondary"
              >
                <GenerativeCover
                  seed={p.id}
                  gradient={p.color}
                  className="size-14 shrink-0"
                  rounded="rounded-xl"
                  icon={BookMarked}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-semibold">{p.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.days.filter((d) => d.done).length} de {p.days.length} días
                  </p>
                  <Progress value={p.progress} className="mt-2" label={`${p.progress} %`} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {categories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={plans.loading}
        error={plans.error}
        data={visible}
        reload={plans.reload}
        skeleton={<GridSkeleton aspect="aspect-video" />}
      >
        {(items) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((p) => (
              <Link
                key={p.id}
                to={`/plans/${p.id}`}
                className="group surface-card overflow-hidden transition-transform active:scale-[0.99]"
              >
                <GenerativeCover
                  seed={p.id}
                  gradient={p.color}
                  rounded="rounded-none"
                  className="aspect-video w-full"
                  icon={BookMarked}
                  label={p.title}
                />
                <div className="p-4">
                  <Badge variant="primary">{p.category}</Badge>
                  <h3 className="mt-2 font-display text-sm font-semibold leading-snug clamp-2">
                    {p.title}
                  </h3>
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" /> {formatCompact(p.participants)} participantes ·{" "}
                    {p.days.length} días
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

/* ---------------------------------------------------------------- detail */

export function PlanDetail() {
  const { id = "" } = useParams();
  const plan = useAsync(() => planService.get(id), [id]);
  const library = useLibrary();

  const [done, setDone] = useState<number[]>([]);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");

  usePageMeta(plan.data?.title ?? "Plan", plan.data?.description);
  useScreen({ title: plan.data?.title ?? "Plan", back: true, hideSections: true }, [plan.data?.id]);

  if (plan.loading) return <DetailSkeleton />;
  const p = plan.data;
  if (!p) return null;

  const completed = p.days.filter((d) => d.done || done.includes(d.day)).length;
  const progress = Math.round((completed / p.days.length) * 100);
  const saved = library.isSaved("course", p.id);

  return (
    <div className="space-y-6">
      <HeroMedia seed={p.id} title={p.title} kind="plan" gradient={p.color} className="flex min-h-48 items-end p-5">
        <div className="relative z-10">
          <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
            {p.category}
          </Badge>
          <h1 className="font-display text-xl font-semibold text-white">{p.title}</h1>
          <p className="mt-1 text-sm text-white/80">
            {p.days.length} días · {formatCompact(p.participants)} participantes
          </p>
        </div>
      </HeroMedia>

      <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
        {p.description}
      </p>

      <div className="surface-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Tu progreso</p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {completed}/{p.days.length} días
          </span>
        </div>
        <Progress value={progress} label={`Progreso: ${progress} %`} />
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button
          className="flex-1"
          onClick={() => toast.success("Plan iniciado. Te recordaremos cada mañana.")}
        >
          Continuar el plan
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            library.toggle("course", p.id);
            toast.success(saved ? "Quitado de guardados" : "Plan guardado");
          }}
        >
          {saved ? "Guardado" : "Guardar"}
        </Button>
        <Button
          variant="outline"
          aria-label="Recordatorio"
          onClick={() => toast.success("Recordatorio diario a las 07:00")}
        >
          <Bell className="size-4" />
        </Button>
      </div>

      <section>
        <h2 className="mb-3 text-section font-semibold tracking-tight">Días del plan</h2>
        <ol className="space-y-2">
          {p.days.map((d) => {
            const isDone = d.done || done.includes(d.day);
            return (
              <li key={d.day} className="surface-card p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    aria-label={isDone ? `Día ${d.day} completado` : `Marcar día ${d.day}`}
                    aria-pressed={isDone}
                    onClick={() => {
                      haptic(isDone ? "light" : "success");
                      setDone((prev) =>
                        prev.includes(d.day) ? prev.filter((x) => x !== d.day) : [...prev, d.day],
                      );
                      planService.markDay(p.id, d.day);
                    }}
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border transition-colors",
                      isDone
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input text-transparent",
                    )}
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", isDone && "text-muted-foreground line-through")}>
                      {d.title}
                    </p>
                    <p className="mt-0.5 text-xs text-primary">{d.passage}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">{d.task}</p>
                    <div className="mt-2.5 flex gap-2">
                      <Button asChild size="sm" variant="subtle">
                        <Link to="/bible">Leer pasaje</Link>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setNoteFor(d.day)}>
                        <NotebookPen className="size-3.5" /> Nota
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <BottomSheet open={noteFor !== null} onOpenChange={(v) => !v && setNoteFor(null)}>
        <BottomSheetContent title={`Nota del día ${noteFor ?? ""}`}>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Escribe tu frase de aplicación…"
            className="min-h-32"
            autoFocus
          />
          <Button
            full
            size="lg"
            className="mt-4"
            disabled={!note.trim()}
            onClick={() => {
              toast.success("Nota guardada");
              setNote("");
              setNoteFor(null);
            }}
          >
            Guardar nota
          </Button>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
