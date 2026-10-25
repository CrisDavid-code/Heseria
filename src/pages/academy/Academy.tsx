import {
  Award, BookOpen, Check, ChevronRight, ClipboardList, FileText, GraduationCap, MapPin,
  NotebookPen, PlayCircle, Star, Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CourseCard, Rail } from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { CatalogPlayer } from "@/components/media/MediaPlayer";
import { AsyncBoundary, DetailSkeleton, GridSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { SimpleSelect, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Chip, Progress, Textarea } from "@/components/ui/primitives";
import { FileLibrary } from "@/components/files/Files";
import { useSession } from "@/store";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { haptic } from "@/native";
import { bibleService, courseService } from "@/services";
import type { Lesson } from "@/types";
import { useScreen } from "@/store/screen";
import { users } from "@/store/directory";
import { cn, formatCompact } from "@/lib/utils";

const instructorOf = (id: string) => users.find((u) => u.id === id);

const MUSIC_CATEGORIES = ["Música", "Instrumentos", "Producción", "Danza"];

/* --------------------------------------------------------------- academy */

export function AcademyIndex() {
  usePageMeta("Academia", "Cursos de Biblia, teología, liderazgo y formación musical.");
  useScreen({ title: "Academia" });

  const [category, setCategory] = useState("Todos");
  const courses = useAsync(() => courseService.list(), []);
  const categories = useAsync(() => courseService.categories(), []);
  const mine = useAsync(() => courseService.myCourses(), []);

  const visible =
    category === "Todos" ? courses.data : courses.data?.filter((c) => c.category === category);
  const musicCourses = courses.data?.filter((c) => MUSIC_CATEGORIES.includes(c.category)) ?? [];

  return (
    <div className="space-y-8">
      <HeroMedia
        seed="academia"
        kind="course"
        gradient="from-lime-400/70 to-teal-800/70"
        className="flex min-h-44 items-end p-5"
      >
        <div className="relative z-10">
          <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
            Academia Heseria
          </Badge>
          <h2 className="font-display text-xl font-semibold text-white">
            Fórmate para servir mejor
          </h2>
          <p className="mt-1 text-sm text-white/80">
            {courses.data?.length ?? 0} cursos con módulos, tareas y certificado.
          </p>
        </div>
      </HeroMedia>

      {(mine.data?.length ?? 0) > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-section font-semibold tracking-tight">Continuar aprendiendo</h2>
            <Link to="/courses" className="shrink-0 text-xs font-medium text-muted-foreground">
              Mis cursos
            </Link>
          </div>
          <div className="space-y-3">
            {mine.data?.slice(0, 3).map((c) => (
              <Link
                key={c.id}
                to={`/courses/${c.id}/learn`}
                className="surface-card flex items-center gap-3.5 p-4 transition-colors active:bg-secondary"
              >
                <GenerativeCover
                  seed={c.id}
                  gradient={c.color}
                  className="size-14 shrink-0"
                  rounded="rounded-xl"
                  icon={GraduationCap}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-semibold">{c.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.category}</p>
                  <Progress value={c.progress} className="mt-2" label={`${c.progress} %`} />
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        <Chip active={category === "Todos"} onClick={() => setCategory("Todos")}>
          Todos
        </Chip>
        {categories.data?.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={courses.loading}
        error={courses.error}
        data={visible}
        reload={courses.reload}
        skeleton={<GridSkeleton aspect="aspect-video" />}
      >
        {(items) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <CourseCard key={c.id} course={c} instructorName={instructorOf(c.instructorId)?.name} />
            ))}
          </div>
        )}
      </AsyncBoundary>

      {musicCourses.length > 0 && (
        <section>
          <h2 className="mb-1 text-section font-semibold tracking-tight">Formación musical</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Guitarra, piano, batería, bajo, canto, producción y dirección. Presencial, online o
            híbrida.
          </p>
          <div className="space-y-2.5">
            {musicCourses.map((c) => (
              <Link
                key={c.id}
                to={`/courses/${c.id}`}
                className="surface-card flex items-center gap-3.5 p-3.5 transition-colors active:bg-secondary"
              >
                <GenerativeCover
                  seed={c.id}
                  gradient={c.color}
                  className="size-12 shrink-0"
                  rounded="rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline">{c.modality}</Badge>
                    {c.city && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="size-3" /> {c.city}
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- catalog */

export function CoursesList() {
  usePageMeta("Mis cursos", "Los cursos en los que estás inscrito.");
  useScreen({ title: "Mis cursos", back: true, hideSections: true });

  const [level, setLevel] = useState("");
  const [modality, setModality] = useState("");
  const mine = useAsync(() => courseService.myCourses(), []);
  const all = useAsync(() => courseService.list({ level, modality }), [level, modality]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">En curso</TabsTrigger>
          <TabsTrigger value="all">Catálogo</TabsTrigger>
        </TabsList>

        <TabsContent value="mine">
          <AsyncBoundary
            {...mine}
            skeleton={<GridSkeleton aspect="aspect-video" />}
            empty={
              <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                <GraduationCap className="mx-auto mb-3 size-6 text-muted-foreground" />
                <h3 className="font-display text-base font-semibold">Aún no tienes cursos</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
                  Explora la academia y empieza tu primera formación.
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link to="/academy">Ver academia</Link>
                </Button>
              </div>
            }
          >
            {(items) => (
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    instructorName={instructorOf(c.instructorId)?.name}
                  />
                ))}
              </div>
            )}
          </AsyncBoundary>
        </TabsContent>

        <TabsContent value="all">
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            <SimpleSelect
              value={level}
              onValueChange={setLevel}
              options={[
                { value: "", label: "Todos los niveles" },
                { value: "Inicial", label: "Inicial" },
                { value: "Intermedio", label: "Intermedio" },
                { value: "Avanzado", label: "Avanzado" },
              ]}
              ariaLabel="Nivel"
            />
            <SimpleSelect
              value={modality}
              onValueChange={setModality}
              options={[
                { value: "", label: "Todas las modalidades" },
                { value: "Online", label: "Online" },
                { value: "Presencial", label: "Presencial" },
                { value: "Híbrido", label: "Híbrido" },
              ]}
              ariaLabel="Modalidad"
            />
          </div>
          <AsyncBoundary {...all} skeleton={<GridSkeleton aspect="aspect-video" />}>
            {(items) => (
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    instructorName={instructorOf(c.instructorId)?.name}
                  />
                ))}
              </div>
            )}
          </AsyncBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------------------------------------------------- course detail */

export function CourseDetail() {
  const { id = "" } = useParams();
  const course = useAsync(() => courseService.get(id), [id]);
  const [enrolled, setEnrolled] = useState(false);

  usePageMeta(course.data?.title ?? "Curso", course.data?.description);
  useScreen({ title: course.data?.title ?? "Curso", back: true, hideSections: true }, [
    course.data?.id,
  ]);

  if (course.loading) return <DetailSkeleton />;
  const c = course.data;
  if (!c) return null;

  const instructor = instructorOf(c.instructorId);
  const lessons = c.modules.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="space-y-6">
      <HeroMedia seed={c.id} title={c.title} kind="course" gradient={c.color} className="flex min-h-52 items-end p-5">
        <div className="relative z-10">
          <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
            {c.category}
          </Badge>
          <h1 className="font-display text-xl font-semibold text-white">{c.title}</h1>
          <p className="mt-1 text-sm text-white/80">
            {c.level} · {c.modality} · {c.durationHours} h
          </p>
        </div>
      </HeroMedia>

      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div className="rounded-xl border border-border p-3">
          <Star className="mx-auto size-4 text-warning" />
          <p className="mt-1 font-display text-base font-semibold tabular-nums">{c.rating}</p>
          <p className="text-[0.65rem] text-muted-foreground">Valoración</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <Users className="mx-auto size-4 text-primary" />
          <p className="mt-1 font-display text-base font-semibold tabular-nums">
            {formatCompact(c.students)}
          </p>
          <p className="text-[0.65rem] text-muted-foreground">Estudiantes</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <BookOpen className="mx-auto size-4 text-primary" />
          <p className="mt-1 font-display text-base font-semibold tabular-nums">{lessons}</p>
          <p className="text-[0.65rem] text-muted-foreground">Lecciones</p>
        </div>
      </div>

      {c.progress > 0 && (
        <div className="surface-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Tu progreso</p>
            <span className="text-xs tabular-nums text-muted-foreground">{c.progress} %</span>
          </div>
          <Progress value={c.progress} label={`Progreso: ${c.progress} %`} />
        </div>
      )}

      <Button
        full
        size="lg"
        asChild={enrolled || c.progress > 0}
        loading={false}
        onClick={
          enrolled || c.progress > 0
            ? undefined
            : async () => {
                await courseService.enroll(c.id);
                setEnrolled(true);
                haptic("success");
                toast.success("Inscripción confirmada");
              }
        }
      >
        {enrolled || c.progress > 0 ? (
          <Link to={`/courses/${c.id}/learn`}>
            <PlayCircle className="size-4" /> Continuar curso
          </Link>
        ) : (
          <span>Inscribirme gratis</span>
        )}
      </Button>

      {instructor && (
        <Link
          to={`/profile/${instructor.id}`}
          className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
        >
          <GenerativeCover
            seed={instructor.id}
            gradient={instructor.color}
            className="size-11 shrink-0"
            rounded="rounded-full"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{instructor.name}</span>
            <span className="block text-xs text-muted-foreground">Instructor · {instructor.city}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      <section>
        <h2 className="mb-2 text-section font-semibold">Descripción</h2>
        <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
          {c.description}
        </p>
      </section>

      <section>
        <h2 className="mb-2.5 text-section font-semibold">Requisitos</h2>
        <ul className="space-y-2">
          {c.requirements.map((r) => (
            <li key={r} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              {r}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-section font-semibold">Contenido del curso</h2>
        <div className="space-y-3">
          {c.modules.map((m, i) => (
            <div key={m.id} className="surface-card overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">Módulo {i + 1}</p>
                <p className="mt-0.5 text-sm font-semibold">{m.title}</p>
              </div>
              <ul>
                {m.lessons.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0"
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full",
                        l.completed ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {l.completed ? (
                        <Check className="size-3.5" strokeWidth={3} />
                      ) : l.type === "video" ? (
                        <PlayCircle className="size-3.5" />
                      ) : l.type === "reading" ? (
                        <FileText className="size-3.5" />
                      ) : l.type === "quiz" ? (
                        <ClipboardList className="size-3.5" />
                      ) : (
                        <NotebookPen className="size-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{l.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {l.durationMin} min
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {c.certificate && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/8 p-4">
          <Award className="size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Al completar el curso recibirás un certificado descargable de la Academia Heseria.
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- course player */

/**
 * Lección de lectura: la enseñanza, el pasaje completo de la Reina-Valera 1960
 * (va dentro de la app, se lee sin conexión) y las preguntas de estudio.
 */
function ReadingLesson({ lesson }: { lesson: Lesson }) {
  const passage = lesson.passage!;
  const chapter = useAsync(
    () => bibleService.chapter(passage.book, passage.chapter),
    [passage.book, passage.chapter],
  );

  return (
    <article className="space-y-4">
      {lesson.body?.map((p, i) => (
        <p key={i} className="text-sm leading-relaxed" data-selectable>
          {p}
        </p>
      ))}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold">
            {chapter.data ? `${chapter.data.bookName} ${chapter.data.chapter}` : "Cargando pasaje…"}
          </h2>
          <Link
            to={`/bible/${passage.book}/${passage.chapter}`}
            className="text-xs font-medium text-primary"
          >
            Abrir en la Biblia
          </Link>
        </div>
        <div className="max-h-96 overflow-y-auto pr-1 text-[0.95rem] leading-relaxed" data-selectable>
          {chapter.data?.verses.map((v) => (
            <p key={v.number} className="mb-1.5">
              <sup className="mr-1 text-[0.65rem] font-semibold text-primary">{v.number}</sup>
              {v.text}
            </p>
          ))}
        </div>
        <p className="mt-2 text-[0.65rem] text-muted-foreground">Reina-Valera 1960 © Sociedades Bíblicas Unidas</p>
      </section>

      {lesson.questions && lesson.questions.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Para pensar</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            {lesson.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">Escribe tus respuestas en «Notas».</p>
        </section>
      )}
    </article>
  );
}

export function CourseLearn() {
  const { id = "" } = useParams();
  const { user } = useSession();
  const course = useAsync(() => courseService.get(id), [id]);
  const [activeLesson, setActiveLesson] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [note, setNote] = useState("");
  const [contentOpen, setContentOpen] = useState(false);

  usePageMeta(course.data ? `Aprendiendo: ${course.data.title}` : "Curso");
  useScreen({ title: course.data?.title ?? "Curso", back: true, hideSections: true }, [
    course.data?.id,
  ]);

  if (course.loading) return <DetailSkeleton />;
  const c = course.data;
  if (!c) return null;

  const canTeach = user != null && ["admin", "teacher", "pastor", "church_admin"].includes(user.role);
  const lessons = c.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleTitle: m.title })));
  const current = lessons.find((l) => l.id === activeLesson) ?? lessons[0];
  const doneCount = lessons.filter((l) => l.completed || completed.includes(l.id)).length;
  const progress = Math.round((doneCount / lessons.length) * 100);
  const index = lessons.findIndex((l) => l.id === current.id);

  return (
    <div className="space-y-5">
      {current.passage ? (
        <ReadingLesson lesson={current} />
      ) : (
        <CatalogPlayer
          videoUrl={current.videoUrl}
          seed={current.id}
          gradient={c.color}
          title={current.title}
          durationSec={current.durationMin * 60}
        />
      )}

      <div>
        <p className="text-xs text-muted-foreground">{current.moduleTitle}</p>
        <h1 className="mt-1 font-display text-lg font-semibold leading-snug">{current.title}</h1>
        <div className="mt-3">
          <Progress value={progress} label={`Progreso del curso: ${progress} %`} />
          <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
            {doneCount} de {lessons.length} lecciones · {progress} %
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" onClick={() => setContentOpen(true)}>
          <ClipboardList className="size-4" /> Contenido
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            setNote(await courseService.note(c.id, current.id).catch(() => ""));
            setNotesOpen(true);
          }}
        >
          <NotebookPen className="size-4" /> Notas
        </Button>
      </div>

      <Button
        full
        onClick={() => {
          setCompleted((prev) =>
            prev.includes(current.id) ? prev : [...prev, current.id],
          );
          courseService.completeLesson(c.id, current.id);
          haptic("success");
          toast.success("Lección completada");
          const next = lessons[index + 1];
          if (next) setActiveLesson(next.id);
        }}
      >
        <Check className="size-4" /> Marcar como completada
      </Button>

      <div className="flex gap-2.5">
        <Button
          variant="ghost"
          className="flex-1"
          disabled={index === 0}
          onClick={() => setActiveLesson(lessons[index - 1].id)}
        >
          Anterior
        </Button>
        <Button
          variant="ghost"
          className="flex-1"
          disabled={index === lessons.length - 1}
          onClick={() => setActiveLesson(lessons[index + 1].id)}
        >
          Siguiente
        </Button>
      </div>

      {/*
        Material de la lección: lo publica quien enseña y solo lo baja quien
        está matriculado. Cada lección tiene el suyo, así que la lista cambia
        al avanzar de clase.
      */}
      <FileLibrary
        scope="lesson"
        scopeId={current.id}
        courseId={c.id}
        title="Materiales de esta lección"
        emptyText="Esta lección todavía no tiene materiales para descargar."
        visibility="enrolled"
        canUpload={canTeach}
        uploadLabel="Publicar material"
      />

      <FileLibrary
        scope="course"
        scopeId={c.id}
        title="Material del curso"
        emptyText="Aquí aparecerá el material general del curso."
        visibility="enrolled"
        canUpload={canTeach}
        uploadLabel="Publicar material del curso"
      />

      {/* Course contents */}
      <BottomSheet open={contentOpen} onOpenChange={setContentOpen}>
        <BottomSheetContent title="Contenido del curso" description={`${lessons.length} lecciones`}>
          {c.modules.map((m, i) => (
            <div key={m.id} className="mb-4">
              <p className="mb-1.5 px-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Módulo {i + 1} · {m.title}
              </p>
              <ul className="space-y-0.5">
                {m.lessons.map((l) => {
                  const isDone = l.completed || completed.includes(l.id);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveLesson(l.id);
                          setContentOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors active:bg-secondary",
                          l.id === current.id && "bg-primary/10",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-full",
                            isDone ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground",
                          )}
                        >
                          {isDone ? <Check className="size-3.5" strokeWidth={3} /> : <PlayCircle className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{l.title}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {l.durationMin} min
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </BottomSheetContent>
      </BottomSheet>

      {/* Notes */}
      <BottomSheet open={notesOpen} onOpenChange={setNotesOpen}>
        <BottomSheetContent title="Notas de la lección" description={current.title}>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Escribe tus apuntes…"
            className="min-h-40"
            autoFocus
          />
          <Button
            full
            size="lg"
            className="mt-4"
            onClick={async () => {
              try {
                await courseService.saveNote(c.id, current.id, note);
                toast.success("Nota guardada");
                setNotesOpen(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
              }
            }}
          >
            Guardar nota
          </Button>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
