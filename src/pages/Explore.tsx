import { ArrowRight, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { CourseCard, FoundationCaseCard, MediaCard, Rail, SermonCard } from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { RailSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { EXPLORE_CATEGORIES } from "@/lib/nav";
import { users } from "@/store/directory";
import {
  courseService, foundationService, musicService, podcastService, sermonService,
} from "@/services";
import { useScreen } from "@/store/screen";

export default function Explore() {
  usePageMeta("Explorar", "Descubre música, sermones, cursos, iglesias y más en Heseria.");
  useScreen({ title: "Explorar" });

  const playlists = useAsync(() => musicService.playlists(), []);
  const sermons = useAsync(() => sermonService.list(), []);
  const courses = useAsync(() => courseService.list(), []);
  const podcasts = useAsync(() => podcastService.list(), []);
  const cases = useAsync(() => foundationService.featured(), []);

  return (
    <div className="space-y-8">
      <Link
        to="/search"
        className="flex items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-3 text-sm text-muted-foreground"
      >
        <Search className="size-4 shrink-0" />
        Busca sermones, podcasts, cursos, iglesias…
      </Link>

      <Rail title="Sermones recientes" size="wide" href="/sermons">
        {sermons.loading ? (
          <RailSkeleton />
        ) : (
          sermons.data?.slice(0, 8).map((s) => <SermonCard key={s.id} sermon={s} />)
        )}
      </Rail>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="text-section font-semibold tracking-tight">Cursos populares</h2>
          <Link to="/academy" className="shrink-0 text-xs font-medium text-muted-foreground">
            Ver todo
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.data?.slice(0, 4).map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              instructorName={users.find((u) => u.id === c.instructorId)?.name}
            />
          ))}
        </div>
      </section>

      <Rail title="Podcasts para escuchar" href="/podcasts">
        {podcasts.data?.map((p) => (
          <MediaCard
            key={p.id}
            to={`/podcasts/${p.id}`}
            seed={p.id}
            gradient={p.color}
            title={p.title}
            subtitle={p.host}
          />
        ))}
      </Rail>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="text-section font-semibold tracking-tight">Ayuda que urge</h2>
          <Link to="/foundation" className="shrink-0 text-xs font-medium text-muted-foreground">
            Ver todo
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {cases.data?.slice(0, 2).map((c) => (
            <FoundationCaseCard key={c.id} item={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
