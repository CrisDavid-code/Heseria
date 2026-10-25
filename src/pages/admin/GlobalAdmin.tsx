import {
  Activity, AlertTriangle, BarChart3, Church, Film, FileText, Flag, GraduationCap, HandHeart,
  Image, CalendarDays, Megaphone, MessageSquareWarning, Settings as SettingsIcon, ShieldCheck, Users,
} from "lucide-react";
import { isSuperAdmin } from "@/lib/permissions";
import { useSession } from "@/store";
import { useState } from "react";
import { toast } from "sonner";
import {
  AdminList, AdminSections, BarsChart, BreakdownChart, KpiRow, QuickActions, RecentActivity,
  TrendChart, type AdminRow,
} from "@/components/admin/AdminKit";
import { PaymentsPanel } from "@/components/admin/PaymentSettings";
import { GenerativeCover } from "@/components/media/covers";
import { Button } from "@/components/ui/button";
import { ContentManager } from "@/components/admin/ContentManager";
import { SettingRow, SimpleSelect, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent, SheetAction } from "@/components/ui/overlays";
import { Badge, Field, Input } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  adminService, analyticsService, churchService, courseService, eventService, foundationService,
  feedbackService, moderationService, musicService, userService, videoService,
  type AdminUser, type FeedbackItem,
} from "@/services";
import type { SeedStep } from "@/services/seed";
import { useScreen } from "@/store/screen";
import { users as allUsers } from "@/store/directory";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn, formatCompact, formatDate, formatMoney, pct } from "@/lib/utils";
import type { ModerationItem, Role } from "@/types";

const SECTIONS = [
  { label: "Usuarios", href: "/admin/users", icon: Users, description: "Cuentas y roles" },
  { label: "Iglesias", href: "/admin/churches", icon: Church, description: "Directorio global" },
  { label: "Contenido", href: "/admin/content", icon: FileText, description: "Videos y publicaciones" },
  { label: "Medios", href: "/admin/media", icon: Film, description: "Música, videos y sermones" },
  { label: "Cursos", href: "/admin/courses", icon: GraduationCap, description: "Catálogo de la academia" },
  { label: "Eventos", href: "/admin/events", icon: CalendarDays, description: "Agenda global" },
  { label: "Notificaciones", href: "/admin/notifications", icon: Megaphone, description: "Envíos manuales y automáticos" },
  { label: "Audiencia", href: "/admin/audience", icon: Activity, description: "Usuarios activos y alcance" },
  { label: "Reportes", href: "/admin/reports", icon: BarChart3, description: "Métricas de la plataforma" },
  { label: "Moderación", href: "/admin/moderation", icon: ShieldCheck, description: "Cola de revisión" },
  { label: "Comentarios", href: "/admin/feedback", icon: MessageSquareWarning, description: "Sugerencias y fallas" },
  { label: "Fundación", href: "/admin/foundation", icon: HandHeart, description: "Casos y donaciones" },
  { label: "Configuración", href: "/admin/settings", icon: SettingsIcon, description: "Ajustes globales" },
];

export function AdminDashboard() {
  usePageMeta("Administración global", "Panel general de Heseria.");
  const owner = isSuperAdmin(useSession().user);
  // Para el superadmin el panel es su inicio: sin flecha de volver.
  useScreen({ title: owner ? "Panel de superadmin" : "Administración global", back: !owner, hideSections: true });
  // Fundación es solo del superadmin; él ya la tiene, igual que Comentarios, en su barra inferior.
  const sections = SECTIONS.filter((s) =>
    owner ? s.href !== "/admin/foundation" && s.href !== "/admin/feedback" : s.href !== "/admin/foundation",
  );

  const kpis = useAsync(() => analyticsService.kpis("admin"), []);
  const series = useAsync(() => analyticsService.series("admin"), []);
  const breakdown = useAsync(() => analyticsService.breakdown("admin"), []);
  const activity = useAsync(() => analyticsService.activity("admin"), []);
  const queue = useAsync(() => moderationService.queue("pendiente"), []);

  return (
    <div className="space-y-6">
      <SeedCard />

      <KpiRow kpis={kpis.data} />

      {(queue.data?.length ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/8 p-3.5">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-sm">
            {queue.data?.length} elementos esperan moderación
          </p>
          <Button asChild size="sm" variant="outline">
            <a href="/admin/moderation">Revisar</a>
          </Button>
        </div>
      )}

      <QuickActions
        actions={[
          { label: "Notificar", icon: Megaphone, href: "/admin/notifications" },
          { label: "Audiencia", icon: Activity, href: "/admin/audience" },
          { label: "Moderación", icon: ShieldCheck, href: "/admin/moderation" },
          { label: "Usuarios", icon: Users, href: "/admin/users" },
        ]}
      />

      <TrendChart title="Cuentas nuevas" subtitle="Últimos 6 meses" data={series.data} />
      <BreakdownChart title="Personas por rol" data={breakdown.data} />

      <RecentActivity items={activity.data} />

      <AdminSections links={sections} />
    </div>
  );
}

