import { Heart, Share2, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { VideoCard } from "@/components/cards";
import { GenerativeCover } from "@/components/media/covers";
import { CatalogPlayer } from "@/components/media/MediaPlayer";
import { AddedContentSection } from "@/components/media/AddedContent";
import { AsyncBoundary, DetailSkeleton, GridSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge, Chip } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { share, shareUrl } from "@/native";
import { videoService } from "@/services";
import { useLibrary } from "@/store";
import { useScreen } from "@/store/screen";
import { users } from "@/store/directory";
import { formatCompact, formatDate, formatLength } from "@/lib/utils";

const authorOf = (id: string) => users.find((u) => u.id === id);

export function VideosList() {
  usePageMeta("Videos", "Enseñanza, testimonios y contenido de creadores.");
  useScreen({ title: "Videos" });

  const [category, setCategory] = useState("Todos");
  const videos = useAsync(() => videoService.list(), []);
  const categories = ["Todos", ...new Set((videos.data ?? []).map((v) => v.category))];
  const visible =
    category === "Todos" ? videos.data : videos.data?.filter((v) => v.category === category);

  return (
    <div className="space-y-5">
      <AddedContentSection kind="video" />

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {categories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={videos.loading}
        error={videos.error}
        data={visible}
        reload={videos.reload}
        skeleton={<GridSkeleton aspect="aspect-video" />}
      >
        {(items) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((v) => (
              <VideoCard key={v.id} video={v} authorName={authorOf(v.authorId)?.name} />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

export function VideoDetail() {
  const { id = "" } = useParams();
  const video = useAsync(() => videoService.get(id), [id]);
  const library = useLibrary();
  const [liked, setLiked] = useState(false);

  usePageMeta(video.data?.title ?? "Video", video.data?.description);
  useScreen({ title: video.data?.title ?? "Video", back: true, hideSections: true }, [
    video.data?.id,
  ]);

  const related = useAsync(
    () => videoService.list(video.data?.category),
    [video.data?.category],
  );

  if (video.loading) return <DetailSkeleton />;
  const v = video.data;
  if (!v) return null;

  const author = authorOf(v.authorId);
  const saved = library.isSaved("video", v.id);

  return (
    <div className="space-y-6">
      <CatalogPlayer
        videoUrl={v.videoUrl}
        seed={v.id}
        gradient={v.color}
        title={v.title}
        durationSec={v.durationSec}
      />

      <header>
        <h1 className="font-display text-lg font-semibold leading-snug">{v.title}</h1>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {formatCompact(v.views)} vistas · {formatDate(v.publishedAt)} · {formatLength(v.durationSec)}
        </p>
        <Badge variant="primary" className="mt-2.5">
          {v.category}
        </Badge>
      </header>

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        <Button
          size="sm"
          variant={liked ? "secondary" : "outline"}
          onClick={() => {
            setLiked((x) => !x);
            toast.success(liked ? "Ya no te gusta" : "Te gusta este video");
          }}
        >
          <ThumbsUp className={liked ? "size-3.5 fill-current" : "size-3.5"} /> Me gusta
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            library.toggle("video", v.id);
            toast.success(saved ? "Quitado de guardados" : "Guardado");
          }}
        >
          <Heart className={saved ? "size-3.5 fill-current text-primary" : "size-3.5"} />
          {saved ? "Guardado" : "Guardar"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const how = await share({ title: v.title, url: shareUrl(`/videos/${v.id}`) });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
        >
          <Share2 className="size-3.5" /> Compartir
        </Button>
        <Button size="sm" variant="outline" onClick={() => toast.success("Gracias, lo revisaremos")}>
          Reportar
        </Button>
      </div>

      {author && (
        <Link
          to={`/profile/${author.id}`}
          className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
        >
          <GenerativeCover
            seed={author.id}
            gradient={author.color}
            className="size-11 shrink-0"
            rounded="rounded-full"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{author.name}</span>
            <span className="block text-xs text-muted-foreground">
              {formatCompact(author.followers)} seguidores
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            Seguir
          </span>
        </Link>
      )}

      <section>
        <h2 className="mb-2 text-section font-semibold">Descripción</h2>
        <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
          {v.description}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-section font-semibold tracking-tight">Videos relacionados</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {related.data
            ?.filter((r) => r.id !== v.id)
            .slice(0, 4)
            .map((r) => (
              <VideoCard key={r.id} video={r} authorName={authorOf(r.authorId)?.name} />
            ))}
        </div>
      </section>
    </div>
  );
}
