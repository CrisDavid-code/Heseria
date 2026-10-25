import { BookOpen, GraduationCap, HandHeart, Music, Users } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import { HeseriaMark } from "@/components/layout/Brand";

const PILLARS = [
  { icon: BookOpen, label: "Biblia, devocionales y planes", short: "Biblia" },
  { icon: Music, label: "Música, sermones y podcasts", short: "Música" },
  { icon: GraduationCap, label: "Academia y formación ministerial", short: "Cursos" },
  { icon: Users, label: "Iglesias, grupos y comunidad", short: "Comunidad" },
  { icon: HandHeart, label: "Fundación e impacto social", short: "Ayuda social" },
];

/**
 * Two-column on desktop: a branded panel on the left, the form on the right.
 * On mobile the panel collapses to a compact header so the form stays above the fold.
 */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden hero-gradient bg-surface-2 p-10 lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_10%_0%,rgba(34,211,238,0.18),transparent_60%)]" />
        <Link to="/" className="relative z-10 flex items-center gap-2.5">
          <HeseriaMark />
          <span className="font-display text-lg font-semibold tracking-tight">Heseria</span>
        </Link>

        <div className="relative z-10 my-auto max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Un ecosistema digital para vivir, aprender, compartir y servir la fe.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Todo lo que tu vida espiritual y tu iglesia necesitan, en un solo lugar y con una sola
            cuenta.
          </p>
          <ul className="mt-8 space-y-3">
            {PILLARS.map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-primary">
                  <p.icon className="size-4" />
                </span>
                {p.label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-muted-foreground">
          Heseria · Plataforma en desarrollo. Los datos mostrados son de demostración.
        </p>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 pt-safe sm:px-10">
        {/*
          En el teléfono el panel de la izquierda no existe, así que la
          presentación va aquí: quien abre la app por primera vez tiene que
          entender de qué se trata antes de que le pidan un correo.
        */}
        <div className="mb-7 lg:hidden">
          <Link to="/" className="flex items-center gap-2.5">
            <HeseriaMark />
            <span className="font-display text-lg font-semibold tracking-tight">Heseria</span>
          </Link>

          <p className="mt-4 font-display text-xl font-semibold leading-snug tracking-tight">
            Tu vida de fe, en un solo lugar.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Biblia y devocionales cada día, música y enseñanza, cursos, tu iglesia y
            una comunidad que ora contigo.
          </p>

          <ul className="mt-4 flex flex-wrap gap-1.5">
            {PILLARS.map((p) => (
              <li
                key={p.label}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[0.7rem] text-muted-foreground"
              >
                <p.icon className="size-3 text-primary" />
                {p.short}
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto w-full max-w-sm">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
