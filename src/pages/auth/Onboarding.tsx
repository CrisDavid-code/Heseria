import {
  ArrowLeft, ArrowRight, BookOpen, Check, Church, Clapperboard, GraduationCap, HandHeart, Heart,
  type LucideIcon, Mic2, Music, Sparkles, Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { HeseriaMark } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import { usePageMeta } from "@/hooks/usePageMeta";
import { authService } from "@/services";
import { preferencesStore, useSession } from "@/store";
import { cn } from "@/lib/utils";

const CONTENT_TYPES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "biblia", label: "Biblia", icon: BookOpen },
  { id: "devocionales", label: "Devocionales", icon: Sparkles },
  { id: "oracion", label: "Oración", icon: Heart },
  { id: "musica", label: "Música", icon: Music },
  { id: "podcasts", label: "Podcasts", icon: Mic2 },
  { id: "sermones", label: "Sermones", icon: Clapperboard },
  { id: "cursos", label: "Cursos", icon: GraduationCap },
  { id: "iglesias", label: "Iglesias", icon: Church },
  { id: "comunidad", label: "Comunidad y grupos", icon: Users },
  { id: "ministerios", label: "Ministerios", icon: HandHeart },
];

const INTERESTS = [
  "Adoración", "Liderazgo", "Familia", "Jóvenes", "Niños", "Discipulado", "Teología",
  "Evangelismo", "Misiones", "Matrimonio", "Finanzas", "Salud mental", "Estudio bíblico",
  "Producción musical", "Instrumentos", "Danza", "Servicio social", "Emprendimiento",
];

const GOALS = [
  { id: "habito", label: "Crear un hábito diario de lectura", description: "Devocional y plan cada mañana." },
  { id: "formacion", label: "Formarme para servir mejor", description: "Cursos de la academia y del ministerio." },
  { id: "comunidad", label: "Encontrar comunidad", description: "Una iglesia y un grupo cerca de mí." },
  { id: "servir", label: "Servir a quien lo necesita", description: "Voluntariado y casos de la fundación." },
];

const STEPS = ["Contenido", "Intereses", "Objetivo"];

export default function Onboarding() {
  usePageMeta("Personaliza Heseria", "Elige qué quieres ver en tu inicio.");
  const navigate = useNavigate();
  const { user, setOnboarded, setUser } = useSession();

  const [step, setStep] = useState(0);
  const [types, setTypes] = useState<string[]>(["biblia", "musica", "cursos"]);
  const [interests, setInterests] = useState<string[]>([]);
  const [goal, setGoal] = useState<string>("");

  const canContinue = step === 0 ? types.length > 0 : step === 1 ? interests.length > 0 : Boolean(goal);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function finish() {
    const chosen = [...types, ...interests];
    preferencesStore.set({ interests: chosen });
    setOnboarded(true);

    // Los intereses viajan con la cuenta: alimentan las recomendaciones y los
    // segmentos de notificación, y siguen ahí en otro dispositivo.
    try {
      const updated = await authService.updateProfile({ interests: chosen, onboarded: true });
      setUser(updated);
    } catch {
      /* sin conexión: quedan guardados en el dispositivo */
    }

    toast.success("Listo. Tu inicio ya está personalizado.");
    navigate("/home", { replace: true });
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-2.5">
            <HeseriaMark />
            <span className="font-display text-lg font-semibold tracking-tight">Heseria</span>
          </div>
          <button
            type="button"
            onClick={() => void finish()}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Omitir por ahora
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10">
        <div className="mb-8">
          <div className="mb-2.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Paso {step + 1} de {STEPS.length} · {STEPS[step]}
            </span>
            <span className="tabular-nums">{Math.round(((step + 1) / STEPS.length) * 100)} %</span>
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} label="Progreso del onboarding" />
        </div>

        {step === 0 && (
          <section>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Hola{user.firstName ? `, ${user.firstName}` : ""}. ¿Qué quieres ver en tu inicio?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Elige todo lo que te interese. Podrás cambiarlo cuando quieras desde Configuración.
            </p>
            <div className="mt-7 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {CONTENT_TYPES.map((c) => {
                const active = types.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(types, setTypes, c.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3.5 text-left text-sm transition-all",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:border-foreground/25",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg transition-colors",
                        active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {active ? <Check className="size-4" /> : <c.icon className="size-4" />}
                    </span>
                    <span className="font-medium">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              ¿Sobre qué temas quieres crecer?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Con esto afinamos tus recomendaciones de cursos, sermones y planes.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {INTERESTS.map((i) => {
                const active = interests.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(interests, setInterests, i)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/12 font-medium text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                    )}
                  >
                    {i}
                  </button>
                );
              })}
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              {interests.length} seleccionados · elige al menos uno
            </p>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              ¿Cuál es tu objetivo ahora mismo?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ordenamos tu inicio alrededor de esto.
            </p>
            <div className="mt-7 space-y-2.5">
              {GOALS.map((g) => {
                const active = goal === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGoal(g.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all",
                      active ? "border-primary bg-primary/10" : "border-border hover:border-foreground/25",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{g.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{g.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-10 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="size-4" /> Atrás
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue} size="lg">
              Continuar <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => void finish()} disabled={!canContinue} size="lg">
              Entrar a Heseria <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
