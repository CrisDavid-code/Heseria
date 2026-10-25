import { Heart, Music, Share2 } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { MediaPlayer } from "@/components/media/MediaPlayer";
import { DetailSkeleton, EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { isAudio, PROVIDER_LABEL } from "@/lib/media-source";
import { share, shareUrl } from "@/native";
import { contentService } from "@/services";
import { useLibrary, usePlayer } from "@/store";
import { mediaUrl } from "@/services/api";
import { MEDIA_KIND_LABEL } from "@/store/content";
import { useScreen } from "@/store/screen";
import { formatDate, formatLength } from "@/lib/utils";

export default function ContentDetail() {
  const { id = "" } = useParams();
  const item = useAsync(() => contentService.get(id), [id]);
  const player = usePlayer();
  const library = useLibrary();

  // Telemetría: queda registrado en el servidor que esta cuenta lo vio, y eso
  // alimenta las métricas de «quiénes lo vieron y quiénes no».
  useEffect(() => {
    if (id) void contentService.recordView(id).catch(() => undefined);
  }, [id]);

  usePageMeta(item.data?.title ?? "Contenido", item.data?.description);
  useScreen({ title: item.data?.title ?? "Contenido", back: true, hideSections: true }, [
    item.data?.id,
  ]);

  if (item.loading) return <DetailSkeleton />;
  const c = item.data;
  if (!c) {
    return (
      <EmptyState
        title="Este contenido ya no existe"
        description="Puede que se haya eliminado del catálogo."
        actionLabel="Ir a explorar"
        actionHref="/explore"
      />
    );
  }

  const saved = library.isSaved("content", c.id);
  const audioPlayable = isAudio(c.source.provider) && Boolean(c.source.url);

  return (
    <div className="space-y-6">
      <MediaPlayer
        source={c.source}
        title={c.title}
        seed={c.id}
        gradient={c.color}
        durationSec={c.durationSec}
      />

      <header>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="primary">{MEDIA_KIND_LABEL[c.kind]}</Badge>
          <Badge variant="outline">{c.category}</Badge>
          <Badge variant="outline">{PROVIDER_LABEL[c.source.provider] ?? "Enlace"}</Badge>
          {c.status !== "publicado" && <Badge variant="warning">{c.status}</Badge>}
        </div>
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">{c.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {c.subtitle}
          {c.durationSec > 0 && ` · ${formatLength(c.durationSec)}`}
          {` · añadido el ${formatDate(c.createdAt)}`}
        </p>
      </header>

      <div className="flex gap-2.5">
        {audioPlayable && (
          <Button
            className="flex-1"
            onClick={() => {
              player.playTrack({
                id: c.id,
                title: c.title,
                subtitle: c.subtitle,
                color: c.color,
                durationSec: c.durationSec || 210,
                src: mediaUrl(c.source.url),
              });
              toast.success("Reproduciendo en el reproductor global");
            }}
          >
            <Music className="size-4" /> Escuchar
          </Button>
        )}
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            library.toggle("content", c.id);
            toast.success(saved ? "Quitado de guardados" : "Guardado en tu biblioteca");
          }}
        >
          <Heart className={saved ? "size-4 fill-current text-primary" : "size-4"} />
          {saved ? "Guardado" : "Guardar"}
        </Button>
        <Button
          variant="outline"
          aria-label="Compartir"
          onClick={async () => {
            const how = await share({
              title: c.title,
              text: c.description,
              url: shareUrl(`/content/${c.id}`),
            });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
        >
          <Share2 className="size-4" />
        </Button>
      </div>

      {c.description && (
        <section>
          <h2 className="mb-2 text-section font-semibold">Descripción</h2>
          <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
            {c.description}
          </p>
        </section>
      )}

      {c.source.originalUrl && (
        <section>
          <h2 className="mb-2 text-section font-semibold">Fuente</h2>
          <p className="break-all rounded-xl border border-border p-3 text-xs text-muted-foreground">
            {c.source.originalUrl}
          </p>
        </section>
      )}
    </div>
  );
}
