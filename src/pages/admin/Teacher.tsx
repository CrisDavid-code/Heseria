import {
  Award, BookOpen, ClipboardList, FileText, GraduationCap, Plus, Trash2, Users, Video,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AdminList, AdminSections, BarsChart, KpiRow, QuickActions, RecentActivity, TrendChart,
  type AdminRow,
} from "@/components/admin/AdminKit";
import { DetailSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent, SheetAction } from "@/components/ui/overlays";
import { Badge, Field, Input, Progress, Textarea } from "@/components/ui/primitives";
import { FileLibrary } from "@/components/files/Files";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { analyticsService, courseService } from "@/services";
import { useSession } from "@/store";
import { useScreen } from "@/store/screen";
import { users } from "@/store/directory";
import { formatCompact } from "@/lib/utils";
import type { Course } from "@/types";

const SECTIONS = [
  { label: "Mis cursos", href: "/teacher/courses", icon: GraduationCap, description: "Crear y editar cursos" },
  { label: "Estudiantes", href: "/teacher/students", icon: Users, description: "Progreso e inscripciones" },
  { label: "Tareas", href: "/teacher/assignments", icon: ClipboardList, description: "Entregas por revisar" },
  { label: "Evaluaciones", href: "/teacher/evaluations", icon: FileText, description: "Cuestionarios y notas" },
  { label: "Certificados", href: "/teacher/certificates", icon: Award, description: "Emisión y descargas" },
  { label: "Estadísticas", href: "/teacher/analytics", icon: BookOpen, description: "Audiencia y retención" },
];

export function TeacherDashboard() {
  usePageMeta("Portal docente", "Gestiona tus cursos y estudiantes.");
  useScreen({ title: "Portal docente", back: true, hideSections: true });

  const kpis = useAsync(() => analyticsService.kpis("teacher"), []);
  const series = useAsync(() => analyticsService.series("teacher"), []);
  const activity = useAsync(() => analyticsService.activity("teacher"), []);
  const courses = useAsync(() => courseService.list(), []);

  return (
    <div className="space-y-6">
      <KpiRow kpis={kpis.data} />
      <QuickActions
        actions={[
          { label: "Nuevo curso", icon: Plus, href: "/teacher/courses/new" },
          { label: "Subir lección", icon: Video, onClick: () => toast.success("Subida iniciada") },
          { label: "Revisar tareas", icon: ClipboardList, href: "/teacher/assignments" },
          { label: "Certificados", icon: Award, href: "/teacher/certificates" },
        ]}
      />
      <TrendChart title="Inscripciones por mes" data={series.data} />
      <RecentActivity items={activity.data} />
      <AdminSections links={SECTIONS} />
    </div>
  );
}

