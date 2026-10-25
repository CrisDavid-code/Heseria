/**
 * HESERIA — Podcasts por RSS.
 *
 * Esto es audio de verdad: se escucha dentro de la app, se adelanta y se guarda
 * en el teléfono para oírlo sin datos. Un feed de podcast publica su MP3 sin
 * cifrar justo para eso, así que aquí no hay que pedirle permiso a nadie ni
 * romper las condiciones de nadie.
 */
import {
  Clock,
  Download,
  Headphones,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { GenerativeCover } from "@/components/media/covers";
import { AsyncBoundary, DetailSkeleton, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Field, Input } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { downloadToDevice, mediaUrl } from "@/services/api";
import {
  libraryService, podcastFeedService, type PodcastEpisode, type PodcastFeed,
} from "@/services";
import { useSession } from "@/store";
import { useScreen } from "@/store/screen";
import { cn, formatDate, formatLength } from "@/lib/utils";

/** Quien puede publicar puede suscribir programas para toda la comunidad. */
const PUBLISHERS = ["admin", "pastor", "church_admin", "teacher", "creator", "artist"];

/* ------------------------------------------------------------- portada */

/** La portada del programa si la publica; si no, la generada de siempre. */
function ShowCover({
  image,
  seed,
  color,
  title,
  className,
  rounded = "rounded-xl",
}: {
  image?: string;
  seed: string;
  color?: string;
  title: string;
  className?: string;
  rounded?: string;
}) {
  if (image) {
    return (
      <img
        src={mediaUrl(image)}
        alt={title}
        loading="lazy"
        className={cn("shrink-0 object-cover", rounded, className)}
      />
    );
  }
  return (
    <GenerativeCover
      seed={seed}
      gradient={color}
      className={cn("shrink-0", className)}
      rounded={rounded}
      icon={Headphones}
      title={title}
      kind="podcast"
    />
  );
}

/* ------------------------------------------------------------ episodio */

export function EpisodeRow({ episode }: { episode: PodcastEpisode }) {
  const [percent, setPercent] = useState<number | null>(null);

  async function download() {
    setPercent(0);
    try {
      const name = `${episode.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80)}.mp3`;
      const result = await downloadToDevice(episode.audioUrl, name, setPercent);
      await libraryService.download(episode.id, "podcast", Math.round(episode.sizeBytes / 1048576));
      toast.success(
        result.where === "device" ? `Guardado en ${result.detail}` : `Descargando: ${result.detail}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descargar.");
    } finally {
      setPercent(null);
    }
  }

  return (
    <article className="surface-card p-3.5">
      <div className="flex items-start gap-3">
        <ShowCover
          image={episode.image}
          seed={episode.id}
          color={episode.color}
          title={episode.showTitle}
          className="size-14"
          rounded="rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-semibold leading-snug clamp-2">
            {episode.title}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="truncate">{episode.showTitle}</span>
            <span aria-hidden>·</span>
            <span>{formatDate(episode.publishedAt)}</span>
            {episode.durationSec > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" /> {formatLength(episode.durationSec)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {episode.description && (
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground clamp-3" data-selectable>
          {episode.description}
        </p>
      )}

      {/*
        El audio se reproduce directo desde el servidor de quien publica el
        podcast: un <audio> no necesita permisos CORS para sonar.
      */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        src={mediaUrl(episode.audioUrl)}
        controls
        preload="none"
        className="mt-3 w-full"
      >
        Tu navegador no puede reproducir este audio.
      </audio>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[0.68rem] text-muted-foreground">
          {episode.sizeBytes > 0 ? `${Math.round(episode.sizeBytes / 1048576)} MB` : ""}
        </span>
        <Button size="sm" variant="outline" loading={percent != null} onClick={() => void download()}>
          <Download className="size-3.5" />
          {percent != null && percent > 0 ? `${percent} %` : "Descargar"}
        </Button>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------- listado */

export function PodcastFeedsList() {
  usePageMeta("Podcasts", "Programas con episodios que puedes descargar y oír sin conexión.");
  useScreen({ title: "Podcasts" });

  const { user } = useSession();
  const canPublish = user != null && PUBLISHERS.includes(user.role);

  const feeds = useAsync(() => podcastFeedService.list(), []);
  const latest = useAsync(() => podcastFeedService.latest(12), []);
  const [addOpen, setAddOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [adding, setAdding] = useState(false);

  async function subscribe() {
    setAdding(true);
    try {
      const result = await podcastFeedService.subscribe(feedUrl.trim());
      toast.success(`${result.feed.title}: ${result.added} episodios`);
      setFeedUrl("");
      setAddOpen(false);
      feeds.reload();
      latest.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo añadir el podcast.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      {canPublish && (
        <Button variant="outline" full onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Añadir un podcast por su feed
        </Button>
      )}

      <section>
        <h2 className="mb-3 text-section font-semibold tracking-tight">Programas</h2>
        <AsyncBoundary
          loading={feeds.loading}
          error={feeds.error}
          data={feeds.data}
          reload={feeds.reload}
          skeleton={<ListSkeleton />}
        >
          {(items) =>
            items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                Todavía no hay podcasts.
                {canPublish
                  ? " Añade el feed de un programa y sus episodios aparecerán aquí."
                  : " Pronto habrá programas para escuchar."}
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((f) => (
                  <FeedRow key={f.id} feed={f} />
                ))}
              </div>
            )
          }
        </AsyncBoundary>
      </section>

      <section>
        <h2 className="mb-3 text-section font-semibold tracking-tight">Lo más reciente</h2>
        <AsyncBoundary
          loading={latest.loading}
          error={latest.error}
          data={latest.data}
          reload={latest.reload}
          skeleton={<ListSkeleton />}
        >
          {(items) =>
            items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                Aquí aparecerán los últimos episodios de todos los programas.
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((e) => (
                  <EpisodeRow key={e.id} episode={e} />
                ))}
              </div>
            )
          }
        </AsyncBoundary>
      </section>

      <BottomSheet open={addOpen} onOpenChange={setAddOpen}>
        <BottomSheetContent
          title="Añadir un podcast"
          description="Pega la dirección del feed RSS del programa."
        >
          <Field label="Dirección del feed" htmlFor="feed-url" required>
            <Input
              id="feed-url"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://ejemplo.com/podcast.xml"
              inputMode="url"
              autoComplete="off"
            />
          </Field>

          <p className="mt-2.5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Rss className="mt-0.5 size-3.5 shrink-0" />
            Los episodios quedan disponibles para escuchar y descargar dentro de Heseria. Solo se
            guarda la ficha; el audio sigue viviendo en el servidor de quien publica el programa.
          </p>

          <Button
            full
            size="lg"
            className="mt-4"
            loading={adding}
            disabled={feedUrl.trim().length < 8}
            onClick={() => void subscribe()}
          >
            Añadir
          </Button>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

function FeedRow({ feed }: { feed: PodcastFeed }) {
  return (
    <Link
      to={`/podcasts/feed/${feed.id}`}
      className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
    >
      <ShowCover
        image={feed.image}
        seed={feed.id}
        color={feed.color}
        title={feed.title}
        className="size-12"
        rounded="rounded-lg"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{feed.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {feed.author || "Sin autor"} · {feed.episodes} episodios
        </span>
      </span>
      {feed.syncError && (
        <TriangleAlert className="size-4 shrink-0 text-warning" aria-label="Hubo un problema al leer el feed" />
      )}
    </Link>
  );
}

/* ---------------------------------------------------------------- ficha */

export function PodcastFeedDetail() {
  const { id = "" } = useParams();
  const { user } = useSession();
  const feed = useAsync(() => podcastFeedService.get(id, 100), [id]);
  const [syncing, setSyncing] = useState(false);

  usePageMeta(feed.data?.title ?? "Podcast");
  useScreen({ title: feed.data?.title ?? "Podcast", back: true, hideSections: true }, [
    feed.data?.id,
  ]);

  if (feed.loading) return <DetailSkeleton />;
  const f = feed.data;
  if (!f) return null;

  const mine = user != null && (f.addedBy === user.id || user.role === "admin");

  async function sync() {
    setSyncing(true);
    try {
      const result = await podcastFeedService.sync(id);
      toast.success(
        result.added > 0 ? `${result.added} episodios nuevos` : "No hay episodios nuevos",
      );
      feed.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3.5">
        <ShowCover
          image={f.image}
          seed={f.id}
          color={f.color}
          title={f.title}
          className="size-24"
          rounded="rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold leading-tight">{f.title}</h1>
          {f.author && <p className="mt-0.5 text-sm text-muted-foreground">{f.author}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="primary">{f.episodes} episodios</Badge>
            {f.categories.slice(0, 2).map((c) => (
              <Badge key={c} variant="outline">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      </header>

      {f.description && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground" data-selectable>
          {f.description}
        </p>
      )}

      {f.syncError && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/8 p-3 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          La última lectura del feed falló: {f.syncError}
        </p>
      )}

      {mine && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" loading={syncing} onClick={() => void sync()}>
            <RefreshCw className="size-4" /> Buscar episodios nuevos
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await podcastFeedService.remove(f.id);
              toast.success("Podcast quitado");
              history.back();
            }}
            aria-label="Quitar este podcast"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-section font-semibold tracking-tight">Episodios</h2>
        <div className="space-y-3">
          {f.items.map((e) => (
            <EpisodeRow key={e.id} episode={e} />
          ))}
        </div>
      </section>
    </div>
  );
}
