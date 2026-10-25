import {
  BarChart3, CalendarDays, Disc3, FileText, Music, Plus, Radio, Upload, Video, Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AdminList, AdminSections, BarsChart, BreakdownChart, KpiRow, QuickActions, RecentActivity,
  TrendChart, type AdminRow,
} from "@/components/admin/AdminKit";
import { Button } from "@/components/ui/button";
import { ContentManager } from "@/components/admin/ContentManager";
import { CatalogFormSheet, EVENT_FIELDS } from "@/components/admin/CatalogForm";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  analyticsService, communityService, courseService, eventService, musicService, videoService,
} from "@/services";
import { useScreen } from "@/store/screen";
import { artists } from "@/store/directory";
import { formatCompact, formatDate, formatLength } from "@/lib/utils";

const artistName = (id: string) => artists.find((a) => a.id === id)?.name;

/* -------------------------------------------------------------- artist */

const ARTIST_SECTIONS = [
  { label: "Música", href: "/artist/music", icon: Music, description: "Catálogo publicado" },
  { label: "Álbumes", href: "/artist/albums", icon: Disc3, description: "Lanzamientos y EP" },
  { label: "Canciones", href: "/artist/songs", icon: Radio, description: "Pistas individuales" },
  { label: "Videos", href: "/artist/videos", icon: Video, description: "Clips y sesiones" },
  { label: "Eventos", href: "/artist/events", icon: CalendarDays, description: "Conciertos y giras" },
  { label: "Estadísticas", href: "/artist/analytics", icon: BarChart3, description: "Oyentes y reproducciones" },
];

export function ArtistDashboard() {
  usePageMeta("Portal de artista", "Publica y gestiona tu música.");
  useScreen({ title: "Portal de artista", back: true, hideSections: true });

  const kpis = useAsync(() => analyticsService.kpis("artist"), []);
  const activity = useAsync(() => analyticsService.activity("artist"), []);
  const series = useAsync(() => analyticsService.series("artist"), []);

  return (
    <div className="space-y-6">
      <KpiRow kpis={kpis.data} />
      <QuickActions
        actions={[
          { label: "Subir canción", icon: Upload, onClick: () => toast.success("Subida iniciada") },
          { label: "Nuevo álbum", icon: Disc3, href: "/artist/albums" },
          { label: "Subir video", icon: Video, href: "/artist/videos" },
          { label: "Crear evento", icon: CalendarDays, href: "/artist/events" },
        ]}
      />
      <TrendChart title="Reproducciones por mes" data={series.data} />
      <RecentActivity items={activity.data} />
      <AdminSections links={ARTIST_SECTIONS} />
    </div>
  );
}

