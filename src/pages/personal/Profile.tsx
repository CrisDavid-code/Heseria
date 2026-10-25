import { Church, MapPin, Settings, Share2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CourseCard, MediaCard } from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { PostCard } from "@/pages/community/Community";
import { DetailSkeleton, EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Badge } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { share, shareUrl } from "@/native";
import { communityService, courseService, coverOf, musicService, userService } from "@/services";
import { useSession } from "@/store";
import { useScreen } from "@/store/screen";
import { churches } from "@/store/directory";
import { formatCompact, formatDate } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/permissions";
import { PhotoPicker } from "@/components/profile/PhotoPicker";
import { mediaUrl } from "@/services/api";
import type { User } from "@/types";

/**
 * Portada del perfil: la imagen subida, o el degradado de la cuenta.
 * La foto vive en su propio documento para no pesar cada vez que se lee el
 * perfil; se pide solo aquí, donde se ve.
 */
function CoverImage({ user }: { user: User }) {
  const cover = useAsync(
    () => (user.coverUrl ? coverOf(user.id) : Promise.resolve("")),
    [user.id, user.coverUrl],
  );
  if (cover.data) {
    return <img src={cover.data} alt="" className="h-32 w-full rounded-2xl object-cover sm:h-40" />;
  }
  return <HeroMedia seed={`${user.id}-cover`} gradient={user.color} className="min-h-32" />;
}

/** Avatar: la foto subida, o la portada generada a partir del identificador. */
function AvatarImage({ user }: { user: User }) {
  if (user.avatarUrl) {
    return (
      <img
        src={mediaUrl(user.avatarUrl)}
        alt={user.name}
        className="size-20 rounded-full border-4 border-background object-cover"
      />
    );
  }
  return (
    <GenerativeCover
      seed={user.id}
      gradient={user.color}
      rounded="rounded-full"
      className="size-20 border-4 border-background"
      label={user.name}
    />
  );
}

export default function Profile() {
  const { id } = useParams();
  const { user: me } = useSession();
  const targetId = id ?? me.id;
  const isMe = targetId === me.id;

  const profile = useAsync(() => userService.get(targetId), [targetId]);
  const posts = useAsync(() => communityService.byAuthor(targetId), [targetId]);
  const courses = useAsync(() => courseService.byInstructor(targetId), [targetId]);
  const playlists = useAsync(() => musicService.playlists(), []);
  const [following, setFollowing] = useState(false);

  const user = isMe ? me : profile.data;

  usePageMeta(user?.name ?? "Perfil", user?.bio);
  useScreen(
    {
      title: isMe ? "Mi perfil" : (user?.name ?? "Perfil"),
      back: !isMe,
      hideSections: true,
      actions: isMe ? (
        <Link
          to="/settings"
          aria-label="Configuración"
          className="tap-target grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
        >
          <Settings className="size-5" />
        </Link>
      ) : null,
    },
    [targetId, isMe],
  );

  if (profile.loading && !isMe) return <DetailSkeleton />;
  if (!user) return null;

  const church = churches.find((c) => c.id === user.churchId);
  const myPlaylists = playlists.data?.filter((p) => p.ownerId === user.id) ?? [];

  return (
    <div className="space-y-6">
      <div className="relative">
        {/* Portada: imagen propia si la hay, y si no el degradado de la cuenta. */}
        {isMe ? (
          <PhotoPicker kind="cover" hasPhoto={Boolean(user.coverUrl)} className="relative block w-full">
            <CoverImage user={user} />
          </PhotoPicker>
        ) : (
          <CoverImage user={user} />
        )}

        {isMe ? (
          <PhotoPicker
            kind="avatar"
            hasPhoto={Boolean(user.avatarUrl)}
            className="absolute -bottom-9 left-4 block size-20"
          >
            <AvatarImage user={user} />
          </PhotoPicker>
        ) : (
          <div className="absolute -bottom-9 left-4 size-20">
            <AvatarImage user={user} />
          </div>
        )}

      </div>

      <div className="pt-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight">{user.name}</h1>
            <p className="text-sm text-muted-foreground">@{user.handle}</p>
          </div>
          <Badge variant="primary" className="mt-1 shrink-0">
            {ROLE_LABELS[user.role]}
          </Badge>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground" data-selectable>
          {user.bio}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" /> {user.city}, {user.country}
          </span>
          {church && (
            <Link to={`/churches/${church.id}`} className="flex items-center gap-1 hover:text-primary">
              <Church className="size-3.5" /> {church.name}
            </Link>
          )}
          <span>Miembro desde {formatDate(user.joinedAt)}</span>
        </div>

        <div className="mt-4 flex gap-5 text-sm">
          <span>
            <strong className="tabular-nums">{formatCompact(user.followers)}</strong>{" "}
            <span className="text-muted-foreground">seguidores</span>
          </span>
          <span>
            <strong className="tabular-nums">{formatCompact(user.following)}</strong>{" "}
            <span className="text-muted-foreground">siguiendo</span>
          </span>
        </div>

        {user.ministries.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {user.ministries.map((m) => (
              <Badge key={m} variant="outline">
                {m}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-5 flex gap-2.5">
          {isMe ? (
            <Button asChild className="flex-1" variant="outline">
              <Link to="/settings">Editar perfil</Link>
            </Button>
          ) : (
            <>
              <Button
                className="flex-1"
                variant={following ? "secondary" : "primary"}
                onClick={async () => {
                  await userService.follow(user.id);
                  setFollowing((v) => !v);
                  toast.success(following ? "Dejaste de seguir" : `Ahora sigues a ${user.firstName}`);
                }}
              >
                <UserPlus className="size-4" /> {following ? "Siguiendo" : "Seguir"}
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link to="/messages">Mensaje</Link>
              </Button>
            </>
          )}
          <Button
            variant="outline"
            aria-label="Compartir perfil"
            onClick={async () => {
              const how = await share({ title: user.name, url: shareUrl(`/profile/${user.id}`) });
              if (how === "clipboard") toast.success("Enlace copiado");
            }}
          >
            <Share2 className="size-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="actividad">
        <TabsList>
          <TabsTrigger value="actividad">Actividad</TabsTrigger>
          <TabsTrigger value="cursos">Cursos</TabsTrigger>
          <TabsTrigger value="playlists">Playlists</TabsTrigger>
        </TabsList>

        <TabsContent value="actividad">
          {posts.data?.length ? (
            <div className="space-y-4">
              {posts.data.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={isMe ? "Aún no has publicado" : "Sin publicaciones todavía"}
              description={
                isMe
                  ? "Comparte un testimonio o una reflexión con tu comunidad."
                  : "Cuando publique algo, aparecerá aquí."
              }
              actionLabel={isMe ? "Ir a la comunidad" : undefined}
              actionHref={isMe ? "/community" : undefined}
            />
          )}
        </TabsContent>

        <TabsContent value="cursos">
          {courses.data?.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {courses.data.map((c) => (
                <CourseCard key={c.id} course={c} instructorName={user.name} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sin cursos publicados"
              description="Los cursos que imparta aparecerán en esta pestaña."
            />
          )}
        </TabsContent>

        <TabsContent value="playlists">
          {myPlaylists.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {myPlaylists.map((p) => (
                <MediaCard
                  key={p.id}
                  to={`/music/playlists/${p.id}`}
                  seed={p.id}
                  gradient={p.color}
                  title={p.title}
                  subtitle={`${p.trackIds.length} canciones`}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sin playlists públicas"
              description="Las playlists que cree y comparta se mostrarán aquí."
              actionLabel="Explorar música"
              actionHref="/music"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
