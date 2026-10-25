import {
  BookOpen, CalendarDays, Church, FileText, GraduationCap, HandHeart, Heart, LayoutGrid, Mail,
  MessageSquare, Mic2, Plus, Settings as SettingsIcon, UserPlus, Users,
} from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AdminList, AdminSections, BreakdownChart, KpiRow, QuickActions, RecentActivity, TrendChart,
  type AdminRow,
} from "@/components/admin/AdminKit";
import { GenerativeCover } from "@/components/media/covers";
import { DetailSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ContentManager } from "@/components/admin/ContentManager";
import {
  AddMemberSheet, CatalogFormSheet, EVENT_FIELDS, GROUP_FIELDS, MINISTRY_FIELDS,
} from "@/components/admin/CatalogForm";
import { SettingRow, Switch } from "@/components/ui/controls";
import { Badge, Field, Input, Progress, Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  analyticsService, churchService, courseService, eventService, groupService,
  ministryService, prayerService, sermonService, videoService,
} from "@/services";
import { useScreen } from "@/store/screen";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDate, formatMoney, formatLength, pct } from "@/lib/utils";

const SECTIONS = [
  { label: "Miembros", href: "/church-admin/members", icon: Users, description: "Directorio, roles y actividad" },
  { label: "Grupos", href: "/church-admin/groups", icon: LayoutGrid, description: "Grupos pequeños y equipos" },
  { label: "Ministerios", href: "/church-admin/ministries", icon: HandHeart, description: "Equipos de servicio" },
  { label: "Eventos", href: "/church-admin/events", icon: CalendarDays, description: "Agenda y asistencia" },
  { label: "Contenido", href: "/church-admin/content", icon: FileText, description: "Videos y publicaciones" },
  { label: "Sermones", href: "/church-admin/sermons", icon: Mic2, description: "Predicaciones publicadas" },
  { label: "Cursos", href: "/church-admin/courses", icon: GraduationCap, description: "Formación de la iglesia" },
  { label: "Mensajes", href: "/church-admin/messages", icon: MessageSquare, description: "Comunicación interna" },
  { label: "Peticiones", href: "/church-admin/prayer", icon: Heart, description: "Oración de la comunidad" },
  { label: "Configuración", href: "/church-admin/settings", icon: SettingsIcon, description: "Datos y horarios" },
];

/* -------------------------------------------------------------- dashboard */

export function ChurchAdminDashboard() {
  usePageMeta("Administración de iglesia", "Panel de gestión de tu iglesia.");
  useScreen({ title: "Mi iglesia · Gestión", back: true, hideSections: true });

  const church = useAsync(() => churchService.myChurch(), []);
  const kpis = useAsync(() => analyticsService.kpis("church"), []);
  const series = useAsync(() => analyticsService.series("church"), []);
  const breakdown = useAsync(() => analyticsService.breakdown("church"), []);
  const activity = useAsync(() => analyticsService.activity("church"), []);
  const [addingMember, setAddingMember] = useState(false);
  const prayers = useAsync(() => prayerService.list("church"), []);
  const events = useAsync(() => eventService.upcoming(), []);

  return (
    <div className="space-y-6">
      {church.data && (
        <div className="surface-card flex items-center gap-3.5 p-4">
          <GenerativeCover
            seed={church.data.id}
            gradient={church.data.color}
            className="size-14 shrink-0"
            rounded="rounded-xl"
            icon={Church}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold">{church.data.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {church.data.city}, {church.data.country}
            </p>
          </div>
          <Badge variant="primary">Admin</Badge>
        </div>
      )}

      <KpiRow kpis={kpis.data} />

      <QuickActions
        actions={[
          { label: "Añadir miembro", icon: UserPlus, onClick: () => setAddingMember(true) },
          { label: "Crear evento", icon: CalendarDays, href: "/church-admin/events" },
          { label: "Publicar sermón", icon: Mic2, href: "/church-admin/sermons" },
          { label: "Enviar aviso", icon: Mail, href: "/church-admin/messages" },
        ]}
      />

      <TrendChart
        title="Asistencia por mes"
        subtitle="Culto general y jóvenes"
        data={series.data}
      />
      <BreakdownChart title="Consumo de contenido" data={breakdown.data} />

      <RecentActivity items={activity.data} />

      <AddMemberSheet
        open={addingMember}
        onOpenChange={setAddingMember}
        churchId={church.data?.id}
        onAdded={() => kpis.reload()}
      />

      <AdminSections links={SECTIONS} />
    </div>
  );
}