export function TeacherCourses() {
  usePageMeta("Mis cursos", "Cursos que impartes en la Academia.");
  useScreen({ title: "Mis cursos", back: true, hideSections: true });

  const navigate = useNavigate();
  const courses = useAsync(() => courseService.list(), []);

  const rows: AdminRow[] =
    courses.data?.slice(0, 10).map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: `${c.category} · ${c.modules.length} módulos`,
      meta: formatCompact(c.students),
      color: c.color,
      href: `/teacher/courses/${c.id}`,
      status: {
        label: c.progress > 0 ? "Publicado" : "Borrador",
        tone: c.progress > 0 ? ("success" as const) : ("warning" as const),
      },
    })) ?? [];

  return (
    <div className="space-y-4">
      <Button full onClick={() => navigate("/teacher/courses/new")}>
        <Plus className="size-4" /> Crear curso
      </Button>
      <AdminList
        rows={rows}
        filters={[
          { key: "pub", label: "Publicados", test: (r) => r.status?.label === "Publicado" },
          { key: "bor", label: "Borradores", test: (r) => r.status?.label === "Borrador" },
        ]}
        sorts={[{ key: "az", label: "Título (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]}
      />
    </div>
  );
}

/* -------------------------------------------------------- course builder */

interface DraftLesson {
  id: string;
  title: string;
  type: "video" | "reading" | "quiz" | "assignment";
  durationMin: number;
}
interface DraftModule {
  id: string;
  title: string;
  lessons: DraftLesson[];
}

const LESSON_TYPES = [
  { value: "video", label: "Video" },
  { value: "reading", label: "Lectura" },
  { value: "assignment", label: "Tarea" },
  { value: "quiz", label: "Cuestionario" },
];

function CourseBuilder({ mode, courseId }: { mode: "new" | "edit"; courseId?: string }) {
  const navigate = useNavigate();
  const existing = useAsync(
    () => (courseId ? courseService.get(courseId) : Promise.resolve(undefined)),
    [courseId],
  );

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Biblia");
  const [level, setLevel] = useState("Inicial");
  const [modality, setModality] = useState("Online");
  const [description, setDescription] = useState("");
  const [modules, setModules] = useState<DraftModule[]>([
    { id: "m1", title: "Fundamentos", lessons: [] },
  ]);
  const [lessonFor, setLessonFor] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonType, setLessonType] = useState<DraftLesson["type"]>("video");

  const [saving, setSaving] = useState(false);

  const source = existing.data;
  const displayTitle = title || source?.title || "";

  /**
   * Guarda el curso en el catálogo del servidor. Se envía el documento
   * completo, no solo el título: así el curso queda utilizable de inmediato en
   * la Academia, para cualquier persona y sin actualizar la app.
   */
  async function save(publish: boolean) {
    if (displayTitle.trim().length < 2) {
      toast.error("Escribe un título para el curso.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(courseId ? { id: courseId } : {}),
        title: displayTitle.trim(),
        category,
        level,
        modality,
        description: description.trim() || source?.description || "",
        requirements: source?.requirements ?? [],
        students: source?.students ?? 0,
        rating: source?.rating ?? 0,
        durationHours: Math.max(1, Math.round(
          modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.durationMin, 0), 0) / 60,
        )),
        certificate: source?.certificate ?? false,
        progress: 0,
        instructorId: source?.instructorId,
        modules: modules.map((m) => ({
          id: m.id,
          title: m.title,
          lessons: m.lessons.map((l) => ({ ...l, completed: false })),
        })),
      };
      await courseService.save(payload as Partial<Course>);
      toast.success(
        publish
          ? mode === "new"
            ? "Curso publicado. Ya está en la Academia."
            : "Cambios publicados"
          : "Borrador guardado",
      );
      if (publish) navigate("/teacher/courses");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el curso.");
    } finally {
      setSaving(false);
    }
  }

  function addModule() {
    setModules((m) => [...m, { id: `m${m.length + 1}`, title: `Módulo ${m.length + 1}`, lessons: [] }]);
  }

  function addLesson() {
    if (!lessonFor || !lessonTitle.trim()) return;
    setModules((prev) =>
      prev.map((m) =>
        m.id === lessonFor
          ? {
              ...m,
              lessons: [
                ...m.lessons,
                {
                  id: `${m.id}l${m.lessons.length + 1}`,
                  title: lessonTitle,
                  type: lessonType,
                  durationMin: 12,
                },
              ],
            }
          : m,
      ),
    );
    setLessonTitle("");
    setLessonFor(null);
    toast.success("Lección añadida");
  }

  if (mode === "edit" && existing.loading) return <DetailSkeleton />;

  return (
    <div className="space-y-5">
      <section className="surface-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Información del curso</h2>
        <div className="space-y-3">
          <Field label="Título" htmlFor="c-title" required>
            <Input
              id="c-title"
              value={displayTitle}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Por ejemplo: Panorama bíblico"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Categoría">
              <SimpleSelect
                value={category}
                onValueChange={setCategory}
                options={[
                  "Biblia", "Teología", "Liderazgo", "Evangelismo", "Discipulado", "Familia",
                  "Jóvenes", "Música", "Instrumentos", "Danza", "Producción", "Tecnología",
                  "Ministerio", "Misiones",
                ].map((c) => ({ value: c, label: c }))}
                ariaLabel="Categoría"
              />
            </Field>
            <Field label="Nivel">
              <SimpleSelect
                value={level}
                onValueChange={setLevel}
                options={["Inicial", "Intermedio", "Avanzado"].map((l) => ({ value: l, label: l }))}
                ariaLabel="Nivel"
              />
            </Field>
          </div>
          <Field label="Modalidad">
            <SimpleSelect
              value={modality}
              onValueChange={setModality}
              options={["Online", "Presencial", "Híbrido"].map((m) => ({ value: m, label: m }))}
              ariaLabel="Modalidad"
            />
          </Field>
          <Field label="Descripción">
            <Textarea
              value={description || source?.description || ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿Qué aprenderán tus estudiantes?"
            />
          </Field>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-section font-semibold tracking-tight">Contenido</h2>
          <Button size="sm" variant="outline" onClick={addModule}>
            <Plus className="size-3.5" /> Módulo
          </Button>
        </div>

        <div className="space-y-3">
          {modules.map((m, i) => (
            <div key={m.id} className="surface-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">Módulo {i + 1}</span>
                  <input
                    value={m.title}
                    onChange={(e) =>
                      setModules((prev) =>
                        prev.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)),
                      )
                    }
                    aria-label={`Título del módulo ${i + 1}`}
                    className="w-full bg-transparent text-sm font-semibold outline-none"
                  />
                </span>
                <button
                  type="button"
                  onClick={() => setModules((prev) => prev.filter((x) => x.id !== m.id))}
                  aria-label={`Eliminar módulo ${i + 1}`}
                  className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {m.lessons.length > 0 && (
                <ul className="divide-y divide-border">
                  {m.lessons.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Badge variant="outline">{LESSON_TYPES.find((t) => t.value === l.type)?.label}</Badge>
                      <span className="min-w-0 flex-1 truncate text-sm">{l.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {l.durationMin} min
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => setLessonFor(m.id)}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-primary transition-colors active:bg-secondary"
              >
                <Plus className="size-4" /> Añadir lección
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Recursos y certificado</h2>

        {/*
          El material se sube contra el curso, así que necesita que el curso
          exista. En un curso nuevo se dice, en lugar de ofrecer un botón que no
          tendría dónde guardar nada.
        */}
        {courseId ? (
          <FileLibrary
            scope="course"
            scopeId={courseId}
            emptyText="Sin material todavía. Sube el PDF de la guía, la presentación o las lecturas."
            visibility="enrolled"
            canUpload
            uploadLabel="Adjuntar material"
            className="mb-3"
          />
        ) : (
          <p className="mb-3 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            Guarda el curso primero y aquí podrás adjuntar el material: solo lo verán quienes se
            matriculen.
          </p>
        )}

        <div className="space-y-0.5">
          <SheetAction
            icon={Award}
            label="Emitir certificado al completar"
            description="Se genera automáticamente"
            onClick={() => toast.success("Certificado activado")}
          />
        </div>
      </section>

      <div className="flex gap-2.5">
        <Button variant="outline" className="flex-1" onClick={() => void save(false)}>
          Guardar borrador
        </Button>
        <Button className="flex-[2]" loading={saving} onClick={() => void save(true)}>
          {mode === "new" ? "Publicar curso" : "Publicar cambios"}
        </Button>
      </div>

      <BottomSheet open={lessonFor !== null} onOpenChange={(v) => !v && setLessonFor(null)}>
        <BottomSheetContent title="Nueva lección">
          <div className="space-y-3">
            <Field label="Título" htmlFor="l-title" required>
              <Input
                id="l-title"
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="Por ejemplo: Introducción al Pentateuco"
                autoFocus
              />
            </Field>
            <Field label="Tipo">
              <SimpleSelect
                value={lessonType}
                onValueChange={(v) => setLessonType(v as DraftLesson["type"])}
                options={LESSON_TYPES}
                ariaLabel="Tipo de lección"
              />
            </Field>
            <Button full size="lg" disabled={!lessonTitle.trim()} onClick={addLesson}>
              Añadir lección
            </Button>
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

export function TeacherCourseNew() {
  usePageMeta("Nuevo curso", "Crea un curso para la Academia.");
  useScreen({ title: "Nuevo curso", back: true, hideSections: true });
  return <CourseBuilder mode="new" />;
}

export function TeacherCourseEdit() {
  const { id } = useParams();
  usePageMeta("Editar curso");
  useScreen({ title: "Editar curso", back: true, hideSections: true });
  return <CourseBuilder mode="edit" courseId={id} />;
}

export function TeacherCourseDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const course = useAsync(() => courseService.get(id), [id]);

  usePageMeta(course.data?.title ?? "Curso");
  useScreen({ title: course.data?.title ?? "Curso", back: true, hideSections: true }, [id]);

  if (course.loading) return <DetailSkeleton />;
  const c = course.data;
  if (!c) return null;

  const lessons = c.modules.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Estudiantes</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums">
            {formatCompact(c.students)}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Valoración</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums">{c.rating}</p>
        </div>
      </div>

      <div className="surface-card p-4">
        <p className="text-sm font-medium">Contenido</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {c.modules.length} módulos · {lessons} lecciones · {c.durationHours} h
        </p>
        <Progress value={100} className="mt-3" label="Curso completo" />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" onClick={() => navigate(`/teacher/courses/${c.id}/edit`)}>
          Editar curso
        </Button>
        <Button variant="outline" onClick={() => navigate("/teacher/students")}>
          Ver estudiantes
        </Button>
        <Button variant="outline" onClick={() => toast.success("Curso despublicado")}>
          Despublicar
        </Button>
        <Button variant="outline" onClick={() => navigate(`/courses/${c.id}`)}>
          Ver como alumno
        </Button>
      </div>
    </div>
  );
}

export function TeacherStudents() {
  usePageMeta("Estudiantes", "Progreso de tus estudiantes.");
  useScreen({ title: "Estudiantes", back: true, hideSections: true });

  const rows: AdminRow[] = users.slice(0, 20).map((u, i) => ({
    id: u.id,
    title: u.name,
    subtitle: `${u.city} · progreso ${10 + ((i * 13) % 90)} %`,
    meta: `${10 + ((i * 13) % 90)} %`,
    color: u.color,
    status:
      i % 4 === 0
        ? { label: "Completado", tone: "success" as const }
        : { label: "En curso", tone: "primary" as const },
  }));

  return (
    <AdminList
      rows={rows}
      selectable
      filters={[
        { key: "curso", label: "En curso", test: (r) => r.status?.label === "En curso" },
        { key: "completo", label: "Completados", test: (r) => r.status?.label === "Completado" },
      ]}
      sorts={[{ key: "az", label: "Nombre (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]}
      onRowAction={() => toast.success("Mensaje enviado al estudiante")}
    />
  );
}

export function TeacherAssignments() {
  usePageMeta("Tareas", "Entregas pendientes de revisión.");
  useScreen({ title: "Tareas", back: true, hideSections: true });

  const rows: AdminRow[] = users.slice(0, 14).map((u, i) => ({
    id: `as-${u.id}`,
    title: `Entrega de ${u.name}`,
    subtitle: ["Panorama bíblico", "Liderazgo de equipos", "Evangelismo relacional"][i % 3],
    color: u.color,
    status:
      i % 3 === 0
        ? { label: "Revisada", tone: "success" as const }
        : { label: "Pendiente", tone: "warning" as const },
  }));

  return (
    <AdminList
      rows={rows}
      filters={[
        { key: "pend", label: "Pendientes", test: (r) => r.status?.label === "Pendiente" },
        { key: "rev", label: "Revisadas", test: (r) => r.status?.label === "Revisada" },
      ]}
      onRowAction={() => toast.success("Tarea calificada")}
    />
  );
}

export function TeacherEvaluations() {
  usePageMeta("Evaluaciones", "Cuestionarios y resultados.");
  useScreen({ title: "Evaluaciones", back: true, hideSections: true });
  const breakdown = useAsync(() => analyticsService.breakdown("teacher"), []);

  const rows: AdminRow[] = [
    { id: "ev1", title: "Cuestionario módulo 1", subtitle: "Panorama bíblico · 240 respuestas", meta: "84 %" },
    { id: "ev2", title: "Evaluación final", subtitle: "Liderazgo de equipos · 118 respuestas", meta: "78 %" },
    { id: "ev3", title: "Autoevaluación", subtitle: "Discipulado uno a uno · 96 respuestas", meta: "91 %" },
    { id: "ev4", title: "Cuestionario módulo 2", subtitle: "Evangelismo relacional · 152 respuestas", meta: "88 %" },
  ];

  return (
    <div className="space-y-5">
      <BarsChart title="Promedio por evaluación" data={breakdown.data} />
      <Button full onClick={() => toast.success("Evaluación creada")}>
        <Plus className="size-4" /> Crear evaluación
      </Button>
      <AdminList rows={rows} onRowAction={() => toast.info("Abriendo resultados")} />
    </div>
  );
}

export function TeacherCertificates() {
  usePageMeta("Certificados", "Certificados emitidos a tus estudiantes.");
  useScreen({ title: "Certificados", back: true, hideSections: true });

  const rows: AdminRow[] = users.slice(0, 12).map((u, i) => ({
    id: `cert-${u.id}`,
    title: u.name,
    subtitle: ["Panorama bíblico", "Evangelismo relacional", "Discipulado uno a uno"][i % 3],
    meta: `HSR-${1000 + i}`,
    color: u.color,
    status:
      i % 5 === 0
        ? { label: "Pendiente", tone: "warning" as const }
        : { label: "Emitido", tone: "success" as const },
  }));

  return (
    <AdminList
      rows={rows}
      filters={[
        { key: "emit", label: "Emitidos", test: (r) => r.status?.label === "Emitido" },
        { key: "pend", label: "Pendientes", test: (r) => r.status?.label === "Pendiente" },
      ]}
      onRowAction={() => toast.success("Certificado emitido")}
    />
  );
}

export function TeacherAnalytics() {
  usePageMeta("Estadísticas docentes", "Audiencia y retención de tus cursos.");
  useScreen({ title: "Estadísticas", back: true, hideSections: true });

  const kpis = useAsync(() => analyticsService.kpis("teacher"), []);
  const series = useAsync(() => analyticsService.series("teacher"), []);
  const breakdown = useAsync(() => analyticsService.breakdown("teacher"), []);

  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis.data} />
      <TrendChart title="Estudiantes activos" subtitle="Últimos 9 meses" data={series.data} />
      <BarsChart title="Finalización por curso" data={breakdown.data} />
    </div>
  );
}
