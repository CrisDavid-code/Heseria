import {
  ArrowRight, BookOpen, Church, GraduationCap, HandHeart, Heart, Music, Sparkles, Users,
} from "lucide-react";
import { InstallInvite } from "@/components/InstallInvite";
import { Link } from "react-router-dom";
import { HeseriaMark } from "@/components/layout/Brand";
import { GenerativeCover } from "@/components/media/covers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { usePageMeta } from "@/hooks/usePageMeta";
import { foundationCases } from "@/store/directory";

const PILLARS = [
  {
    icon: BookOpen,
    title: "Biblia y crecimiento",
    body: "Lectura con notas, resaltados y progreso. Devocionales diarios y planes guiados para cada temporada de la vida.",
    href: "/bible",
    gradient: "from-cyan-500/70 to-blue-700/70",
  },
  {
    icon: Music,
    title: "Música y adoración",
    body: "Artistas, álbumes y playlists con un reproductor que te acompaña mientras navegas por el resto de la plataforma.",
    href: "/music",
    gradient: "from-fuchsia-400/70 to-indigo-800/70",
  },
  {
    icon: GraduationCap,
    title: "Academia",
    body: "Cursos de Biblia, teología, liderazgo y formación musical, con módulos, tareas, evaluaciones y certificado.",
    href: "/academy",
    gradient: "from-lime-400/70 to-teal-800/70",
  },
  {
    icon: Church,
    title: "Iglesias y comunidad",
    body: "Encuentra iglesias cerca, únete a grupos, conversa y organiza tu ministerio desde un mismo panel.",
    href: "/churches",
    gradient: "from-teal-400/70 to-emerald-700/70",
  },
  {
    icon: Heart,
    title: "Oración",
    body: "Comparte peticiones, ora por otros y celebra las respuestas con testimonios de tu comunidad.",
    href: "/prayer",
    gradient: "from-rose-400/70 to-purple-800/70",
  },
  {
    icon: HandHeart,
    title: "Impacto social",
    body: "Casos verificados, donaciones transparentes y voluntariado coordinado con iglesias locales.",
    href: "/foundation",
    gradient: "from-amber-400/70 to-orange-700/70",
  },
];

const AUDIENCES = [
  { label: "Creadores", body: "Publica videos, cursos y contenido con estadísticas reales de tu audiencia." },
  { label: "Artistas", body: "Sube tu música, gestiona álbumes y conecta con las iglesias que te escuchan." },
  { label: "Maestros", body: "Construye cursos con módulos, tareas y certificados desde el portal docente." },
  { label: "Pastores", body: "Administra miembros, grupos, ministerios, eventos y donaciones de tu iglesia." },
];

/** Lo que la app ya trae, sin cifras que dependan de cuánto contenido se haya publicado. */
const HIGHLIGHTS = [
  { title: "8 versiones", body: "RVR1960, NTV, LBLA, DHH, TLA y más" },
  { title: "Sin conexión", body: "La Biblia se lee aunque no haya internet" },
  { title: "Gratis", body: "Crea tu cuenta y empieza hoy" },
  { title: "En todo dispositivo", body: "Android, iPhone y computadora" },
];

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <HeseriaMark />
          <span className="font-display text-lg font-semibold tracking-tight">Heseria</span>
        </Link>
        <nav className="ml-6 hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          <a href="#ecosistema" className="transition-colors hover:text-foreground">Ecosistema</a>
          <a href="#para-quien" className="transition-colors hover:text-foreground">Para quién</a>
          <a href="#impacto" className="transition-colors hover:text-foreground">Impacto</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Iniciar sesión</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/register">Comenzar</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export default function Landing() {
  usePageMeta(
    "Heseria — Un ecosistema digital para vivir la fe",
    "Biblia, devocionales, música, cursos, iglesias, comunidad e impacto social en una sola plataforma.",
  );

  return (
    <div className="min-h-dvh bg-background">
      <Header />

      {/* ------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden hero-gradient">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <Badge variant="primary" size="md" className="mb-6">
            <Sparkles className="size-3" /> Plataforma cristiana global
          </Badge>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.03] tracking-tight sm:text-6xl">
            Heseria
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Un ecosistema digital para vivir, aprender, compartir y servir la fe.
          </p>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Biblia, devocionales, música, podcasts, sermones, academia, iglesias, comunidad y ayuda
            social. Todo conectado, con una sola cuenta.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/register">
                Comenzar <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/explore">Explorar</Link>
            </Button>
          </div>
          <InstallInvite className="mt-8 max-w-md" />
          <p className="mt-4 text-sm text-muted-foreground">
            ¿Prefieres la app de Android?{" "}
            <a href="https://github.com/CrisDavid-code/Heseria/releases/download/heseria-android/heseria.apk" className="font-medium text-primary hover:underline">
              Descargar APK
            </a>
          </p>

          <ul className="mt-14 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title}>
                <p className="font-display text-lg font-semibold">{h.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{h.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------- ecosistema */}
      <section id="ecosistema" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight">
          No es una colección de herramientas. Es un solo ecosistema.
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Pasas de un sermón a su pasaje bíblico, de ahí al curso del predicador, a la playlist de su
          iglesia y al grupo donde lo conversas. Sin cambiar de aplicación.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <Link
              key={p.title}
              to={p.href}
              className="group surface-card overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-soft)]"
            >
              <GenerativeCover
                seed={p.title}
                gradient={p.gradient}
                rounded="rounded-none"
                className="aspect-3/1 w-full"
              />
              <div className="p-5">
                <span className="mb-3 grid size-9 place-items-center rounded-lg border border-border bg-surface-2 text-primary">
                  <p.icon className="size-4" />
                </span>
                <h3 className="font-display text-base font-semibold transition-colors group-hover:text-primary">
                  {p.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- para quién */}
      <section id="para-quien" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          Una plataforma, muchas maneras de servir
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Heseria se adapta a tu rol: lo que ves, publicas y administras cambia contigo.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <div key={a.label} className="surface-card p-5">
              <p className="font-display text-base font-semibold">{a.label}</p>
              <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- impacto */}
      <section id="impacto" className="border-t border-border py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-2 lg:items-center">
          <div>
            <Badge variant="primary" size="md" className="mb-5">
              <HandHeart className="size-3" /> Fundación Heseria
            </Badge>
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              La fe se demuestra sirviendo
            </h2>
            <p className="mt-3 text-muted-foreground">
              Cada caso lo verifica un equipo local junto a iglesias de la zona, con necesidades
              concretas, avance visible y actualizaciones periódicas. Puedes donar, ser voluntario o
              difundir.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/foundation">Conocer la fundación</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/foundation/volunteer">
                  <Users className="size-4" /> Ser voluntario
                </Link>
              </Button>
            </div>
          </div>
          {foundationCases.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {foundationCases.slice(0, 4).map((c) => (
              <div key={c.id} className="surface-card overflow-hidden">
                <GenerativeCover
                  seed={c.id}
                  gradient={c.color}
                  rounded="rounded-none"
                  className="aspect-video w-full"
                />
                <div className="p-3.5">
                  <p className="text-sm font-medium clamp-2">{c.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.location}</p>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------------- cta */}
      <section className="border-t border-border hero-gradient">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Empieza hoy tu camino en Heseria
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Crea tu cuenta gratis, elige tus intereses y encuentra tu comunidad.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">
                Comenzar <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <HeseriaMark className="size-6 text-xs" />
            <span>Heseria · {new Date().getFullYear()}</span>
          </div>
          <p>
            <Link to="/feedback" className="hover:text-foreground">Reportar una falla</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