/**
 * Cuentas y roles.
 *
 * Toda cuenta nace como «Usuario»: nadie puede darse un rol a sí mismo (las
 * reglas lo impiden). La administración asigna aquí el rol que corresponde —
 * pastor, maestro, artista…— y puede suspender una cuenta.
 */
export function AdminUsers() {
  usePageMeta("Usuarios", "Cuentas registradas en Heseria.");
  useScreen({ title: "Usuarios", back: true, hideSections: true });
  const list = useAsync(() => adminService.users(), []);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<Role>("user");
  const [saving, setSaving] = useState(false);

  const rows: AdminRow[] =
    list.data?.map((u) => ({
      id: u.id,
      title: u.name,
      subtitle: `@${u.handle}${u.city ? ` · ${u.city}` : ""}`,
      meta: u.status === "suspended" ? "Suspendida" : formatDate(u.createdAt),
      color: u.color,
      status: {
        label: ROLE_LABELS[u.role],
        tone: u.status === "suspended" ? ("danger" as const) : u.role === "user" ? ("default" as const) : ("primary" as const),
      },
    })) ?? [];

  async function save(patch: { role?: Role; status?: string }) {
    if (!editing) return;
    setSaving(true);
    try {
      await adminService.updateUser(editing.id, patch);
      toast.success(patch.role ? `Ahora es ${ROLE_LABELS[patch.role]}` : "Cuenta actualizada");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminList
        rows={rows}
        emptyLabel={list.loading ? "Cargando…" : "No hay cuentas que coincidan."}
        onRowAction={(row) => {
          const u = list.data?.find((x) => x.id === row.id) ?? null;
          setEditing(u);
          if (u) setRole(u.role);
        }}
        filters={[
          { key: "usuarios", label: "Sin rol", test: (r) => r.status?.label === ROLE_LABELS.user },
          { key: "pastores", label: "Pastores", test: (r) => r.status?.label === ROLE_LABELS.pastor },
          { key: "maestros", label: "Maestros", test: (r) => r.status?.label === ROLE_LABELS.teacher },
          { key: "admins", label: "Administración", test: (r) => /Administrador/.test(r.status?.label ?? "") },
        ]}
        sorts={[{ key: "az", label: "Nombre (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]}
      />

      <BottomSheet open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <BottomSheetContent title={editing?.name ?? "Cuenta"} description={editing ? `@${editing.handle}` : undefined}>
          {editing && (
            <div className="space-y-4">
              <Field label="Rol" htmlFor="role" hint="Define qué puede publicar y administrar esta persona.">
                <SimpleSelect
                  value={role}
                  onValueChange={(v) => setRole(v as Role)}
                  options={ASSIGNABLE.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                  ariaLabel="Rol"
                />
              </Field>
              <p className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                {ROLE_HELP[role]}
              </p>
              <Button full size="lg" loading={saving} disabled={role === editing.role} onClick={() => void save({ role })}>
                Guardar rol
              </Button>
              <Button
                full
                variant="outline"
                loading={saving}
                className={editing.status === "suspended" ? "" : "text-destructive"}
                onClick={() => void save({ status: editing.status === "suspended" ? "active" : "suspended" })}
              >
                {editing.status === "suspended" ? "Reactivar cuenta" : "Suspender cuenta"}
              </Button>
              <Button asChild full variant="ghost">
                <a href={`/profile/${editing.id}`}>Ver perfil</a>
              </Button>
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}

/** Roles que se pueden asignar, de menos a más permisos. */
const ASSIGNABLE: Role[] = [
  "user", "member", "server", "musician", "leader", "youth_leader", "missionary",
  "creator", "artist", "teacher", "pastor", "church_admin", "moderator", "admin",
];

const ROLE_HELP: Record<Role, string> = {
  visitor: "Solo puede ver.",
  user: "Rol con el que nace toda cuenta: lee, ora, comenta y participa en la comunidad.",
  member: "Miembro de una iglesia: lo mismo que un usuario, identificado con su congregación.",
  server: "Sirve en un ministerio: puede crear y editar lo suyo.",
  leader: "Lidera un grupo o ministerio: puede crear grupos y ministerios.",
  youth_leader: "Lidera jóvenes: puede crear grupos y ministerios.",
  teacher: "Enseña: crea cursos, publica material y ve a sus estudiantes.",
  musician: "Músico: participa y crea contenido para revisión.",
  artist: "Artista: publica su propia música y videos (con sus derechos).",
  pastor: "Pastor: publica sermones, gestiona su iglesia, eventos y peticiones.",
  missionary: "Misionero: comparte su trabajo. No recauda: eso solo lo hace la Fundación Heseria.",
  creator: "Creador: publica sus propios videos, podcasts y contenido.",
  church_admin: "Administra una iglesia: miembros, eventos, cursos y contenido de su congregación.",
  moderator: "Modera: revisa reportes y retira contenido inapropiado.",
  admin: "Administración global: todo, incluida la Fundación y los roles de los demás. Úsalo con cuidado.",
};

export function AdminChurches() {
  usePageMeta("Iglesias", "Directorio global de iglesias.");
  useScreen({ title: "Iglesias", back: true, hideSections: true });
  const list = useAsync(() => churchService.list(), []);

  const rows: AdminRow[] =
    list.data?.map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: [c.city, c.denomination].filter(Boolean).join(" · "),
      meta: formatCompact(c.members),
      color: c.color,
      href: `/churches/${c.id}`,
      // Lo que viene de OpenStreetMap es público, no verificado por Heseria.
      status: c.id.startsWith("osm-")
        ? { label: "OpenStreetMap", tone: "default" as const }
        : { label: "Registrada", tone: "success" as const },
    })) ?? [];

  return (
    <AdminList
      rows={rows}
      sorts={[
        { key: "az", label: "Nombre (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) },
        { key: "miembros", label: "Más miembros", compare: (a, b) => Number(b.meta?.replace(/\D/g, "")) - Number(a.meta?.replace(/\D/g, "")) },
      ]}
    />
  );
}

/* ------------------------------------------------- contenido inicial */

/**
 * Carga el contenido real con un toque: iglesias, planes, devocionales, cursos
 * y podcasts. Se puede repetir sin duplicar nada.
 */
function SeedCard() {
  const [steps, setSteps] = useState<SeedStep[]>([]);
  const [running, setRunning] = useState(false);
  const health = useAsync(() => adminService.health(), [running]);
  const counts = health.data?.counts ?? {};
  const empty = !health.loading && (counts.churches ?? 0) === 0;

  async function run() {
    setRunning(true);
    setSteps([]);
    try {
      const { seedRealContent } = await import("@/services/seed");
      const { errors } = await seedRealContent((s) =>
        setSteps((prev) => [...prev.filter((p) => p.label !== s.label), s]),
      );
      if (errors.length) toast.warning(`Listo, con ${errors.length} podcast(s) que no respondieron.`);
      else toast.success("Contenido cargado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cargar el contenido.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className={cn("rounded-2xl border p-4", empty ? "border-primary/40 bg-primary/8" : "border-border")}>
      <h2 className="text-sm font-semibold">Contenido inicial</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {empty
          ? "La plataforma está vacía. Carga el contenido real: 420 iglesias evangélicas de Guatemala (OpenStreetMap), 8 planes de lectura, 31 devocionales, 3 cursos y 8 podcasts cristianos."
          : `Hay ${counts.churches ?? 0} iglesias, ${counts.plans ?? 0} planes, ${counts.devotionals ?? 0} devocionales, ${counts.courses ?? 0} cursos y ${counts.podcastFeeds ?? 0} podcasts. Volver a cargar actualiza sin duplicar.`}
      </p>
      {steps.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {steps.map((s) => (
            <li key={s.label} className="flex justify-between">
              <span>{s.label}</span>
              <span className="tabular-nums text-muted-foreground">{s.done}/{s.total}</span>
            </li>
          ))}
        </ul>
      )}
      <Button className="mt-3" size="sm" loading={running} onClick={() => void run()}>
        {empty ? "Cargar contenido real" : "Actualizar contenido"}
      </Button>
    </section>
  );
}

export function AdminContent() {
  usePageMeta("Contenido", "Videos y publicaciones de la plataforma.");
  useScreen({ title: "Contenido", back: true, hideSections: true });
  const videos = useAsync(() => videoService.list(), []);

  const rows: AdminRow[] =
    videos.data?.map((v) => ({
      id: v.id,
      title: v.title,
      subtitle: `${v.category} · ${formatDate(v.publishedAt)}`,
      meta: formatCompact(v.views),
      color: v.color,
      href: `/videos/${v.id}`,
      status: { label: "Publicado", tone: "success" as const },
    })) ?? [];

  return (
    <div className="space-y-6">
      <ContentManager kind="video" ctaLabel="Subir video" />
      <h2 className="text-section font-semibold tracking-tight">Contenido publicado</h2>
      <AdminList rows={rows} selectable />
    </div>
  );
}

export function AdminMedia() {
  usePageMeta("Medios", "Música, videos y sermones.");
  useScreen({ title: "Medios", back: true, hideSections: true });

  const songs = useAsync(() => musicService.songs(), []);

  const rows: AdminRow[] = [
    ...(songs.data ?? []).slice(0, 14).map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: `Canción · ${s.genre}`,
      meta: formatCompact(s.plays),
      color: s.color,
      status: { label: "Música", tone: "default" as const },
    })),
  ];

  return (
    <div className="space-y-6">
      <ContentManager ctaLabel="Añadir contenido al catálogo" />
      <h2 className="text-section font-semibold tracking-tight">Catálogo actual</h2>
      <AdminList
      rows={rows}
      filters={[
        { key: "musica", label: "Música", test: (r) => r.status?.label === "Música" },
      ]}
      />
    </div>
  );
}

export function AdminCourses() {
  usePageMeta("Cursos", "Catálogo global de la academia.");
  useScreen({ title: "Cursos", back: true, hideSections: true });
  const courses = useAsync(() => courseService.list(), []);

  const rows: AdminRow[] =
    courses.data?.map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: `${c.category} · ${c.level} · ${c.modality}`,
      meta: formatCompact(c.students),
      color: c.color,
      href: `/courses/${c.id}`,
    })) ?? [];

  return (
    <AdminList
      rows={rows}
      sorts={[
        { key: "az", label: "Título (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) },
        { key: "alumnos", label: "Más estudiantes", compare: (a, b) => Number(b.meta?.replace(/\D/g, "")) - Number(a.meta?.replace(/\D/g, "")) },
      ]}
    />
  );
}

export function AdminEvents() {
  usePageMeta("Eventos", "Agenda global de la plataforma.");
  useScreen({ title: "Eventos", back: true, hideSections: true });
  const events = useAsync(() => eventService.list(), []);

  const rows: AdminRow[] =
    events.data?.map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: `${formatDate(e.date)} · ${e.city}`,
      meta: `${pct(e.attendees, e.capacity)} %`,
      color: e.color,
      href: `/events/${e.id}`,
      status: { label: e.modality, tone: "primary" as const },
    })) ?? [];

  return <AdminList rows={rows} />;
}

