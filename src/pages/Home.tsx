import {
  ArrowRight, BookOpen, CalendarDays, Church, FileText, GraduationCap, HandHeart, Heart,
  type LucideIcon, Mic2, Music, Play, Sparkles, Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ChurchCard, ContinueCard, EventCard, FoundationCaseCard, MediaCard, Rail,
} from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { AsyncBoundary, RailSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge, Progress } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatCompact, timeAgo } from "@/lib/utils";
import { users } from "@/store/directory";
import {
  bibleService, churchService, communityService, devotionalService, eventService,
  foundationService, planService, prayerService, recommendationService,
} from "@/services";
import { trackFromSong, usePlayer, useSession } from "@/store";
import { songs } from "@/store/directory";
import type { Role } from "@/types";

/* ------------------------------------------------------- role quick links */

const QUICK_LINKS: Partial<Record<Role, { label: string; href: string; icon: LucideIcon }[]>> = {
  pastor: [
    { label: "Mis sermones", href: "/church-admin/sermons", icon: Mic2 },
    { label: "Miembros", href: "/church-admin/members", icon: Users },
    { label: "Peticiones", href: "/church-admin/prayer", icon: Heart },
    { label: "Eventos", href: "/church-admin/events", icon: CalendarDays },
  ],
  church_admin: [
    { label: "Panel de iglesia", href: "/church-admin", icon: Church },
    { label: "Miembros", href: "/church-admin/members", icon: Users },
    { label: "Contenido", href: "/church-admin/content", icon: FileText },
    { label: "Eventos", href: "/church-admin/events", icon: CalendarDays },
  ],
  teacher: [
    { label: "Mis cursos", href: "/teacher/courses", icon: GraduationCap },
    { label: "Estudiantes", href: "/teacher/students", icon: Users },
    { label: "Evaluaciones", href: "/teacher/evaluations", icon: BookOpen },
    { label: "Certificados", href: "/teacher/certificates", icon: Sparkles },
  ],
  musician: [
    { label: "Playlists", href: "/music/playlists", icon: Music },
    { label: "Cursos de música", href: "/academy", icon: GraduationCap },
    { label: "Ministerios", href: "/ministries", icon: Users },
    { label: "Próximos eventos", href: "/events", icon: CalendarDays },
  ],
  artist: [
    { label: "Mi música", href: "/artist/music", icon: Music },
    { label: "Estadísticas", href: "/artist/analytics", icon: Sparkles },
    { label: "Mis eventos", href: "/artist/events", icon: CalendarDays },
    { label: "Álbumes", href: "/artist/albums", icon: Music },
  ],
  creator: [
    { label: "Mi contenido", href: "/creator/content", icon: BookOpen },
    { label: "Publicar video", href: "/creator/videos", icon: Play },
    { label: "Estadísticas", href: "/creator/analytics", icon: Sparkles },
    { label: "Comunidad", href: "/community", icon: Users },
  ],
  missionary: [
    { label: "Casos de ayuda", href: "/foundation/cases", icon: HandHeart },
    { label: "Voluntariado", href: "/foundation/volunteer", icon: Users },
    { label: "Oración", href: "/prayer", icon: Heart },
    { label: "Comunidad", href: "/community", icon: Users },
  ],
  admin: [
    { label: "Panel global", href: "/admin", icon: Sparkles },
    { label: "Moderación", href: "/admin/moderation", icon: Users },
    { label: "Iglesias", href: "/admin/churches", icon: Church },
    { label: "Reportes", href: "/admin/reports", icon: BookOpen },
  ],
};

const DEFAULT_QUICK: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Leer la Biblia", href: "/bible", icon: BookOpen },
  { label: "Devocional de hoy", href: "/devotionals", icon: Sparkles },
  { label: "Escuchar música", href: "/music", icon: Music },
  { label: "Orar por alguien", href: "/prayer", icon: Heart },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

const userById = (id: string) => users.find((u) => u.id === id);

/* -------------------------------------------------------------------- page */

