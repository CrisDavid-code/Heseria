import { ChevronRight, Headphones, Play, Rss, Share2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { MediaCard } from "@/components/cards";
import { GenerativeCover } from "@/components/media/covers";
import { AddedContentSection } from "@/components/media/AddedContent";
import { AsyncBoundary, DetailSkeleton, GridSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge, Chip } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { mediaUrl } from "@/services/api";
import { share, shareUrl } from "@/native";
import { podcastService } from "@/services";
import { useLibrary, usePlayer } from "@/store";
import { useScreen } from "@/store/screen";
import { formatDate, formatLength } from "@/lib/utils";

export function PodcastsList() {
  usePageMeta("Podcasts", "Conversaciones semanales sobre fe, familia y liderazgo.");
  useScreen({ title: "Podcasts" });

  const [category, setCategory] = useState("Todos");
  const podcasts = useAsync(() => podcastService.list(), []);
  const categories = ["Todos", ...new Set((podcasts.data ?? []).map((p) => p.category))];
  const visible =
    category === "Todos" ? podcasts.data : podcasts.data?.filter((p) => p.category === category);

  return (
    <div className="space-y-5">
      {/*
        Los programas por RSS son los que traen audio descargable de verdad, así
        que se ofrecen antes que el catálogo de demostración.
      */}
      <Link
        to="/podcasts/suscritos"
        className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/8 p-3.5 transition-colors active:bg-primary/12"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Rss className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Programas suscritos</span>
          <span className="block text-xs text-muted-foreground">
            Episodios que puedes escuchar y descargar para oír sin conexión
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      <AddedContentSection kind="podcast" aspect="aspect-square" />

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {categories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={podcasts.loading}
        error={podcasts.error}
        data={visible}
        reload={podcasts.reload}
        skeleton={<GridSkeleton />}
      >
        {(items) => (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {items.map((p) => (
              <MediaCard
                key={p.id}
                to={`/podcasts/${p.id}`}
                seed={p.id}
                gradient={p.color}
                title={p.title}
                subtitle={p.host}
                icon={Headphones}
              />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

export function PodcastDetail() {
  const { id = "" } = useParams();
  const podcast = useAsync(() => podcastService.get(id), [id]);
  const player = usePlayer();
  const library = useLibrary();
  const [following, setFollowing] = useState(false);

  usePageMeta(podcast.data?.title ?? "Podcast", podcast.data?.description);
  useScreen({ title: podcast.data?.title ?? "Podcast", back: true, hideSections: true }, [
    podcast.data?.id,
  ]);

  if (podcast.loading) return <DetailSkeleton />;
  const p = podcast.data;
  if (!p) return null;

  const saved = library.isSaved("podcast", p.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <GenerativeCover
          seed={p.id}
          gradient={p.color}
          rounded="rounded-2xl"
          className="aspect-square w-44 shadow-[var(--shadow-lift)]"
          icon={Headphones}
          label={p.title}
        />
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">{p.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{p.host}</p>
        <Badge variant="primary" className="mt-2.5">
          {p.category}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
        {p.description}
      </p>

      <div className="flex gap-2.5">
        <Button
          className="flex-1"
          variant={following ? "secondary" : "primary"}
          onClick={() => {
            setFollowing((v) => !v);
            toast.success(following ? "Dejaste de seguir" : "Ahora sigues este podcast");
          }}
        >
          {following ? "Siguiendo" : "Seguir"}
        </Button>
        <Button
          variant="outline"
          aria-label="Guardar"
          onClick={() => {
            library.toggle("podcast", p.id);
            toast.success(saved ? "Quitado de guardados" : "Guardado");
          }}
        >
          {saved ? "Guardado" : "Guardar"}
        </Button>
        <Button
          variant="outline"
          aria-label="Compartir"
          onClick={async () => {
            const how = await share({ title: p.title, url: shareUrl(`/podcasts/${p.id}`) });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
        >
          <Share2 className="size-4" />
        </Button>
      </div>

      <section>
        <h2 className="mb-3 text-section font-semibold tracking-tight">
          Episodios ({p.episodes.length})
        </h2>
        <ol className="space-y-2">
          {p.episodes.map((e) => (
            <li key={e.id} className="surface-card p-4">
              <p className="text-xs text-muted-foreground">
                {formatDate(e.publishedAt)} · {formatLength(e.durationSec)}
              </p>
              <h3 className="mt-1 font-display text-sm font-semibold leading-snug">{e.title}</h3>
              <p className="mt-1.5 text-xs text-muted-foreground clamp-2">{e.description}</p>
              <Button
                size="sm"
                variant="subtle"
                className="mt-3"
                onClick={() => {
                  player.playTrack({
                    id: e.id,
                    title: e.title,
                    subtitle: p.title,
                    color: p.color,
                    durationSec: e.durationSec,
                    src: e.audioUrl ? mediaUrl(e.audioUrl) : undefined,
                  });
                  toast.success("Reproduciendo episodio");
                }}
              >
                <Play className="size-3.5 fill-current" /> Reproducir
              </Button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
