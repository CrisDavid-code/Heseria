import {
  BookOpen, CalendarDays, Church, FileText, GraduationCap, HandHeart, Heart, LayoutGrid, Mail,
  MessageSquare, Mic2, Plus, Settings as SettingsIcon, UserPlus, Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  messageService, ministryService, notifyUser, prayerService, sermonService, videoService,
} from "@/services";
import type { Church as ChurchT } from "@/types";
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
  const navigate = useNavigate();
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

      <Button
        full
        variant="outline"
        onClick={async () => {
          try {
            const c = await messageService.openWith(member.id);
            navigate(`/messages?c=${c.id}`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo abrir la conversación.");
          }
        }}
      >
        Enviar mensaje
      </Button>
      <p className="text-xs text-muted-foreground">
        Los roles y la suspensión de cuentas los gestiona la administración de Heseria.
      </p>
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
  usePageMeta("Comunicación", "Avisos a la congregación.");
  useScreen({ title: "Comunicación", back: true, hideSections: true });
  const church = useAsync(() => churchService.myChurch(), []);
  const members = useAsync(() => (church.data ? churchService.members(church.data.id) : Promise.resolve([])), [church.data?.id]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  /** El aviso llega de verdad a la campana de cada miembro (users/{id}/notifications). */
  async function send() {
    if (!church.data || !members.data?.length) return;
    if (!confirm(`¿Enviar este aviso a ${members.data.length} miembros?`)) return;
    setBusy(true);
    let sent = 0;
    for (const m of members.data) {
      try {
        await notifyUser(m.id, { category: "iglesia", title: `${church.data.name}: ${subject.trim()}`, body: body.trim(), href: "/my-church" });
        sent++;
      } catch {
        /* se sigue con los demás */
      }
    }
    setBusy(false);
    setSubject("");
    setBody("");
    toast.success(`Aviso enviado a ${sent} de ${members.data.length} miembros`);
  }

  if (church.loading) return <DetailSkeleton />;
  if (!church.data) return <p className="text-sm text-muted-foreground">No administras ninguna iglesia todavía.</p>;
  return (
    <section className="surface-card p-4">
      <h2 className="text-sm font-semibold">Nuevo aviso</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Llega a la campana de los {members.data?.length ?? 0} miembros de {church.data.name}.
      </p>
      <div className="mt-3 space-y-3">
        <Field label="Asunto" htmlFor="msg-subject" required>
          <Input id="msg-subject" value={subject} maxLength={100} onChange={(e) => setSubject(e.target.value)} placeholder="Por ejemplo: cambio de horario del domingo" />
        </Field>
        <Field label="Mensaje" htmlFor="msg-body" required>
          <Textarea id="msg-body" value={body} maxLength={400} onChange={(e) => setBody(e.target.value)} placeholder="Escribe el aviso para la congregación…" />
        </Field>
        <Button full loading={busy} disabled={!subject.trim() || !body.trim() || !members.data?.length} onClick={() => void send()}>
          <Mail className="size-4" /> Enviar aviso
        </Button>
      </div>
    </section>
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
      />
    </div>
  );
}

export function ChurchAdminSettings() {
  usePageMeta("Configuración de la iglesia");
  useScreen({ title: "Configuración", back: true, hideSections: true });
  const church = useAsync(() => churchService.myChurch(), []);
  if (church.loading) return <DetailSkeleton />;
  if (!church.data) return <p className="text-sm text-muted-foreground">No administras ninguna iglesia todavía.</p>;
  return <ChurchSettingsForm church={church.data} onSaved={church.reload} />;
}

/** Ficha de la iglesia: se guarda de verdad (las reglas solo dejan a su administración). */
function ChurchSettingsForm({ church: c, onSaved }: { church: ChurchT; onSaved: () => void }) {
  const [form, setForm] = useState({ name: c.name, denomination: c.denomination, city: c.city, description: c.description });
  const [services, setServices] = useState(c.services.map((x) => ({ ...x })));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const edit = (i: number, patch: Partial<ChurchT["services"][number]>) =>
    setServices(services.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function save() {
    if (!form.name.trim()) return void toast.error("El nombre es obligatorio.");
    setBusy(true);
    try {
      await churchService.update(c.id, { ...form, services });
      toast.success("Datos de la iglesia guardados");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="surface-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Datos de la iglesia</h2>
        <div className="space-y-3">
          <Field label="Nombre" htmlFor="ch-name" required>
            <Input id="ch-name" value={form.name} maxLength={120} onChange={set("name")} />
          </Field>
          <Field label="Denominación" htmlFor="ch-denom">
            <Input id="ch-denom" value={form.denomination} maxLength={80} onChange={set("denomination")} />
          </Field>
          <Field label="Ciudad" htmlFor="ch-city">
            <Input id="ch-city" value={form.city} maxLength={80} onChange={set("city")} />
          </Field>
          <Field label="Descripción" htmlFor="ch-desc">
            <Textarea id="ch-desc" value={form.description} maxLength={2000} onChange={set("description")} />
          </Field>
        </div>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Horarios de servicio</h2>
        <ul className="mt-2 space-y-3">
          {services.map((s, i) => (
            <li key={i} className="space-y-2 rounded-xl border border-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Servicio" htmlFor={`sv-type-${i}`}>
                  <Input id={`sv-type-${i}`} value={s.type} placeholder="Culto" onChange={(e) => edit(i, { type: e.target.value })} />
                </Field>
                <Field label="Día" htmlFor={`sv-day-${i}`}>
                  <Input id={`sv-day-${i}`} value={s.day} placeholder="Domingo" onChange={(e) => edit(i, { day: e.target.value })} />
                </Field>
              </div>
              <div className="flex items-end gap-2">
                <Field label="Hora" htmlFor={`sv-time-${i}`}>
                  <Input id={`sv-time-${i}`} type="time" value={s.time} onChange={(e) => edit(i, { time: e.target.value })} />
                </Field>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setServices(services.filter((_, k) => k !== i))}>
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button variant="outline" full className="mt-3" onClick={() => setServices([...services, { type: "Culto", day: "Domingo", time: "09:00" }])}>
          <Plus className="size-4" /> Añadir horario
        </Button>
      </section>

      <Button full size="lg" loading={busy} onClick={() => void save()}>
        Guardar cambios
      </Button>
    </div>
  );
}