export function ArtistMusic() {
  usePageMeta("Mi música", "Todo tu catálogo en Heseria.");
  useScreen({ title: "Mi música", back: true, hideSections: true });

  const songs = useAsync(() => musicService.songs(), []);
  const albums = useAsync(() => musicService.albums(), []);

  const rows: AdminRow[] = [
    ...(albums.data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      subtitle: `Álbum · ${a.year} · ${a.trackIds.length} pistas`,
      color: a.color,
      href: `/music/albums/${a.id}`,
      status: { label: "Álbum", tone: "primary" as const },
    })),
    ...(songs.data ?? []).slice(0, 12).map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: `Canción · ${artistName(s.artistId)}`,
      meta: formatCompact(s.plays),
      color: s.color,
      status: { label: "Publicada", tone: "success" as const },
    })),
  ];

  return (
    <div className="space-y-4">
      <ContentManager kind="song" ctaLabel="Subir música" />
      <AdminList
        rows={rows}
        filters={[
          { key: "albumes", label: "Álbumes", test: (r) => r.status?.label === "Álbum" },
          { key: "canciones", label: "Canciones", test: (r) => r.status?.label === "Publicada" },
        ]}
        sorts={[{ key: "az", label: "Título (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]}
      />
    </div>
  );
}

export function ArtistAlbums() {
  usePageMeta("Álbumes", "Tus lanzamientos.");
  useScreen({ title: "Álbumes", back: true, hideSections: true });
  const albums = useAsync(() => musicService.albums(), []);

  const rows: AdminRow[] =
    albums.data?.map((a) => ({
      id: a.id,
      title: a.title,
      subtitle: `${artistName(a.artistId)} · ${a.year}`,
      meta: `${a.trackIds.length} pistas`,
      color: a.color,
      href: `/music/albums/${a.id}`,
    })) ?? [];

  return (
    <div className="space-y-4">
      <ContentManager kind="album" ctaLabel="Nuevo álbum" />
      <AdminList rows={rows} sorts={[{ key: "az", label: "Título (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]} />
    </div>
  );
}

export function ArtistSongs() {
  usePageMeta("Canciones", "Tus pistas publicadas.");
  useScreen({ title: "Canciones", back: true, hideSections: true });
  const songs = useAsync(() => musicService.popular(), []);

  const rows: AdminRow[] =
    songs.data?.slice(0, 20).map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: `${s.genre} · ${formatLength(s.durationSec)}`,
      meta: formatCompact(s.plays),
      color: s.color,
      status: { label: "Publicada", tone: "success" as const },
    })) ?? [];

  return (
    <div className="space-y-4">
      <ContentManager kind="song" lockKind ctaLabel="Subir canción" />
      <AdminList
        rows={rows}
        selectable
        sorts={[
          { key: "plays", label: "Más reproducidas", compare: (a, b) => Number(b.meta?.replace(/\D/g, "")) - Number(a.meta?.replace(/\D/g, "")) },
          { key: "az", label: "Título (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) },
        ]}
      />
    </div>
  );
}

export function ArtistVideos() {
  usePageMeta("Videos del artista", "Clips y sesiones publicadas.");
  useScreen({ title: "Videos", back: true, hideSections: true });
  const videos = useAsync(() => videoService.list("Música"), []);

  const rows: AdminRow[] =
    videos.data?.map((v) => ({
      id: v.id,
      title: v.title,
      subtitle: formatLength(v.durationSec),
      meta: formatCompact(v.views),
      color: v.color,
      href: `/videos/${v.id}`,
    })) ?? [];

  return (
    <div className="space-y-4">
      <ContentManager kind="video" lockKind ctaLabel="Subir video" />
      <AdminList rows={rows} />
    </div>
  );
}

export function ArtistEvents() {
  usePageMeta("Eventos del artista", "Conciertos y presentaciones.");
  useScreen({ title: "Eventos", back: true, hideSections: true });
  const events = useAsync(() => eventService.list(), []);

  const [creating, setCreating] = useState(false);

  const rows: AdminRow[] =
    events.data?.slice(0, 10).map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: `${formatDate(e.date)} · ${e.city}`,
      meta: formatCompact(e.attendees),
      color: e.color,
      href: `/events/${e.id}`,
      status: { label: e.modality, tone: "primary" as const },
    })) ?? [];

  return (
    <div className="space-y-4">
      <Button full onClick={() => setCreating(true)}>
        <Plus className="size-4" /> Crear evento
      </Button>

      <CatalogFormSheet
        open={creating}
        onOpenChange={setCreating}
        kind="event"
        title="Crear evento"
        description="Aparece en la agenda de toda la comunidad."
        fields={EVENT_FIELDS}
        fixed={{ attendees: 0 }}
        onCreated={() => events.reload()}
      />

      <AdminList rows={rows} />
    </div>
  );
}

export function ArtistAnalytics() {
  usePageMeta("Estadísticas de artista", "Oyentes, reproducciones y seguidores.");
  useScreen({ title: "Estadísticas", back: true, hideSections: true });

  const kpis = useAsync(() => analyticsService.kpis("artist"), []);
  const activity = useAsync(() => analyticsService.activity("artist"), []);
  const series = useAsync(() => analyticsService.series("artist"), []);
  const breakdown = useAsync(() => analyticsService.breakdown("artist"), []);

  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis.data} />
      <TrendChart title="Reproducciones" subtitle="Últimos 9 meses" data={series.data} />
      <BreakdownChart title="Origen de las escuchas" data={breakdown.data} />
    </div>
  );
}

/* ------------------------------------------------------------- creator */

const CREATOR_SECTIONS = [
  { label: "Contenido", href: "/creator/content", icon: FileText, description: "Todo lo publicado" },
  { label: "Publicaciones", href: "/creator/posts", icon: Users, description: "Feed de la comunidad" },
  { label: "Videos", href: "/creator/videos", icon: Video, description: "Clips y enseñanza" },
  { label: "Cursos", href: "/creator/courses", icon: FileText, description: "Formación publicada" },
  { label: "Estadísticas", href: "/creator/analytics", icon: BarChart3, description: "Audiencia y alcance" },
];

export function CreatorDashboard() {
  usePageMeta("Portal de creador", "Publica contenido y mide tu alcance.");
  useScreen({ title: "Portal de creador", back: true, hideSections: true });

  const kpis = useAsync(() => analyticsService.kpis("creator"), []);
  const activity = useAsync(() => analyticsService.activity("creator"), []);
  const series = useAsync(() => analyticsService.series("creator"), []);

  return (
    <div className="space-y-6">
      <KpiRow kpis={kpis.data} />
      <QuickActions
        actions={[
          { label: "Subir video", icon: Upload, href: "/creator/videos" },
          { label: "Publicar", icon: Plus, href: "/community" },
          { label: "Crear curso", icon: FileText, href: "/creator/courses" },
          { label: "Estadísticas", icon: BarChart3, href: "/creator/analytics" },
        ]}
      />
      <TrendChart title="Vistas por mes" data={series.data} />
      <RecentActivity items={activity.data} />
      <AdminSections links={CREATOR_SECTIONS} />
    </div>
  );
}

