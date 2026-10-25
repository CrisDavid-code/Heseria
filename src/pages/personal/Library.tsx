import {
  BookMarked, Clock, Download, Film, GraduationCap, Library as LibraryIcon, ListMusic, Music,
  Trash2, Video as VideoIcon, WifiOff,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CourseCard, MediaCard, SongRow } from "@/components/cards";
import { GenerativeCover } from "@/components/media/covers";
import { EmptyState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Badge, Progress } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { libraryService } from "@/services";
import { preferencesStore, trackFromSong, useLibrary, usePlayer, usePreferences } from "@/store";
import { useScreen } from "@/store/screen";
import { artists, users } from "@/store/directory";

const TABS = [
  { id: "guardados", label: "Guardados" },
  { id: "musica", label: "Música" },
  { id: "videos", label: "Videos" },
  { id: "cursos", label: "Cursos" },
  { id: "historial", label: "Historial" },
  { id: "descargas", label: "Descargas" },
];

const artistName = (id: string) => artists.find((a) => a.id === id)?.name;

export default function Library() {
  usePageMeta("Mi biblioteca", "Todo lo que guardaste en Heseria.");
  useScreen({ title: "Mi biblioteca" });

  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "guardados";
  const player = usePlayer();
  const library = useLibrary();
  const { offline } = usePreferences();

  const songs = useAsync(() => libraryService.songs(), []);
  const playlists = useAsync(() => libraryService.playlists(), []);
  const sermons = useAsync(() => libraryService.sermons(), []);
  const courses = useAsync(() => libraryService.courses(), []);
  const videos = useAsync(() => libraryService.videos(), []);
  const verses = useAsync(() => libraryService.verses(), []);
  const history = useAsync(() => libraryService.history(), []);
  const downloads = useAsync(() => libraryService.downloads(), []);

  return (
    <div className="space-y-5">
      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setParams({ tab: t.id })}
            className={
              tab === t.id
                ? "shrink-0 rounded-full border border-primary/40 bg-primary/15 px-3.5 py-1.5 text-xs font-medium text-primary"
                : "shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground active:bg-secondary"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "guardados" && (
        <div className="space-y-7">
          <section>
            <h2 className="mb-3 text-section font-semibold tracking-tight">Versículos</h2>
            <div className="space-y-2">
              {verses.data?.map((v) => (
                <div key={v.ref} className="surface-card p-4">
                  <p className="text-sm leading-relaxed" data-selectable>
                    “{v.text}”
                  </p>
                  <p className="mt-2 text-xs font-medium text-primary">{v.ref}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-section font-semibold tracking-tight">Sermones</h2>
            <div className="space-y-1">
              {sermons.data?.map((s) => (
                <MediaCard
                  key={s.id}
                  to={`/sermons/${s.id}`}
                  seed={s.id}
                  gradient={s.color}
                  title={s.title}
                  subtitle={s.passage}
                  aspect="aspect-video"
                />
              ))}
            </div>
          </section>

        </div>
      )}

      {tab === "musica" && (
        <div className="space-y-7">
          <section>
            <h2 className="mb-3 text-section font-semibold tracking-tight">Playlists</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {playlists.data?.map((p) => (
                <MediaCard
                  key={p.id}
                  to={`/music/playlists/${p.id}`}
                  seed={p.id}
                  gradient={p.color}
                  title={p.title}
                  subtitle={`${p.trackIds.length} canciones`}
                  icon={ListMusic}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-section font-semibold tracking-tight">Canciones guardadas</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (songs.data) {
                    player.play(songs.data.map(trackFromSong));
                    toast.success("Reproduciendo tu biblioteca");
                  }
                }}
              >
                Reproducir
              </Button>
            </div>
            {songs.loading ? (
              <ListSkeleton />
            ) : (
              <div className="space-y-0.5">
                {songs.data?.map((s, i) => (
                  <SongRow
                    key={s.id}
                    song={s}
                    index={i}
                    artistName={artistName(s.artistId)}
                    onPlay={() => songs.data && player.play(songs.data.map(trackFromSong), i)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "videos" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {videos.data?.map((v) => (
            <MediaCard
              key={v.id}
              to={`/videos/${v.id}`}
              seed={v.id}
              gradient={v.color}
              title={v.title}
              subtitle={users.find((u) => u.id === v.authorId)?.name}
              aspect="aspect-video"
              icon={VideoIcon}
            />
          ))}
        </div>
      )}

      {tab === "cursos" &&
        (courses.data?.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.data.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                instructorName={users.find((u) => u.id === c.instructorId)?.name}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={GraduationCap}
            title="Todavía no tienes cursos"
            description="Explora la academia y empieza tu primera formación ministerial."
            actionLabel="Ver academia"
            actionHref="/academy"
          />
        ))}

      {tab === "historial" && (
        <div className="space-y-1">
          {history.data?.map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-xl p-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                <Clock className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{h.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {h.type} · {h.at}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "descargas" && (
        <div className="space-y-4">
          <div className="surface-card flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <WifiOff className="size-4 text-muted-foreground" /> Modo sin conexión
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Simula la experiencia offline con el contenido descargado.
              </p>
            </div>
            <Switch
              checked={offline}
              onCheckedChange={(v) => preferencesStore.set({ offline: v })}
              aria-label="Modo sin conexión"
            />
          </div>

          <div className="rounded-xl border border-warning/25 bg-warning/8 p-3">
            <p className="text-xs text-muted-foreground">
              Las descargas son una simulación visual. El almacenamiento real del dispositivo se
              conectará más adelante.
            </p>
          </div>

          <div className="space-y-2">
            {downloads.data?.map((d, i) => (
              <div key={d.id} className="surface-card p-3.5">
                <div className="flex items-center gap-3">
                  <GenerativeCover
                    seed={d.id}
                    gradient="from-cyan-500/70 to-blue-700/70"
                    className="size-11 shrink-0"
                    rounded="rounded-lg"
                    icon={Music}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.type} · {d.sizeMb} MB
                    </p>
                  </div>
                  {i === 0 ? (
                    <Badge variant="primary">Descargando</Badge>
                  ) : (
                    <Badge variant="success">Disponible</Badge>
                  )}
                  <button
                    type="button"
                    onClick={() => toast.success("Descarga eliminada")}
                    aria-label={`Eliminar descarga de ${d.title}`}
                    className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {i === 0 && <Progress value={62} className="mt-2.5" label="62 % descargado" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