export function AdminReports() {
  usePageMeta("Reportes", "Métricas de toda la plataforma.");
  useScreen({ title: "Reportes", back: true, hideSections: true });

  const kpis = useAsync(() => analyticsService.kpis("admin"), []);
  const series = useAsync(() => analyticsService.series("admin"), []);
  const breakdown = useAsync(() => analyticsService.breakdown("admin"), []);

  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis.data} />
      <TrendChart title="Crecimiento de usuarios" data={series.data} />
      <BarsChart title="Publicaciones por categoría" data={breakdown.data} />
      <BreakdownChart title="Distribución de consumo" data={breakdown.data} />
      <Button variant="outline" full onClick={() => toast.info("La exportación llegará con el backend")}>
        Exportar informe
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------ feedback */

/** Sugerencias de funciones y reportes de fallas que manda la gente (y los errores automáticos). */
export function AdminFeedback() {
  usePageMeta("Comentarios", "Sugerencias y reportes de fallas.");
  // Para el superadmin es una pestaña de su barra, no una pantalla interior.
  useScreen({ title: "Comentarios", back: !isSuperAdmin(useSession().user), hideSections: true });

  const [type, setType] = useState<"todos" | FeedbackItem["type"]>("todos");
  const [photo, setPhoto] = useState<string | null>(null);
  const items = useAsync(() => feedbackService.list(), []);
  const shown = (items.data ?? []).filter((f) => type === "todos" || f.type === type);

  async function done(id: string) {
    await feedbackService.remove(id);
    toast.success("Marcado como atendido");
    items.reload();
  }

  return (
    <div className="space-y-4">
      <Tabs value={type} onValueChange={(v) => setType(v as typeof type)}>
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="bug">Fallas</TabsTrigger>
          <TabsTrigger value="idea">Sugerencias</TabsTrigger>
        </TabsList>
      </Tabs>

      {items.loading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {items.error && (
        <p className="text-sm text-destructive">
          {items.error.message}{" "}
          <button type="button" className="font-medium underline" onClick={items.reload}>Reintentar</button>
        </p>
      )}
      {items.data && shown.length === 0 && (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No hay comentarios pendientes.</p>
      )}

      <ul className="space-y-3">
        {shown.map((f) => (
          <li key={f.id} className="rounded-xl border border-border p-3.5">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={f.type === "bug" ? "danger" : "primary"}>{f.type === "bug" ? "Falla" : "Sugerencia"}</Badge>
              <span className="text-xs text-muted-foreground">{f.createdAt ? formatDate(f.createdAt) : ""}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{f.message}</p>
            {f.screenshot && (
              <button type="button" onClick={() => setPhoto(f.screenshot!)} className="mt-2 block">
                <img src={f.screenshot} alt="Captura enviada" className="max-h-32 rounded-lg border border-border" />
              </button>
            )}
            <p className="mt-2 break-words text-[0.7rem] text-muted-foreground">
              Pantalla: {f.screen || "—"} · {f.userId ? `Usuario ${f.userId}` : "Sin sesión"}
              <br />
              {f.device}
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void done(f.id)}>
              Marcar como atendido
            </Button>
          </li>
        ))}
      </ul>

      <BottomSheet open={Boolean(photo)} onOpenChange={(v) => !v && setPhoto(null)}>
        <BottomSheetContent title="Captura">
          {photo && <img src={photo} alt="Captura enviada" className="w-full rounded-lg" />}
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

/* ---------------------------------------------------------- moderation */

const STATUS_TONE: Record<ModerationItem["status"], "default" | "primary" | "success" | "warning" | "danger"> = {
  pendiente: "warning",
  revisando: "primary",
  aprobado: "success",
  rechazado: "danger",
  bloqueado: "danger",
};

export function AdminModeration() {
  usePageMeta("Moderación", "Cola de contenido reportado.");
  useScreen({ title: "Moderación", back: true, hideSections: true });

  const [status, setStatus] = useState<ModerationItem["status"] | "todos">("todos");
  const [active, setActive] = useState<ModerationItem | null>(null);
  const queue = useAsync(
    () => moderationService.queue(status === "todos" ? undefined : status),
    [status],
  );

  async function resolve(next: ModerationItem["status"]) {
    if (!active) return;
    await moderationService.resolve(active.id, next);
    toast.success(`Marcado como ${next}`);
    setActive(null);
    queue.reload();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-3.5">
        <p className="text-xs text-muted-foreground">
          Revisión manual. La clasificación automática con IA se conectará más adelante; la interfaz
          ya contempla su veredicto y nivel de confianza.
        </p>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
          <TabsTrigger value="revisando">Revisando</TabsTrigger>
          <TabsTrigger value="aprobado">Aprobados</TabsTrigger>
          <TabsTrigger value="rechazado">Rechazados</TabsTrigger>
          <TabsTrigger value="bloqueado">Bloqueados</TabsTrigger>
        </TabsList>

        <TabsContent value={status}>
          <ul className="space-y-2.5">
            {queue.data?.map((m) => {
              const reporter = allUsers.find((u) => u.id === m.reportedBy);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setActive(m)}
                    className="surface-card w-full p-4 text-left transition-colors active:bg-secondary"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{m.kind}</Badge>
                      <Badge variant={STATUS_TONE[m.status]}>{m.status}</Badge>
                      <Badge
                        variant={
                          m.severity === "alta" ? "danger" : m.severity === "media" ? "warning" : "default"
                        }
                        className="ml-auto"
                      >
                        {m.severity}
                      </Badge>
                    </div>
                    <p className="mt-2.5 text-sm font-medium">{m.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground clamp-2">{m.excerpt}</p>
                    <p className="mt-2 text-[0.68rem] text-muted-foreground">
                      Reportado por {reporter?.name ?? m.reportedBy} · {formatDate(m.createdAt)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </TabsContent>
      </Tabs>

      <BottomSheet open={active !== null} onOpenChange={(v) => !v && setActive(null)}>
        <BottomSheetContent
          title={active?.reason ?? ""}
          description={`Contenido de tipo ${active?.kind ?? ""}`}
        >
          {active && (
            <>
              <GenerativeCover
                seed={active.targetId}
                gradient="from-indigo-500/70 to-slate-800/70"
                rounded="rounded-xl"
                className="aspect-video w-full"
                icon={Image}
              />
              <p className="mt-3 text-sm text-muted-foreground">{active.excerpt}</p>

              <div className="mt-4 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Clasificación automática
                </p>
                <p className="mt-1.5 text-sm">
                  Pendiente — se activará al conectar el servicio de moderación.
                </p>
              </div>

              <div className="mt-5 space-y-0.5">
                <SheetAction icon={ShieldCheck} label="Aprobar" onClick={() => resolve("aprobado")} />
                <SheetAction icon={Flag} label="Marcar en revisión" onClick={() => resolve("revisando")} />
                <SheetAction icon={AlertTriangle} label="Rechazar" onClick={() => resolve("rechazado")} />
                <SheetAction
                  icon={AlertTriangle}
                  label="Bloquear contenido"
                  destructive
                  onClick={() => resolve("bloqueado")}
                />
              </div>
            </>
          )}
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

export function AdminFoundation() {
  usePageMeta("Fundación", "Casos y donaciones de toda la plataforma.");
  // Para el superadmin es una pestaña de su barra, no una pantalla interior.
  useScreen({ title: "Fundación", back: !isSuperAdmin(useSession().user), hideSections: true });

  const cases = useAsync(() => foundationService.cases(), []);
  const series = useAsync(() => analyticsService.series("foundation"), []);

  const totalRaised = cases.data?.reduce((n, c) => n + c.raised, 0) ?? 0;
  const totalGoal = cases.data?.reduce((n, c) => n + c.goal, 0) ?? 0;

  const rows: AdminRow[] =
    cases.data?.map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: `${c.category} · ${c.location}`,
      meta: `${pct(c.raised, c.goal)} %`,
      color: c.color,
      href: `/foundation/cases/${c.id}`,
      status: c.urgent
        ? { label: "Urgente", tone: "danger" as const }
        : { label: "Activo", tone: "success" as const },
    })) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Recaudado</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums">
            {formatMoney(totalRaised)}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Meta global</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums">
            {formatMoney(totalGoal)}
          </p>
        </div>
      </div>

      <TrendChart title="Donaciones por mes" data={series.data} />

      {/* Aportes por verificar y métodos de pago. */}
      <PaymentsPanel />

      <AdminList
        rows={rows}
        filters={[{ key: "urgentes", label: "Urgentes", test: (r) => r.status?.label === "Urgente" }]}
      />
    </div>
  );
}

export function AdminSettings() {
  usePageMeta("Configuración global", "Ajustes de la plataforma.");
  useScreen({ title: "Configuración global", back: true, hideSections: true });

  return (
    <div className="space-y-5">
      <section className="surface-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Plataforma</h2>
        <div className="space-y-3">
          <Field label="Nombre público" htmlFor="pf-name">
            <Input id="pf-name" defaultValue="Heseria" />
          </Field>
          <Field label="Correo de soporte" htmlFor="pf-mail">
            <Input id="pf-mail" defaultValue="soporte@heseria.app" />
          </Field>
        </div>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Registro y acceso</h2>
        <SettingRow title="Registro abierto" description="Cualquiera puede crear una cuenta.">
          <Switch defaultChecked aria-label="Registro abierto" />
        </SettingRow>
        <SettingRow title="Verificación de iglesias" description="Requiere revisión manual del equipo.">
          <Switch defaultChecked aria-label="Verificación de iglesias" />
        </SettingRow>
        <SettingRow title="Publicación directa" description="El contenido se publica sin revisión previa.">
          <Switch aria-label="Publicación directa" />
        </SettingRow>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Moderación</h2>
        <SettingRow title="Moderación automática" description="Se activará al conectar el servicio.">
          <Switch disabled aria-label="Moderación automática" />
        </SettingRow>
        <SettingRow title="Bloqueo automático de severidad alta" description="Retira el contenido hasta revisarlo.">
          <Switch defaultChecked aria-label="Bloqueo automático" />
        </SettingRow>
      </section>

      <Button full onClick={() => toast.success("Configuración guardada")}>
        Guardar cambios
      </Button>
    </div>
  );
}
