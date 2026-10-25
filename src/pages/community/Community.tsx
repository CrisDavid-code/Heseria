import {
  Camera, Flag, Heart, Image as ImageIcon, MessageCircle, Plus, Send, Share2, Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { GenerativeCover } from "@/components/media/covers";
import { AsyncBoundary, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent, SheetAction } from "@/components/ui/overlays";
import { Badge, Chip, Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { haptic, share, shareUrl } from "@/native";
import { compressImage } from "@/services/fb";
import { communityService } from "@/services";
import { useSession } from "@/store";
import { useScreen } from "@/store/screen";
import { users } from "@/store/directory";
import { cn, formatCompact, timeAgo } from "@/lib/utils";
import type { Post, PostType } from "@/types";

const FILTERS: { value: string; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "testimonio", label: "Testimonios" },
  { value: "oración", label: "Oración" },
  { value: "reflexión", label: "Reflexiones" },
  { value: "anuncio", label: "Anuncios" },
  { value: "evento", label: "Eventos" },
  { value: "imagen", label: "Fotos" },
];

const authorOf = (id: string) => users.find((u) => u.id === id);

/* ------------------------------------------------------------- post card */

function PostCard({ post, onRemoved }: { post: Post; onRemoved?: () => void }) {
  const author = authorOf(post.authorId);
  const { user } = useSession();
  const [likes, setLikes] = useState(post.likes);
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Post["comments"] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount ?? post.comments.length);
  const [comment, setComment] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const mine = user.id === post.authorId;

  async function openComments() {
    const next = !showComments;
    setShowComments(next);
    // Los comentarios se piden al abrirlos: el feed no carga los de todas.
    if (next && comments === null) {
      const full = await communityService.get(post.id).catch(() => undefined);
      setComments(full?.comments ?? []);
    }
  }

  return (
    <article className="surface-card p-4">
      <header className="flex items-center gap-3">
        <Link to={`/profile/${post.authorId}`} className="shrink-0">
          <GenerativeCover
            seed={post.authorId}
            gradient={author?.color}
            className="size-10"
            rounded="rounded-full"
            label={author?.name ?? ""}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/profile/${post.authorId}`} className="block truncate text-sm font-medium">
            {author?.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {timeAgo(post.createdAt)} · {post.type}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="Más opciones"
          className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
        >
          <span aria-hidden className="text-lg leading-none">···</span>
        </button>
      </header>

      <p className="mt-3 text-sm leading-relaxed" data-selectable>
        {post.body}
      </p>

      {post.image && (
        <img
          src={post.image}
          alt={`Foto de ${author?.name ?? "la publicación"}`}
          loading="lazy"
          className="mt-3 w-full rounded-xl border border-border object-cover"
        />
      )}

      {post.hashtags.length > 0 && (
        <p className="mt-2.5 text-xs font-medium text-primary">{post.hashtags.join(" ")}</p>
      )}

      <footer className="mt-3.5 flex items-center gap-1 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setLiked((v) => !v);
            setLikes((n) => (liked ? n - 1 : n + 1));
            // Quien decide es la base de datos: la tarjeta se ajusta a su respuesta.
            void communityService.like(post.id).then((r) => {
              setLiked(r.liked);
              setLikes(r.likes);
            }).catch(() => undefined);
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs transition-colors",
            liked ? "text-primary" : "text-muted-foreground active:bg-secondary",
          )}
        >
          <Heart className={cn("size-4", liked && "fill-current")} /> {formatCompact(likes)}
        </button>
        <button
          type="button"
          onClick={() => void openComments()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted-foreground transition-colors active:bg-secondary"
        >
          <MessageCircle className="size-4" /> {commentCount}
        </button>
        <button
          type="button"
          onClick={async () => {
            const how = await share({
              title: `Publicación de ${author?.name}`,
              text: post.body,
              url: shareUrl("/community"),
            });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted-foreground transition-colors active:bg-secondary"
        >
          <Share2 className="size-4" /> {post.shares}
        </button>
      </footer>

      {showComments && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {comments === null && <p className="text-xs text-muted-foreground">Cargando comentarios…</p>}
          {comments?.length === 0 && (
            <p className="text-xs text-muted-foreground">Sé la primera persona en comentar.</p>
          )}
          {(comments ?? []).map((c) => {
            const commenter = authorOf(c.authorId);
            return (
              <div key={c.id} className="flex gap-2.5">
                <GenerativeCover
                  seed={c.authorId}
                  gradient={commenter?.color}
                  className="size-8 shrink-0"
                  rounded="rounded-full"
                />
                <div className="min-w-0 flex-1 rounded-xl bg-secondary px-3 py-2">
                  <p className="text-xs font-medium">{commenter?.name}</p>
                  <p className="mt-0.5 text-sm">{c.body}</p>
                </div>
              </div>
            );
          })}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const body = comment.trim();
              if (!body) return;
              setComment("");
              void communityService.comment(post.id, body).then(() => {
                setComments((prev) => [
                  ...(prev ?? []),
                  { id: `nuevo-${Date.now()}`, authorId: user.id, body, createdAt: new Date().toISOString(), likes: 0 },
                ]);
                setCommentCount((n) => n + 1);
              }).catch((err: Error) => toast.error(err.message));
            }}
          >
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Escribe un comentario…"
              aria-label="Comentario"
              className="h-10 flex-1 rounded-full border border-input bg-surface px-3.5 text-sm outline-none focus-visible:border-ring"
            />
            <button
              type="submit"
              disabled={!comment.trim()}
              aria-label="Enviar comentario"
              className="tap-target grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}

      <BottomSheet open={moreOpen} onOpenChange={setMoreOpen}>
        <BottomSheetContent title="Opciones">
          {mine && (
            <SheetAction
              icon={Trash2}
              label="Eliminar publicación"
              destructive
              onClick={async () => {
                setMoreOpen(false);
                await communityService.remove(post.id);
                toast.success("Publicación eliminada");
                onRemoved?.();
              }}
            />
          )}
          <SheetAction
            icon={Flag}
            label="Reportar"
            destructive
            onClick={() => {
              void communityService.report(post.id, "inapropiado");
              setMoreOpen(false);
              toast.success("Gracias. El equipo de moderación lo revisará.");
            }}
          />
        </BottomSheetContent>
      </BottomSheet>
    </article>
  );
}

/* ---------------------------------------------------------------- feed */

export default function Community() {
  usePageMeta("Comunidad", "El feed de tu comunidad en Heseria.");

  const [filter, setFilter] = useState("todo");
  const [composerOpen, setComposerOpen] = useState(false);
  const feed = useAsync(() => communityService.feed(filter), [filter]);
  const { user } = useSession();

  useScreen({
    title: "Comunidad",
    actions: (
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        aria-label="Crear publicación"
        className="tap-target grid place-items-center rounded-full text-primary active:bg-secondary"
      >
        <Plus className="size-5" />
      </button>
    ),
  });

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left"
      >
        <GenerativeCover
          seed={user.id}
          gradient={user.color}
          className="size-10 shrink-0"
          rounded="rounded-full"
        />
        <span className="flex-1 text-sm text-muted-foreground">
          ¿Qué quieres compartir hoy, {user.firstName}?
        </span>
        <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {FILTERS.map((f) => (
          <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        {...feed}
        skeleton={<ListSkeleton />}
        empty={
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <MessageCircle className="mx-auto mb-3 size-6 text-muted-foreground" />
            <h3 className="font-display text-base font-semibold">Nada por aquí todavía</h3>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
              Sé la primera persona en publicar en esta categoría.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setComposerOpen(true)}>
              Crear publicación
            </Button>
          </div>
        }
      >
        {(posts) => (
          <div className="space-y-4">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} onRemoved={feed.reload} />
            ))}
          </div>
        )}
      </AsyncBoundary>

      <Composer open={composerOpen} onOpenChange={setComposerOpen} onDone={feed.reload} />
    </div>
  );
}

/* ------------------------------------------------------------- composer */

function Composer({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { user } = useSession();
  const [body, setBody] = useState("");
  const [type, setType] = useState<PostType>("texto");
  const [media, setMedia] = useState<string | null>(null);
  const [status, setStatus] = useState<"borrador" | "publicando" | "publicado" | "error">("borrador");

  /**
   * Foto de la publicación. Se comprime en el teléfono (máx. 1280 px) y viaja
   * dentro de la publicación: el plan gratuito no tiene Storage.
   */
  function attach(camera: boolean) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (camera) input.setAttribute("capture", "environment");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setMedia(await compressImage(file, 1280, 0.7));
        setType("imagen");
      } catch {
        toast.error("No se pudo usar esa imagen.");
      }
    };
    input.click();
  }

  async function publish() {
    if (!body.trim()) return;
    setStatus("publicando");
    try {
      await communityService.create({
        body,
        type,
        image: media ?? undefined,
        hashtags: body.match(/#[\wáéíóúñ]+/gi) ?? [],
      });
      setStatus("publicado");
      haptic("success");
      toast.success("Publicación compartida");
      setBody("");
      setMedia(null);
      setStatus("borrador");
      onOpenChange(false);
      onDone();
    } catch {
      setStatus("error");
      toast.error("No pudimos publicar. Inténtalo otra vez.");
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="Nueva publicación" fullScreen>
        <div className="mx-auto max-w-md">
          <div className="mb-4 flex items-center gap-3">
            <GenerativeCover
              seed={user.id}
              gradient={user.color}
              className="size-10 shrink-0"
              rounded="rounded-full"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">Visible para la comunidad de Heseria</p>
            </div>
          </div>

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Comparte un testimonio, una reflexión o una petición…"
            className="min-h-44 border-0 bg-transparent p-0 text-base focus-visible:border-0"
            autoFocus
          />

          {media && (
            <div className="relative mt-3">
              <img
                src={media}
                alt="Archivo adjunto"
                className="w-full rounded-xl border border-border"
              />
              <button
                type="button"
                onClick={() => setMedia(null)}
                className="absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white"
              >
                Quitar
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {(["texto", "testimonio", "reflexión", "oración", "anuncio", "evento"] as PostType[]).map(
              (t) => (
                <Chip key={t} active={type === t} onClick={() => setType(t)}>
                  {t}
                </Chip>
              ),
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => attach(false)}>
              <ImageIcon className="size-4" /> Galería
            </Button>
            <Button variant="outline" size="sm" onClick={() => attach(true)}>
              <Camera className="size-4" /> Cámara
            </Button>
          </div>

          {status === "error" && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              No pudimos publicar. Revisa tu conexión.
            </p>
          )}

          <Button
            full
            size="lg"
            className="mt-5"
            disabled={!body.trim()}
            loading={status === "publicando"}
            onClick={publish}
          >
            {status === "publicando" ? "Publicando…" : "Publicar"}
          </Button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Tu publicación pasa por revisión automática antes de mostrarse a toda la comunidad.
          </p>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

export { PostCard };