export default function Home() {
  const { user, role } = useSession();
  const player = usePlayer();
  usePageMeta("Inicio", "Tu inicio personalizado en Heseria.");

  const verse = useAsync(() => bibleService.verseOfTheDay(), []);
  const devotional = useAsync(() => devotionalService.today(), []);
  const plans = useAsync(() => planService.list(), []);
  const watching = useAsync(() => recommendationService.continueWatching(), []);
  const listening = useAsync(() => recommendationService.continueListening(), []);
  const rows = useAsync(() => recommendationService.forYou(role), [role]);
  const nearby = useAsync(() => churchService.nearby(), []);
  const events = useAsync(() => eventService.upcoming(), []);
  const prayers = useAsync(() => prayerService.list("all"), []);
  const people = useAsync(() => recommendationService.people(), []);
  const feed = useAsync(() => communityService.feed(), []);
  const cases = useAsync(() => foundationService.featured(), []);

  const quick = QUICK_LINKS[role] ?? DEFAULT_QUICK;
  const activePlan = plans.data?.find((p) => p.progress > 0);

  return (
    <div className="space-y-10">
      {/* ------------------------------------------------------------ hero */}
      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <HeroMedia seed={`home-${user.id}`} gradient="from-cyan-500/70 to-blue-700/70" className="flex items-end p-6">
          <div className="relative z-10">
            <Badge variant="primary" size="md" className="mb-3 border border-white/20 bg-white/15 text-white">
              {ROLE_LABELS[role]}
            </Badge>
            <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">
              {greeting()}, {user.firstName}
            </h1>
            <p className="mt-1.5 max-w-md text-sm text-white/80">
              Tienes {prayers.data?.length ?? 0} peticiones de oración activas y{" "}
              {events.data?.length ?? 0} eventos próximos en tu comunidad.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {quick.map((q) => (
                <Button
                  key={q.href}
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-white/25 bg-white/10 text-white hover:bg-white/20"
                >
                  <Link to={q.href}>
                    <q.icon className="size-3.5" /> {q.label}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </HeroMedia>

        <div className="surface-card flex flex-col p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">
            Versículo del día
          </p>
          {verse.loading ? (
            <div className="mt-4 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <>
              <blockquote className="mt-3 font-display text-lg leading-snug">
                “{verse.data?.text}”
              </blockquote>
              <p className="mt-2.5 text-sm font-medium text-muted-foreground">{verse.data?.ref}</p>
            </>
          )}
          <div className="mt-auto flex gap-2 pt-5">
            <Button asChild size="sm" variant="subtle" full>
              <Link to="/bible">Leer el capítulo</Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => toast.success("Versículo guardado en tu biblioteca")}
              aria-label="Guardar versículo"
            >
              <Heart className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- continue rails */}
      {(watching.loading || (watching.data?.length ?? 0) > 0) && (
        <Rail title="Continuar viendo" size="wide" subtitle="Retoma donde lo dejaste">
          {watching.loading ? (
            <RailSkeleton count={5} />
          ) : (
            watching.data?.map((item) => <ContinueCard key={item.id} item={item} />)
          )}
        </Rail>
      )}

      {(listening.loading || (listening.data?.length ?? 0) > 0) && (
        <Rail title="Continuar escuchando" size="wide" subtitle="Sermones y episodios a medias">
          {listening.loading ? (
            <RailSkeleton count={5} />
          ) : (
            listening.data?.map((item) => <ContinueCard key={item.id} item={item} />)
          )}
        </Rail>
      )}

      {/* ------------------------------------------------ devotional + plan */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:flex-row">
            <GenerativeCover
              seed={devotional.data?.id ?? "devotional"}
              gradient={devotional.data?.color}
              className="aspect-video w-full shrink-0 sm:aspect-square sm:w-32"
              icon={BookOpen}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">
                Tu devocional de hoy
              </p>
              <h3 className="mt-1.5 font-display text-lg font-semibold leading-snug">
                {devotional.data?.title ?? "Cargando…"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {devotional.data ? `${devotional.data.verse.ref} · ${devotional.data.minutes} min de lectura` : ""}
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link to={devotional.data ? `/devotionals/${devotional.data.id}` : "/devotionals"}>
                  Leer ahora <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="surface-card p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">
            Tu plan en curso
          </p>
          {activePlan ? (
            <>
              <h3 className="mt-1.5 font-display text-lg font-semibold leading-snug">
                {activePlan.title}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {activePlan.category} · {activePlan.days.length} días ·{" "}
                {formatCompact(activePlan.participants)} participantes
              </p>
              <div className="mt-4">
                <Progress value={activePlan.progress} label={`Progreso: ${activePlan.progress} %`} />
                <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                  {activePlan.progress} % completado
                </p>
              </div>
              <Button asChild size="sm" variant="subtle" className="mt-4">
                <Link to={`/plans/${activePlan.id}`}>Continuar el plan</Link>
              </Button>
            </>
          ) : (
            <>
              <h3 className="mt-1.5 font-display text-lg font-semibold">
                Aún no tienes un plan activo
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Elige un plan de 14 días y crea el hábito de leer cada mañana.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link to="/plans">Ver planes</Link>
              </Button>
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------- recommendations */}
      <AsyncBoundary {...rows} skeleton={<RailSkeleton />}>
        {(data) => (
          <div className="space-y-10">
            {data.map((row) => (
              <Rail key={row.title} title={row.title}>
                {row.items.map((item) => (
                  <MediaCard
                    key={item.id}
                    to={item.href}
                    seed={item.id}
                    gradient={item.color}
                    title={item.title}
                    subtitle={item.subtitle}
                    onPlay={
                      row.title === "Música recomendada"
                        ? () => {
                            const song = songs.find((s) => s.id === item.id);
                            if (song) player.playTrack(trackFromSong(song));
                          }
                        : undefined
                    }
                  />
                ))}
              </Rail>
            ))}
          </div>
        )}
      </AsyncBoundary>

      {/* ------------------------------------------------------- community */}
      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-section font-semibold tracking-tight">De tu comunidad</h2>
            <Link to="/community" className="text-xs font-medium text-muted-foreground hover:text-primary">
              Ver todo
            </Link>
          </div>
          <div className="space-y-3">
            {feed.data?.slice(0, 3).map((post) => {
              const author = userById(post.authorId);
              return (
                <Link
                  key={post.id}
                  to="/community"
                  className="surface-card flex gap-3 p-4 transition-colors hover:border-foreground/20"
                >
                  <GenerativeCover
                    seed={post.authorId}
                    gradient={author?.color}
                    className="size-10 shrink-0"
                    rounded="rounded-full"
                  />
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{author?.name}</span>{" "}
                      <span className="text-muted-foreground">· {timeAgo(post.createdAt)}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground clamp-2">{post.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {post.likes} me gusta · {post.comments.length} comentarios
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-section font-semibold tracking-tight">Peticiones de oración</h2>
            <Link to="/prayer" className="text-xs font-medium text-muted-foreground hover:text-primary">
              Ver todo
            </Link>
          </div>
          <div className="space-y-3">
            {prayers.data?.slice(0, 3).map((p) => (
              <div key={p.id} className="surface-card p-4">
                <p className="text-sm font-medium">{p.title}</p>
                <p className="mt-1 text-xs text-muted-foreground clamp-2">{p.body}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {p.prayingCount} orando
                  </span>
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => toast.success("Gracias por orar. Se lo hicimos saber.")}
                  >
                    <Heart className="size-3.5" /> Estoy orando
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- people */}
      <Rail title="Personas que quizá conozcas" size="tight" href="/community">
        {people.data?.map((p) => (
          <Link key={p.id} to={`/profile/${p.id}`} className="group min-w-0 text-center">
            <GenerativeCover
              seed={p.id}
              gradient={p.color}
              rounded="rounded-full"
              className="aspect-square w-full transition-transform group-hover:-translate-y-0.5"
              label={p.name}
            />
            <p className="mt-2 truncate text-sm font-medium group-hover:text-primary">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">{p.city}</p>
          </Link>
        ))}
      </Rail>

      {/* -------------------------------------------------- churches/events */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-section font-semibold tracking-tight">Iglesias cerca de ti</h2>
            <Link to="/churches" className="text-xs font-medium text-muted-foreground hover:text-primary">
              Ver todo
            </Link>
          </div>
          <div className="space-y-3">
            {nearby.data?.churches.slice(0, 3).map((c) => (
              <ChurchCard key={c.id} church={c} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-section font-semibold tracking-tight">Próximos eventos</h2>
            <Link to="/events" className="text-xs font-medium text-muted-foreground hover:text-primary">
              Ver todo
            </Link>
          </div>
          <div className="space-y-3">
            {events.data?.slice(0, 3).map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- foundation */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-section font-semibold tracking-tight">Casos que necesitan ayuda</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Verificados por equipos locales junto a iglesias de la zona
            </p>
          </div>
          <Link to="/foundation" className="shrink-0 text-xs font-medium text-muted-foreground hover:text-primary">
            Ver todo
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.data?.slice(0, 3).map((c) => (
            <FoundationCaseCard key={c.id} item={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
