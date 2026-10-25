import { BookOpen, Church, Heart, Play, Share2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Rail, SermonCard } from "@/components/cards";
import { GenerativeCover } from "@/components/media/covers";
import { CatalogPlayer } from "@/components/media/MediaPlayer";
import { AddedContentSection } from "@/components/media/AddedContent";
import { AsyncBoundary, DetailSkeleton, GridSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge, Chip } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { share, shareUrl } from "@/native";
import { sermonService } from "@/services";
import { useLibrary } from "@/store";
import { useScreen } from "@/store/screen";
import { churches, users } from "@/store/directory";
import { formatCompact, formatDate, formatDuration, formatLength } from "@/lib/utils";

export function SermonsList() {
  usePageMeta("Sermones", "Predicaciones de iglesias de toda la comunidad.");
  useScreen({ title: "Sermones" });

  const [topic, setTopic] = useState("Todos");
  const sermons = useAsync(() => sermonService.list(), []);

  const topics = ["Todos", ...new Set((sermons.data ?? []).flatMap((s) => s.topics))];
  const visible =
    topic === "Todos" ? sermons.data : sermons.data?.filter((s) => s.topics.includes(topic));

  return (
    <div className="space-y-5">
      <AddedContentSection kind="sermon" />

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {topics.map((t) => (
          <Chip key={t} active={topic === t} onClick={() => setTopic(t)}>
            {t}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={sermons.loading}
        error={sermons.error}
        data={visible}
        reload={sermons.reload}
        skeleton={<GridSkeleton aspect="aspect-video" />}
      >
        {(items) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => (
              <SermonCard key={s.id} sermon={s} />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

export function SermonDetail() {
  const { id = "" } = useParams();
  const sermon = useAsync(() => sermonService.get(id), [id]);
  const related = useAsync(() => sermonService.related(id), [id]);
  const library = useLibrary();

  usePageMeta(sermon.data?.title ?? "Sermón", sermon.data?.description);
  useScreen({ title: sermon.data?.title ?? "Sermón", back: true, hideSections: true }, [
    sermon.data?.id,
  ]);

  if (sermon.loading) return <DetailSkeleton />;
  const s = sermon.data;
  if (!s) return null;

  const preacher = users.find((u) => u.id === s.preacherId);
  const church = churches.find((c) => c.id === s.churchId);
  const saved = library.isSaved("sermon", s.id);

  return (
    <div className="space-y-6">
      <CatalogPlayer
        videoUrl={s.videoUrl}
        seed={s.id}
        gradient={s.color}
        title={s.title}
        durationSec={s.durationSec}
        chapters={s.chapters}
      />

      <header>
        <h1 className="font-display text-xl font-semibold tracking-tight">{s.title}</h1>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {formatDate(s.publishedAt)} · {formatLength(s.durationSec)} ·{" "}
          {formatCompact(s.views)} reproducciones
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="primary">{s.passage}</Badge>
          {s.topics.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      </header>

      <div className="flex gap-2.5">
        <Button
          className="flex-1"
          variant="outline"
          onClick={() => {
            library.toggle("sermon", s.id);
            toast.success(saved ? "Quitado de guardados" : "Guardado en tu biblioteca");
          }}
        >
          <Heart className={saved ? "size-4 fill-current text-primary" : "size-4"} />
          {saved ? "Guardado" : "Guardar"}
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          onClick={async () => {
            const how = await share({
              title: s.title,
              text: `${s.title} — ${s.passage}`,
              url: shareUrl(`/sermons/${s.id}`),
            });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
        >
          <Share2 className="size-4" /> Compartir
        </Button>
      </div>

      {/* Cross-links: preacher, church, passage */}
      <div className="space-y-2.5">
        {preacher && (
          <Link
            to={`/profile/${preacher.id}`}
            className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
          >
            <GenerativeCover
              seed={preacher.id}
              gradient={preacher.color}
              className="size-10 shrink-0"
              rounded="rounded-full"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{preacher.name}</span>
              <span className="block text-xs text-muted-foreground">Predicador</span>
            </span>
          </Link>
        )}
        {church && (
          <Link
            to={`/churches/${church.id}`}
            className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
          >
            <GenerativeCover
              seed={church.id}
              gradient={church.color}
              className="size-10 shrink-0"
              rounded="rounded-lg"
              icon={Church}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{church.name}</span>
              <span className="block text-xs text-muted-foreground">
                {church.city}, {church.country}
              </span>
            </span>
          </Link>
        )}
        <Link
          to="/bible"
          className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <BookOpen className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{s.passage}</span>
            <span className="block text-xs text-muted-foreground">Leer el pasaje</span>
          </span>
        </Link>
      </div>

      <section>
        <h2 className="mb-2 text-section font-semibold">Descripción</h2>
        <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
          {s.description}
        </p>
      </section>

      <section>
        <h2 className="mb-2.5 text-section font-semibold">Capítulos</h2>
        <ol className="space-y-1">
          {s.chapters.map((c) => (
            <li key={c.title}>
              <button
                type="button"
                onClick={() => toast.info(`Saltando a ${c.title}`)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors active:bg-secondary"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                  <Play className="size-3.5 fill-current" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDuration(c.atSec)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <Rail title="Sermones relacionados" size="wide">
        {related.data?.map((r) => (
          <SermonCard key={r.id} sermon={r} />
        ))}
      </Rail>
    </div>
  );
}
