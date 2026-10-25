import { Calendar, Info, MessageSquare, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { GroupCard } from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { PostCard } from "@/pages/community/Community";
import { FileLibrary } from "@/components/files/Files";
import { AsyncBoundary, DetailSkeleton, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Badge, Input } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { communityService, groupService } from "@/services";
import { useScreen } from "@/store/screen";
import { churches, users } from "@/store/directory";

export function GroupsList() {
  usePageMeta("Grupos", "Grupos pequeños y equipos de tu iglesia.");
  useScreen({ title: "Grupos" });

  const [q, setQ] = useState("");
  const groups = useAsync(() => groupService.list(), []);
  const visible = groups.data?.filter(
    (g) =>
      g.name.toLowerCase().includes(q.toLowerCase()) ||
      g.topic.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar grupo"
          aria-label="Buscar grupo"
          className="h-11 rounded-full pl-10"
        />
      </div>

      <AsyncBoundary
        loading={groups.loading}
        error={groups.error}
        data={visible}
        reload={groups.reload}
        skeleton={<ListSkeleton />}
      >
        {(items) => (
          <div className="space-y-3">
            {items.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

export function GroupDetail() {
  const { id = "" } = useParams();
  const group = useAsync(() => groupService.get(id), [id]);
  const posts = useAsync(() => groupService.posts(id), [id]);
  const feed = useAsync(() => communityService.feed(), []);
  const [joined, setJoined] = useState(false);

  usePageMeta(group.data?.name ?? "Grupo", group.data?.description);
  useScreen({ title: group.data?.name ?? "Grupo", back: true, hideSections: true }, [
    group.data?.id,
  ]);

  if (group.loading) return <DetailSkeleton />;
  const g = group.data;
  if (!g) return null;

  const members = users.filter((u) => g.members.includes(u.id));
  const church = churches.find((c) => c.id === g.churchId);
  const groupPosts = (posts.data?.length ? posts.data : feed.data?.slice(0, 3)) ?? [];

  return (
    <div className="space-y-6">
      <HeroMedia seed={g.id} title={g.name} kind="group" gradient={g.color} className="flex min-h-44 items-end p-5">
        <div className="relative z-10">
          <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
            {g.topic}
          </Badge>
          <h1 className="font-display text-xl font-semibold text-white">{g.name}</h1>
          <p className="mt-1 text-sm text-white/80">
            {members.length} miembros · {g.meeting}
          </p>
        </div>
      </HeroMedia>

      <div className="flex gap-2.5">
        <Button
          className="flex-1"
          variant={joined ? "secondary" : "primary"}
          onClick={async () => {
            await groupService.join(g.id);
            setJoined(true);
            toast.success(`Te uniste a ${g.name}`);
          }}
        >
          {joined ? "Eres miembro" : "Unirme al grupo"}
        </Button>
        <Button asChild variant="outline">
          <Link to="/messages">
            <MessageSquare className="size-4" /> Chat
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="publicaciones">
        <TabsList>
          <TabsTrigger value="publicaciones">Publicaciones</TabsTrigger>
          <TabsTrigger value="miembros">Miembros</TabsTrigger>
          <TabsTrigger value="archivos">Archivos</TabsTrigger>
          <TabsTrigger value="info">Información</TabsTrigger>
        </TabsList>

        <TabsContent value="publicaciones">
          <div className="space-y-4">
            {groupPosts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="miembros">
          <div className="space-y-2">
            {members.map((m) => (
              <Link
                key={m.id}
                to={`/profile/${m.id}`}
                className="flex items-center gap-3 rounded-xl p-2 transition-colors active:bg-secondary"
              >
                <GenerativeCover
                  seed={m.id}
                  gradient={m.color}
                  className="size-10 shrink-0"
                  rounded="rounded-full"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.city}</span>
                </span>
                {m.id === g.members[0] && <Badge variant="primary">Administrador</Badge>}
              </Link>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="archivos">
          {/*
            Los archivos del grupo son suyos: solo los ve y los sube quien es
            miembro. Un acta de reunión o una lista de oración no tiene por qué
            estar abierta a toda la plataforma.
          */}
          <FileLibrary
            scope="group"
            scopeId={g.id}
            emptyText="El grupo todavía no ha compartido archivos."
            visibility="members"
            canUpload={joined}
            uploadLabel="Compartir un archivo"
          />
        </TabsContent>

        <TabsContent value="info">
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
              {g.description}
            </p>
            <ul className="space-y-2">
              <li className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                <Calendar className="size-4 shrink-0 text-muted-foreground" /> {g.meeting}
              </li>
              <li className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                <Users className="size-4 shrink-0 text-muted-foreground" /> Grupo {g.privacy.toLowerCase()}
              </li>
              {church && (
                <li>
                  <Link
                    to={`/churches/${church.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm transition-colors active:bg-secondary"
                  >
                    <Info className="size-4 shrink-0 text-muted-foreground" /> {church.name}
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
