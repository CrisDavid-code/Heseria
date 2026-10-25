import { CheckCircle2, Share2 } from "lucide-react";
import { ReadingMusic } from "@/components/bible/ReadingMusic";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { DevotionalCard } from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { AsyncBoundary, DetailSkeleton, GridSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge, Chip } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { share, shareUrl } from "@/native";
import { devotionalService } from "@/services";
import { useLibrary } from "@/store";
import { useScreen } from "@/store/screen";
import { users } from "@/store/directory";
import { formatDate } from "@/lib/utils";

const authorName = (id: string) => users.find((u) => u.id === id)?.name;

/* ------------------------------------------------------------------ list */

export function DevotionalsList() {
  usePageMeta("Devocionales", "Un devocional diario para acompañar tu semana.");
  useScreen({ title: "Devocionales" });

  const [topic, setTopic] = useState("Todos");
  const list = useAsync(() => devotionalService.list(), []);
  const today = useAsync(() => devotionalService.today(), []);

  const topics = ["Todos", ...new Set((list.data ?? []).flatMap((d) => d.topics))];
  const visible =
    topic === "Todos" ? list.data : list.data?.filter((d) => d.topics.includes(topic));

  return (
    <div className="space-y-6">
      {today.data && (
        <HeroMedia
          seed={today.data.id}
          title={today.data.title}
          kind="devotional"
          gradient={today.data.color}
          className="flex min-h-52 items-end p-5"
        >
          <div className="relative z-10">
            <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
              Hoy
            </Badge>
            <h2 className="font-display text-xl font-semibold text-white">{today.data.title}</h2>
            <p className="mt-1 text-sm text-white/80">
              {today.data.verse.ref} · {today.data.minutes} min
            </p>
            <Button asChild size="sm" className="mt-4">
              <a href={`/devotionals/${today.data.id}`}>Leer ahora</a>
            </Button>
          </div>
        </HeroMedia>
      )}

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {topics.map((t) => (
          <Chip key={t} active={topic === t} onClick={() => setTopic(t)}>
            {t}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={list.loading}
        error={list.error}
        data={visible}
        reload={list.reload}
        skeleton={<GridSkeleton aspect="aspect-video" />}
      >
        {(items) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((d) => (
              <DevotionalCard key={d.id} devotional={d} authorName={authorName(d.authorId)} />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

/* ---------------------------------------------------------------- detail */

export function DevotionalDetail() {
  const { id = "" } = useParams();
  const devotional = useAsync(() => devotionalService.get(id), [id]);
  const library = useLibrary();
  const [done, setDone] = useState(false);

  usePageMeta(devotional.data?.title ?? "Devocional", devotional.data?.verse.text);
  useScreen({ title: devotional.data?.title ?? "Devocional", back: true, hideSections: true }, [
    devotional.data?.id,
  ]);

  if (devotional.loading) return <DetailSkeleton />;
  const d = devotional.data;
  if (!d) return null;

  const saved = library.isSaved("verse", d.verse.ref);

  return (
    <article className="space-y-6" data-selectable>
      <ReadingMusic />
      <GenerativeCover
        seed={d.id}
        gradient={d.color}
        rounded="rounded-2xl"
        className="aspect-video w-full"
        label={d.title}
      />

      <header>
        <p className="text-xs text-muted-foreground">
          {authorName(d.authorId)} · {formatDate(d.date)} · {d.minutes} min de lectura
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">{d.title}</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {d.topics.map((t) => (
            <Badge key={t} variant="primary">
              {t}
            </Badge>
          ))}
        </div>
      </header>

      <blockquote className="rounded-2xl border-l-2 border-primary bg-surface p-4">
        <p className="font-display text-lg leading-snug">“{d.verse.text}”</p>
        <footer className="mt-2 text-sm font-medium text-primary">{d.verse.ref}</footer>
      </blockquote>

      <section className="space-y-4">
        <h2 className="text-section font-semibold">Reflexión</h2>
        {d.reflection.map((p, i) => (
          <p key={i} className="leading-relaxed text-muted-foreground">
            {p}
          </p>
        ))}
      </section>

      <section className="surface-card p-4">
        <h2 className="text-section font-semibold">Oración</h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">{d.prayer}</p>
      </section>

      <div className="flex flex-wrap gap-2.5">
        <Button
          className="flex-1"
          variant={done ? "secondary" : "primary"}
          onClick={() => {
            setDone(true);
            devotionalService.complete(d.id);
            toast.success("Devocional completado. ¡Nos vemos mañana!");
          }}
        >
          <CheckCircle2 className="size-4" /> {done ? "Completado" : "Marcar como completado"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            library.toggle("verse", d.verse.ref);
            toast.success(saved ? "Quitado de guardados" : "Guardado en tu biblioteca");
          }}
        >
          {saved ? "Guardado" : "Guardar"}
        </Button>
        <Button
          variant="outline"
          aria-label="Compartir"
          onClick={async () => {
            const how = await share({
              title: d.title,
              text: `“${d.verse.text}” — ${d.verse.ref}`,
              url: shareUrl(`/devotionals/${d.id}`),
            });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
        >
          <Share2 className="size-4" />
        </Button>
      </div>
    </article>
  );
}