export function CreatorContent() {
  usePageMeta("Mi contenido", "Videos, publicaciones y cursos.");
  useScreen({ title: "Mi contenido", back: true, hideSections: true });

  const videos = useAsync(() => videoService.list(), []);
  const posts = useAsync(() => communityService.feed(), []);

  const rows: AdminRow[] = [
    ...(videos.data ?? []).slice(0, 10).map((v) => ({
      id: v.id,
      title: v.title,
      subtitle: `Video · ${v.category}`,
      meta: formatCompact(v.views),
      color: v.color,
      href: `/videos/${v.id}`,
      status: { label: "Video", tone: "primary" as const },
    })),
    ...(posts.data ?? []).slice(0, 8).map((p) => ({
      id: p.id,
      title: p.body.slice(0, 48) + (p.body.length > 48 ? "…" : ""),
      subtitle: `Publicación · ${p.type}`,
      meta: formatCompact(p.likes),
      color: p.color,
      status: { label: "Publicación", tone: "default" as const },
    })),
  ];

  return (
    <div className="space-y-4">
      <ContentManager ctaLabel="Subir contenido" />
      <AdminList
        rows={rows}
        filters={[
          { key: "videos", label: "Videos", test: (r) => r.status?.label === "Video" },
          { key: "posts", label: "Publicaciones", test: (r) => r.status?.label === "Publicación" },
        ]}
      />
    </div>
  );
}

export function CreatorPosts() {
  usePageMeta("Publicaciones", "Tus publicaciones en la comunidad.");
  useScreen({ title: "Publicaciones", back: true, hideSections: true });
  const posts = useAsync(() => communityService.feed(), []);

  const rows: AdminRow[] =
    posts.data?.map((p) => ({
      id: p.id,
      title: p.body.slice(0, 52) + (p.body.length > 52 ? "…" : ""),
      subtitle: `${p.type} · ${p.comments.length} comentarios`,
      meta: formatCompact(p.likes),
      color: p.color,
      status: { label: "Publicada", tone: "success" as const },
    })) ?? [];

  return (
    <div className="space-y-4">
      <Button full onClick={() => toast.success("Abriendo el editor")}>
        <Plus className="size-4" /> Nueva publicación
      </Button>
      <AdminList rows={rows} selectable onRowAction={() => toast.info("Abriendo publicación")} />
    </div>
  );
}

export function CreatorVideos() {
  usePageMeta("Mis videos", "Videos publicados.");
  useScreen({ title: "Mis videos", back: true, hideSections: true });
  const videos = useAsync(() => videoService.list(), []);

  const rows: AdminRow[] =
    videos.data?.map((v) => ({
      id: v.id,
      title: v.title,
      subtitle: `${v.category} · ${formatLength(v.durationSec)}`,
      meta: formatCompact(v.views),
      color: v.color,
      href: `/videos/${v.id}`,
    })) ?? [];

  return (
    <div className="space-y-4">
      <ContentManager kind="video" lockKind ctaLabel="Subir video" />
      <AdminList
        rows={rows}
        sorts={[
          { key: "views", label: "Más vistos", compare: (a, b) => Number(b.meta?.replace(/\D/g, "")) - Number(a.meta?.replace(/\D/g, "")) },
          { key: "az", label: "Título (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) },
        ]}
      />
    </div>
  );
}

export function CreatorCourses() {
  usePageMeta("Mis cursos", "Formación que publicaste.");
  useScreen({ title: "Mis cursos", back: true, hideSections: true });
  const courses = useAsync(() => courseService.list(), []);

  const rows: AdminRow[] =
    courses.data?.slice(0, 10).map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: `${c.category} · ${c.level}`,
      meta: formatCompact(c.students),
      color: c.color,
      href: `/courses/${c.id}`,
    })) ?? [];

  return (
    <div className="space-y-4">
      <Button full onClick={() => toast.success("Curso creado")}>
        <Plus className="size-4" /> Crear curso
      </Button>
      <AdminList rows={rows} />
    </div>
  );
}

export function CreatorAnalytics() {
  usePageMeta("Estadísticas de creador", "Alcance y audiencia.");
  useScreen({ title: "Estadísticas", back: true, hideSections: true });

  const kpis = useAsync(() => analyticsService.kpis("creator"), []);
  const activity = useAsync(() => analyticsService.activity("creator"), []);
  const series = useAsync(() => analyticsService.series("creator"), []);
  const breakdown = useAsync(() => analyticsService.breakdown("creator"), []);

  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis.data} />
      <TrendChart title="Vistas" subtitle="Últimos 9 meses" data={series.data} />
      <BarsChart title="Rendimiento por formato" data={breakdown.data} />
    </div>
  );
}