/* ---------------------------------------------------------------- members */

export function ChurchAdminMembers() {
  usePageMeta("Miembros", "Directorio de miembros de la iglesia.");
  useScreen({ title: "Miembros", back: true, hideSections: true });

  const church = useAsync(() => churchService.myChurch(), []);
  const members = useAsync(
    () => (church.data ? churchService.members(church.data.id) : Promise.resolve([])),
    [church.data?.id],
  );

  const rows: AdminRow[] =
    members.data?.map((m) => ({
      id: m.id,
      title: m.name,
      subtitle: `${ROLE_LABELS[m.role]} · ${m.ministries.join(", ")}`,
      color: m.color,
      href: `/church-admin/members/${m.id}`,
      status: { label: "Activo", tone: "success" as const },
    })) ?? [];

  return (
    <div className="space-y-4">
      <Button full onClick={() => toast.success("Invitación enviada por correo")}>
        <UserPlus className="size-4" /> Invitar miembro
      </Button>
      <AdminList
        rows={rows}
        selectable
        filters={[
          { key: "lideres", label: "Líderes", test: (r) => /Líder|Pastor/.test(r.subtitle ?? "") },
          { key: "musicos", label: "Alabanza", test: (r) => /Alabanza/.test(r.subtitle ?? "") },
          { key: "jovenes", label: "Jóvenes", test: (r) => /Jóvenes/.test(r.subtitle ?? "") },
        ]}
        sorts={[
          { key: "az", label: "Nombre (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) },
          { key: "za", label: "Nombre (Z–A)", compare: (a, b) => b.title.localeCompare(a.title) },
        ]}
        emptyLabel="No hay miembros que coincidan con la búsqueda."
      />
    </div>
  );
}

export function ChurchAdminMemberDetail() {
  const { id = "" } = useParams();
  const church = useAsync(() => churchService.myChurch(), []);
  const members = useAsync(
    () => (church.data ? churchService.members(church.data.id) : Promise.resolve([])),
    [church.data?.id],
  );
  const member = members.data?.find((m) => m.id === id);

  usePageMeta(member?.name ?? "Miembro");
  useScreen({ title: member?.name ?? "Miembro", back: true, hideSections: true }, [id]);

  if (members.loading) return <DetailSkeleton />;
  if (!member) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <GenerativeCover
          seed={member.id}
          gradient={member.color}
          className="size-20"
          rounded="rounded-full"
          label={member.name}
        />
        <h1 className="mt-3 font-display text-lg font-semibold">{member.name}</h1>
        <p className="text-sm text-muted-foreground">@{member.handle}</p>
        <Badge variant="primary" className="mt-2">
          {ROLE_LABELS[member.role]}
        </Badge>
      </div>

      <dl className="overflow-hidden rounded-2xl border border-border text-sm">
        {[
          ["Correo", member.email],
          ["Ciudad", `${member.city}, ${member.country}`],
          ["Ministerios", member.ministries.join(", ")],
          ["Miembro desde", formatDate(member.joinedAt)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="max-w-[60%] text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" onClick={() => toast.success("Rol actualizado")}>
          Cambiar rol
        </Button>
        <Button variant="outline" onClick={() => toast.success("Asignado al ministerio")}>
          Asignar ministerio
        </Button>
        <Button variant="outline" onClick={() => toast.success("Mensaje enviado")}>
          Enviar mensaje
        </Button>
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => toast.success("Miembro desactivado")}
        >
          Desactivar
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------- generic list screens */

function useChurchId() {
  const church = useAsync(() => churchService.myChurch(), []);
  return church.data?.id;
}

export function ChurchAdminGroups() {
  usePageMeta("Grupos", "Grupos pequeños de la iglesia.");
  useScreen({ title: "Grupos", back: true, hideSections: true });
  const groups = useAsync(() => groupService.list(), []);
  const churchId = useChurchId();
  const [creating, setCreating] = useState(false);

  const rows: AdminRow[] =
    groups.data?.map((g) => ({
      id: g.id,
      title: g.name,
      subtitle: `${g.topic} · ${g.meeting}`,
      meta: `${g.members.length}`,
      color: g.color,
      href: `/groups/${g.id}`,
      status: { label: g.privacy, tone: g.privacy === "Abierto" ? "success" : "default" },
    })) ?? [];

  return (
    <div className="space-y-4">
      <Button full onClick={() => setCreating(true)}>
        <Plus className="size-4" /> Crear grupo
      </Button>

      <CatalogFormSheet
        open={creating}
        onOpenChange={setCreating}
        kind="group"
        title="Crear grupo"
        description="Los grupos aparecen en la sección Comunidad de toda la app."
        fields={GROUP_FIELDS}
        fixed={{ churchId, members: [] }}
        onCreated={() => groups.reload()}
      />
      <AdminList
        rows={rows}
        filters={[
          { key: "abiertos", label: "Abiertos", test: (r) => r.status?.label === "Abierto" },
          { key: "cerrados", label: "Cerrados", test: (r) => r.status?.label === "Cerrado" },
        ]}
        sorts={[{ key: "az", label: "Nombre (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]}
      />
    </div>
  );
}

export function ChurchAdminMinistries() {
  usePageMeta("Ministerios", "Equipos de servicio de la iglesia.");
  useScreen({ title: "Ministerios", back: true, hideSections: true });
  const churchId = useChurchId();
  const ministries = useAsync(
    () => (churchId ? ministryService.byChurch(churchId) : ministryService.list()),
    [churchId],
  );
  const [creating, setCreating] = useState(false);

  const rows: AdminRow[] =
    ministries.data?.map((m) => ({
      id: m.id,
      title: m.name,
      subtitle: m.category,
      meta: `${m.members}`,
      color: m.color,
      href: `/ministries/${m.id}`,
    })) ?? [];

  return (
    <div className="space-y-4">
      <Button full onClick={() => setCreating(true)}>
        <Plus className="size-4" /> Crear ministerio
      </Button>

      <CatalogFormSheet
        open={creating}
        onOpenChange={setCreating}
        kind="ministry"
        title="Crear ministerio"
        fields={MINISTRY_FIELDS}
        fixed={{ churchId, members: 0 }}
        onCreated={() => ministries.reload()}
      />
      <AdminList rows={rows} sorts={[{ key: "az", label: "Nombre (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]} />
    </div>
  );
}

export function ChurchAdminEvents() {
  usePageMeta("Eventos", "Agenda de la iglesia.");
  useScreen({ title: "Eventos", back: true, hideSections: true });
  const churchId = useChurchId();
  const events = useAsync(
    () => (churchId ? eventService.byChurch(churchId) : eventService.list()),
    [churchId],
  );
  const [creating, setCreating] = useState(false);

  const rows: AdminRow[] =
    events.data?.map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: `${formatDate(e.date)} · ${e.venue}`,
      meta: `${pct(e.attendees, e.capacity)} %`,
      color: e.color,
      href: `/events/${e.id}`,
      status: { label: e.modality, tone: "primary" as const },
    })) ?? [];

  return (
    <div className="space-y-4">
      <Button full onClick={() => setCreating(true)}>
        <Plus className="size-4" /> Crear evento
      </Button>

      <CatalogFormSheet
        open={creating}
        onOpenChange={setCreating}
        kind="event"
        title="Crear evento"
        description="Se publica en la agenda y avisa a tu iglesia si la regla está activa."
        fields={EVENT_FIELDS}
        fixed={{ churchId, attendees: 0 }}
        onCreated={() => events.reload()}
      />
      <AdminList
        rows={rows}
        filters={[
          { key: "presencial", label: "Presencial", test: (r) => r.status?.label === "Presencial" },
          { key: "online", label: "Online", test: (r) => r.status?.label === "Online" },
          { key: "hibrido", label: "Híbrido", test: (r) => r.status?.label === "Híbrido" },
        ]}
        sorts={[{ key: "fecha", label: "Fecha", compare: (a, b) => (a.subtitle ?? "").localeCompare(b.subtitle ?? "") }]}
      />
    </div>
  );
}

export function ChurchAdminContent() {
  usePageMeta("Contenido", "Videos y publicaciones de la iglesia.");
  useScreen({ title: "Contenido", back: true, hideSections: true });
  const videos = useAsync(() => videoService.list(), []);

  const rows: AdminRow[] =
    videos.data?.map((v) => ({
      id: v.id,
      title: v.title,
      subtitle: `${v.category} · ${formatLength(v.durationSec)}`,
      color: v.color,
      href: `/videos/${v.id}`,
      status: { label: "Publicado", tone: "success" as const },
    })) ?? [];

  return (
    <div className="space-y-4">
      <ContentManager ctaLabel="Subir contenido" />
      <AdminList rows={rows} sorts={[{ key: "az", label: "Título (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]} />
    </div>
  );
}

export function ChurchAdminSermons() {
  usePageMeta("Sermones", "Predicaciones publicadas.");
  useScreen({ title: "Sermones", back: true, hideSections: true });
  const churchId = useChurchId();
  const sermons = useAsync(
    () => (churchId ? sermonService.byChurch(churchId) : sermonService.list()),
    [churchId],
  );

  const rows: AdminRow[] =
    sermons.data?.map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: `${s.passage} · ${formatDate(s.publishedAt)}`,
      meta: formatLength(s.durationSec),
      color: s.color,
      href: `/sermons/${s.id}`,
    })) ?? [];

  return (
    <div className="space-y-4">
      <ContentManager kind="sermon" lockKind ctaLabel="Publicar sermón" />
      <AdminList rows={rows} sorts={[{ key: "az", label: "Título (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]} />
    </div>
  );
}

export function ChurchAdminCourses() {
  usePageMeta("Cursos", "Formación de la iglesia.");
  useScreen({ title: "Cursos", back: true, hideSections: true });
  const courses = useAsync(() => courseService.list(), []);

  const rows: AdminRow[] =
    courses.data?.slice(0, 12).map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: `${c.category} · ${c.level}`,
      meta: `${c.students}`,
      color: c.color,
      href: `/courses/${c.id}`,
      status: { label: c.modality, tone: "primary" as const },
    })) ?? [];

  return (
    <div className="space-y-4">
      <Button full onClick={() => toast.success("Curso creado")}>
        <Plus className="size-4" /> Crear curso
      </Button>
      <AdminList rows={rows} />
    </div>
  );
}

export function ChurchAdminMessages() {
  usePageMeta("Comunicación", "Avisos y mensajes a la congregación.");
  useScreen({ title: "Comunicación", back: true, hideSections: true });

  return (
    <div className="space-y-5">
      <section className="surface-card p-4">
        <h2 className="text-sm font-semibold">Nuevo aviso</h2>
        <div className="mt-3 space-y-3">
          <Field label="Asunto" htmlFor="msg-subject">
            <Input id="msg-subject" placeholder="Por ejemplo: cambio de horario del domingo" />
          </Field>
          <Field label="Mensaje" htmlFor="msg-body">
            <Textarea id="msg-body" placeholder="Escribe el aviso para la congregación…" />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="outline" onClick={() => toast.success("Borrador guardado")}>
              Guardar borrador
            </Button>
            <Button onClick={() => toast.success("Aviso enviado a 1.284 miembros")}>
              <Mail className="size-4" /> Enviar
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-section font-semibold tracking-tight">Avisos enviados</h2>
        <AdminList
          rows={[
            { id: "m1", title: "Cambio de horario del culto", subtitle: "Enviado a 1.284 miembros", meta: "hace 2 d", status: { label: "Entregado", tone: "success" } },
            { id: "m2", title: "Inscripciones al retiro de matrimonios", subtitle: "Enviado a 420 miembros", meta: "hace 5 d", status: { label: "Entregado", tone: "success" } },
            { id: "m3", title: "Convocatoria de voluntarios", subtitle: "Borrador", meta: "hace 6 d", status: { label: "Borrador", tone: "warning" } },
          ]}
        />
      </section>
    </div>
  );
}

export function ChurchAdminPrayer() {
  usePageMeta("Peticiones de oración", "Peticiones de la congregación.");
  useScreen({ title: "Peticiones", back: true, hideSections: true });
  const prayers = useAsync(() => prayerService.list("church"), []);
  const all = useAsync(() => prayerService.list("all"), []);

  const source = prayers.data?.length ? prayers.data : (all.data ?? []);
  const rows: AdminRow[] = source.map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: `${p.category} · ${p.prayingCount} orando`,
    meta: formatDate(p.createdAt),
    status: p.answered
      ? { label: "Respondida", tone: "success" as const }
      : { label: "Activa", tone: "primary" as const },
  }));

  return (
    <div className="space-y-4">
      <AdminList
        rows={rows}
        filters={[
          { key: "activas", label: "Activas", test: (r) => r.status?.label === "Activa" },
          { key: "respondidas", label: "Respondidas", test: (r) => r.status?.label === "Respondida" },
        ]}
        onRowAction={() => toast.success("Petición asignada al equipo de oración")}
      />
    </div>
  );
}

export function ChurchAdminSettings() {
  usePageMeta("Configuración de la iglesia");
  useScreen({ title: "Configuración", back: true, hideSections: true });
  const church = useAsync(() => churchService.myChurch(), []);

  if (church.loading) return <DetailSkeleton />;
  const c = church.data;
  if (!c) return null;

  return (
    <div className="space-y-5">
      <section className="surface-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Datos de la iglesia</h2>
        <div className="space-y-3">
          <Field label="Nombre" htmlFor="ch-name">
            <Input id="ch-name" defaultValue={c.name} />
          </Field>
          <Field label="Denominación" htmlFor="ch-denom">
            <Input id="ch-denom" defaultValue={c.denomination} />
          </Field>
          <Field label="Ciudad" htmlFor="ch-city">
            <Input id="ch-city" defaultValue={c.city} />
          </Field>
          <Field label="Descripción" htmlFor="ch-desc">
            <Textarea id="ch-desc" defaultValue={c.description} />
          </Field>
          <Button full onClick={() => toast.success("Datos actualizados")}>
            Guardar cambios
          </Button>
        </div>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Horarios de servicio</h2>
        <ul className="mt-2 divide-y divide-border">
          {c.services.map((s) => (
            <li key={`${s.day}-${s.time}`} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{s.type}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.day} · {s.time}
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => toast.success("Horario editado")}>
                Editar
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="outline" full className="mt-3" onClick={() => toast.success("Horario añadido")}>
          <Plus className="size-4" /> Añadir horario
        </Button>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Visibilidad</h2>
        <SettingRow title="Aparecer en el directorio" description="Otros usuarios podrán encontrarte.">
          <Switch defaultChecked aria-label="Aparecer en el directorio" />
        </SettingRow>
        <SettingRow title="Permitir solicitudes de membresía" description="Cualquiera puede pedir unirse.">
          <Switch defaultChecked aria-label="Permitir solicitudes" />
        </SettingRow>
        <SettingRow title="Publicar sermones automáticamente" description="Se publican al subirlos.">
          <Switch aria-label="Publicar automáticamente" />
        </SettingRow>
      </section>
    </div>
  );
}
