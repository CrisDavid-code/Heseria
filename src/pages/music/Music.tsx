import { Heart, ListMusic, Play, Share2, Shuffle, Users } from "lucide-react";
import { instrumentals } from "@/components/bible/ReadingMusic";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { MediaCard, Rail, SongRow } from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { AddedContentSection } from "@/components/media/AddedContent";
import { AsyncBoundary, DetailSkeleton, GridSkeleton, RailSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge, Chip } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { share, shareUrl } from "@/native";
import { musicService } from "@/services";
import { trackFromSong, useLibrary, usePlayer } from "@/store";
import { useScreen } from "@/store/screen";
import { artists as allArtists } from "@/store/directory";
import { formatCompact } from "@/lib/utils";
import type { Song } from "@/types";

const artistName = (id: string) => allArtists.find((a) => a.id === id)?.name;

function usePlayList() {
  const player = usePlayer();
  return (songs: Song[], index = 0) => {
    player.play(songs.map(trackFromSong), index);
    toast.success("Reproduciendo");
  };
}

/* ----------------------------------------------------------------- index */

export function MusicIndex() {
  usePageMeta("Música", "Adoración, worship y gospel para toda la semana.");
  useScreen({ title: "Música" });

  const playAll = usePlayList();
  const [genre, setGenre] = useState("Todos");

  const songs = useAsync(() => musicService.songs(), []);
  const popular = useAsync(() => musicService.popular(), []);
  const releases = useAsync(() => musicService.newReleases(), []);
  const playlists = useAsync(() => musicService.playlists(), []);
  const artists = useAsync(() => musicService.artists(), []);
  const genres = useAsync(() => musicService.genres(), []);

  const filtered =
    genre === "Todos" ? songs.data : songs.data?.filter((s) => s.genre === genre);
  const calm = useAsync(() => instrumentals(), []);
  const player = usePlayer();

  return (
    <div className="space-y-8">
      {calm.data && calm.data.length > 0 && (
        <section>
          <h2 className="mb-1 text-section font-semibold tracking-tight">Instrumentales para orar y leer</h2>
          <p className="mb-3 text-xs text-muted-foreground">Música original de Heseria, libre de derechos.</p>
          <ul className="space-y-1.5">
            {calm.data.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() =>
                    player.play(
                      calm.data!.map((x) => ({
                        id: `instrumental-${x.id}`, title: x.title, subtitle: `Instrumental · ${x.verse}`,
                        color: "from-cyan-500/70 to-blue-700/70", durationSec: x.durationSec, src: x.src,
                      })),
                      i,
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left active:bg-secondary"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Play className="size-4 fill-current" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block text-xs text-muted-foreground">{t.verse}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {playlists.data?.[0] && (
        <HeroMedia
          seed={playlists.data[0].id}
          title={playlists.data[0].title}
          kind="playlist"
          gradient={playlists.data[0].color}
          className="flex min-h-48 items-end p-5"
        >
          <div className="relative z-10">
            <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
              Playlist destacada
            </Badge>
            <h2 className="font-display text-xl font-semibold text-white">
              {playlists.data[0].title}
            </h2>
            <p className="mt-1 text-sm text-white/80 clamp-2">{playlists.data[0].description}</p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => songs.data && playAll(songs.data.slice(0, 8))}
            >
              <Play className="size-3.5 fill-current" /> Reproducir
            </Button>
          </div>
        </HeroMedia>
      )}

      <AddedContentSection kind={["song", "album"]} title="Añadido recientemente" aspect="aspect-square" />

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        <Chip active={genre === "Todos"} onClick={() => setGenre("Todos")}>
          Todos
        </Chip>
        {genres.data?.map((g) => (
          <Chip key={g} active={genre === g} onClick={() => setGenre(g)}>
            {g}
          </Chip>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="text-section font-semibold tracking-tight">
            {genre === "Todos" ? "Populares ahora" : genre}
          </h2>
          <button
            type="button"
            onClick={() => filtered && playAll(filtered)}
            className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary"
          >
            <Shuffle className="size-3.5" /> Aleatorio
          </button>
        </div>
        <AsyncBoundary
          loading={songs.loading}
          error={songs.error}
          data={filtered}
          reload={songs.reload}
          skeleton={<RailSkeleton />}
        >
          {(items) => (
            <div className="space-y-0.5">
              {items.slice(0, 8).map((s, i) => (
                <SongRow
                  key={s.id}
                  song={s}
                  index={i}
                  artistName={artistName(s.artistId)}
                  onPlay={() => playAll(items, i)}
                />
              ))}
            </div>
          )}
        </AsyncBoundary>
      </section>

      <Rail title="Nuevos lanzamientos" href="/music/artists">
        {releases.loading ? (
          <RailSkeleton />
        ) : (
          releases.data?.map((a) => (
            <MediaCard
              key={a.id}
              to={`/music/albums/${a.id}`}
              seed={a.id}
              gradient={a.color}
              title={a.title}
              subtitle={`${artistName(a.artistId)} · ${a.year}`}
            />
          ))
        )}
      </Rail>

      <Rail title="Playlists" href="/music/playlists">
        {playlists.data?.map((p) => (
          <MediaCard
            key={p.id}
            to={`/music/playlists/${p.id}`}
            seed={p.id}
            gradient={p.color}
            title={p.title}
            subtitle={`${p.trackIds.length} canciones`}
          />
        ))}
      </Rail>

      <Rail title="Artistas" href="/music/artists">
        {artists.data?.map((a) => (
          <Link key={a.id} to={`/music/artists/${a.id}`} className="group min-w-0 text-center">
            <GenerativeCover
              seed={a.id}
              gradient={a.color}
              rounded="rounded-full"
              className="aspect-square w-full transition-transform active:scale-95"
              label={a.name}
            />
            <p className="mt-2 truncate text-sm font-medium">{a.name}</p>
            <p className="truncate text-xs text-muted-foreground">{a.genre}</p>
          </Link>
        ))}
      </Rail>

      <Rail title="Más escuchado" href="/music">
        {popular.data?.slice(0, 10).map((s) => (
          <MediaCard
            key={s.id}
            to={`/music/albums/${s.albumId}`}
            seed={s.id}
            gradient={s.color}
            title={s.title}
            subtitle={artistName(s.artistId)}
            onPlay={() => popular.data && playAll(popular.data, popular.data.indexOf(s))}
          />
        ))}
      </Rail>
    </div>
  );
}

/* --------------------------------------------------------------- artists */

export function ArtistsList() {
  usePageMeta("Artistas", "Artistas y proyectos de adoración en Heseria.");
  useScreen({ title: "Artistas", back: true, hideSections: true });

  const artists = useAsync(() => musicService.artists(), []);

  return (
    <AsyncBoundary {...artists} skeleton={<GridSkeleton />}>
      {(items) => (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((a) => (
            <Link key={a.id} to={`/music/artists/${a.id}`} className="text-center">
              <GenerativeCover
                seed={a.id}
                gradient={a.color}
                rounded="rounded-full"
                className="aspect-square w-full transition-transform active:scale-95"
                label={a.name}
              />
              <p className="mt-2.5 truncate text-sm font-medium">{a.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatCompact(a.monthlyListeners)} oyentes
              </p>
            </Link>
          ))}
        </div>
      )}
    </AsyncBoundary>
  );
}

export function ArtistDetail() {
  const { id = "" } = useParams();
  const playAll = usePlayList();

  const artist = useAsync(() => musicService.artist(id), [id]);
  const songs = useAsync(() => musicService.songsByArtist(id), [id]);
  const albums = useAsync(() => musicService.albumsByArtist(id), [id]);

  usePageMeta(artist.data?.name ?? "Artista", artist.data?.bio);
  useScreen({ title: artist.data?.name ?? "Artista", back: true, hideSections: true }, [
    artist.data?.id,
  ]);

  if (artist.loading) return <DetailSkeleton />;
  const a = artist.data;
  if (!a) return null;

  return (
    <div className="space-y-7">
      <HeroMedia seed={a.id} title={a.name} kind="artist" gradient={a.color} className="flex min-h-52 items-end p-5">
        <div className="relative z-10">
          <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
            {a.genre}
          </Badge>
          <h1 className="font-display text-2xl font-semibold text-white">{a.name}</h1>
          <p className="mt-1 text-sm text-white/80">
            {formatCompact(a.monthlyListeners)} oyentes mensuales · {a.country}
          </p>
        </div>
      </HeroMedia>

      <div className="flex gap-2.5">
        <Button className="flex-1" onClick={() => songs.data && playAll(songs.data)}>
          <Play className="size-4 fill-current" /> Reproducir
        </Button>
        <Button variant="outline" onClick={() => toast.success("Ahora sigues a este artista")}>
          Seguir
        </Button>
        <Button
          variant="outline"
          aria-label="Compartir"
          onClick={async () => {
            const how = await share({ title: a.name, url: shareUrl(`/music/artists/${a.id}`) });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
        >
          <Share2 className="size-4" />
        </Button>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
        {a.bio}
      </p>

      <section>
        <h2 className="mb-3 text-section font-semibold tracking-tight">Canciones</h2>
        <div className="space-y-0.5">
          {songs.data?.map((s, i) => (
            <SongRow
              key={s.id}
              song={s}
              index={i}
              artistName={a.name}
              onPlay={() => songs.data && playAll(songs.data, i)}
            />
          ))}
        </div>
      </section>

      {(albums.data?.length ?? 0) > 0 && (
        <Rail title="Álbumes">
          {albums.data?.map((al) => (
            <MediaCard
              key={al.id}
              to={`/music/albums/${al.id}`}
              seed={al.id}
              gradient={al.color}
              title={al.title}
              subtitle={String(al.year)}
            />
          ))}
        </Rail>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- album */

export function AlbumDetail() {
  const { id = "" } = useParams();
  const playAll = usePlayList();
  const library = useLibrary();

  const album = useAsync(() => musicService.album(id), [id]);
  const songs = useAsync(() => musicService.songsByAlbum(id), [id]);

  usePageMeta(album.data?.title ?? "Álbum");
  useScreen({ title: album.data?.title ?? "Álbum", back: true, hideSections: true }, [
    album.data?.id,
  ]);

  if (album.loading) return <DetailSkeleton />;
  const al = album.data;
  if (!al) return null;

  const saved = library.isSaved("song", al.id);
  const totalSec = songs.data?.reduce((n, s) => n + s.durationSec, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <GenerativeCover
          seed={al.id}
          gradient={al.color}
          rounded="rounded-2xl"
          className="aspect-square w-48 shadow-[var(--shadow-lift)]"
          label={al.title}
        />
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">{al.title}</h1>
        <Link
          to={`/music/artists/${al.artistId}`}
          className="mt-1 text-sm font-medium text-primary"
        >
          {artistName(al.artistId)}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {al.year} · {songs.data?.length ?? 0} canciones · {Math.round(totalSec / 60)} min
        </p>
      </div>

      <div className="flex gap-2.5">
        <Button className="flex-1" onClick={() => songs.data && playAll(songs.data)}>
          <Play className="size-4 fill-current" /> Reproducir
        </Button>
        <Button
          variant="outline"
          aria-label="Guardar"
          onClick={() => {
            library.toggle("song", al.id);
            toast.success(saved ? "Quitado de tu biblioteca" : "Guardado en tu biblioteca");
          }}
        >
          <Heart className={saved ? "size-4 fill-current text-primary" : "size-4"} />
        </Button>
        <Button
          variant="outline"
          aria-label="Compartir"
          onClick={async () => {
            const how = await share({ title: al.title, url: shareUrl(`/music/albums/${al.id}`) });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
        >
          <Share2 className="size-4" />
        </Button>
      </div>

      <div className="space-y-0.5">
        {songs.data?.map((s, i) => (
          <SongRow
            key={s.id}
            song={s}
            index={i}
            artistName={artistName(s.artistId)}
            onPlay={() => songs.data && playAll(songs.data, i)}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- playlists */

export function PlaylistsList() {
  usePageMeta("Playlists", "Playlists para adorar, estudiar y ensayar.");
  useScreen({ title: "Playlists", back: true, hideSections: true });

  const playlists = useAsync(() => musicService.playlists(), []);

  return (
    <AsyncBoundary {...playlists} skeleton={<GridSkeleton />}>
      {(items) => (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((p) => (
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
      )}
    </AsyncBoundary>
  );
}

export function PlaylistDetail() {
  const { id = "" } = useParams();
  const playAll = usePlayList();
  const library = useLibrary();

  const playlist = useAsync(() => musicService.playlist(id), [id]);
  const allSongs = useAsync(() => musicService.songs(), []);

  usePageMeta(playlist.data?.title ?? "Playlist", playlist.data?.description);
  useScreen({ title: playlist.data?.title ?? "Playlist", back: true, hideSections: true }, [
    playlist.data?.id,
  ]);

  if (playlist.loading) return <DetailSkeleton />;
  const p = playlist.data;
  if (!p) return null;

  const tracks = (allSongs.data ?? []).filter((s) => p.trackIds.includes(s.id));
  const saved = library.isSaved("playlist", p.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <GenerativeCover
          seed={p.id}
          gradient={p.color}
          rounded="rounded-2xl"
          className="aspect-square w-48 shadow-[var(--shadow-lift)]"
          icon={ListMusic}
          label={p.title}
        />
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">{p.title}</h1>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{p.description}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" /> {tracks.length} canciones
        </p>
      </div>

      <div className="flex gap-2.5">
        <Button className="flex-1" onClick={() => playAll(tracks)}>
          <Play className="size-4 fill-current" /> Reproducir
        </Button>
        <Button variant="outline" onClick={() => playAll([...tracks].reverse())} aria-label="Aleatorio">
          <Shuffle className="size-4" />
        </Button>
        <Button
          variant="outline"
          aria-label="Guardar"
          onClick={() => {
            library.toggle("playlist", p.id);
            toast.success(saved ? "Quitada de tu biblioteca" : "Guardada en tu biblioteca");
          }}
        >
          <Heart className={saved ? "size-4 fill-current text-primary" : "size-4"} />
        </Button>
      </div>

      <div className="space-y-0.5">
        {tracks.map((s, i) => (
          <SongRow
            key={s.id}
            song={s}
            index={i}
            artistName={artistName(s.artistId)}
            onPlay={() => playAll(tracks, i)}
          />
        ))}
      </div>
    </div>
  );
}
