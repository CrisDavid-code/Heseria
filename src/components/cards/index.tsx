import {
  BookOpen, CalendarDays, Church as ChurchIcon, Clock, GraduationCap, HandHeart, Headphones,
  MapPin, Mic2, Play, Users, Video as VideoIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { GenerativeCover, MediaCover, UserAvatar } from "@/components/media/covers";
import { kindFromHref } from "@/components/media/motifs";
import { Badge, Progress } from "@/components/ui/primitives";
import { cn, formatCompact, formatDateShort, formatLength, formatMoney, pct } from "@/lib/utils";
import type {
  Church, ContinueItem, Course, Devotional, Event, FoundationCase, Group, Ministry, Movie,
  Playlist, Podcast, Sermon, Series, Song, User, Video, VolunteerOpportunity,
} from "@/types";

/* ------------------------------------------------------------------ rail */

export function Rail({
  title,
  subtitle,
  href,
  children,
  className,
  size = "normal",
}: {
  title: string;
  subtitle?: string;
  href?: string;
  children: ReactNode;
  className?: string;
  /** Ancho de cada tarjeta: caras, portadas cuadradas o apaisadas. */
  size?: "tight" | "normal" | "wide";
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-section font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {href && (
          <Link
            to={href}
            className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Ver todo
          </Link>
        )}
      </div>
      <div
        className={cn(
          "rail",
          size === "wide" && "rail-wide",
          size === "tight" && "rail-tight",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ media card */

export function MediaCard({
  to,
  seed,
  gradient,
  title,
  subtitle,
  aspect = "aspect-square",
  rounded,
  icon,
  badge,
  onPlay,
  kind,
}: {
  to: string;
  seed: string;
  gradient?: string;
  title: string;
  subtitle?: string;
  aspect?: string;
  rounded?: string;
  icon?: typeof Play;
  badge?: string;
  onPlay?: () => void;
  /** Tipo de contenido, para elegir la ilustración de la portada. */
  kind?: string;
}) {
  return (
    <Link to={to} className="group min-w-0 outline-none">
      <div className="relative">
        <GenerativeCover
          seed={seed}
          gradient={gradient}
          icon={icon}
          rounded={rounded}
          title={title}
          kind={kind ?? kindFromHref(to)}
          className={cn(aspect, "w-full transition-transform duration-200 group-hover:-translate-y-0.5")}
          label={title}
        />
        {badge && (
          <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[0.65rem] font-medium text-white backdrop-blur">
            {badge}
          </span>
        )}
        {onPlay && (
          <button
            type="button"
            aria-label={`Reproducir ${title}`}
            onClick={(e) => {
              e.preventDefault();
              onPlay();
            }}
            className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100 hover:scale-105"
          >
            <Play className="size-4 fill-current" />
          </button>
        )}
      </div>
      <p className="mt-2 truncate text-sm font-medium transition-colors group-hover:text-primary">
        {title}
      </p>
      {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
    </Link>
  );
}

export function HorizontalMediaCard({
  to,
  seed,
  gradient,
  title,
  subtitle,
  meta,
  icon,
}: {
  to: string;
  seed: string;
  gradient?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: typeof Play;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-border hover:bg-surface"
    >
      <GenerativeCover
        seed={seed}
        gradient={gradient}
        icon={icon}
        className="size-12 shrink-0"
        rounded="rounded-lg"
        title={title}
        kind={kindFromHref(to)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {meta && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{meta}</span>}
    </Link>
  );
}

/* ------------------------------------------------------------- hero card */

export function HeroCard({
  to,
  seed,
  gradient,
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  to?: string;
  seed: string;
  gradient?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const body = (
    <GenerativeCover
      seed={seed}
      gradient={gradient}
      rounded="rounded-2xl"
      className={cn("flex min-h-44 items-end p-5 sm:min-h-52 sm:p-6", className)}
    >
      <div className="relative z-10 max-w-lg">
        {eyebrow && (
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white/80">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-white/80 clamp-2">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </GenerativeCover>
  );
  return to ? (
    <Link to={to} className="block outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

/* -------------------------------------------------------- continue cards */

export function ContinueCard({ item }: { item: ContinueItem }) {
  return (
    <Link to={item.href} className="group min-w-0 outline-none">
      <GenerativeCover
        seed={item.id}
        gradient={item.color}
        rounded="rounded-xl"
        className="aspect-video w-full transition-transform duration-200 group-hover:-translate-y-0.5"
        label={item.title}
        title={item.title}
        kind={kindFromHref(item.href)}
      >
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition-transform group-hover:scale-105">
            <Play className="size-4 fill-current" />
          </span>
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
          <span className="block h-full bg-primary" style={{ width: `${item.progress}%` }} />
        </span>
      </GenerativeCover>
      <p className="mt-2 truncate text-sm font-medium transition-colors group-hover:text-primary">
        {item.title}
      </p>
      <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
    </Link>
  );
}

/* ------------------------------------------------------------ domain cards */

export function SongRow({
  song,
  artistName,
  index,
  onPlay,
  active,
}: {
  song: Song;
  artistName?: string;
  index?: number;
  onPlay?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface",
        active && "bg-surface",
      )}
    >
      {index !== undefined && (
        <span
          className={cn(
            "w-5 shrink-0 text-right text-xs tabular-nums",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {index + 1}
        </span>
      )}
      <GenerativeCover
        seed={song.id}
        gradient={song.color}
        className="size-10 shrink-0"
        rounded="rounded-md"
        title={song.title}
        kind="song"
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", active && "text-primary")}>
          {song.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {artistName ?? song.genre}
        </span>
      </span>
      <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
        {formatCompact(song.plays)}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatLength(song.durationSec)}
      </span>
    </button>
  );
}

export function PlaylistCard({ playlist }: { playlist: Playlist }) {
  return (
    <MediaCard
      to={`/music/playlists/${playlist.id}`}
      kind="playlist"
      seed={playlist.id}
      gradient={playlist.color}
      title={playlist.title}
      subtitle={`${playlist.trackIds.length} canciones`}
      icon={Play}
    />
  );
}

export function PodcastCard({ podcast }: { podcast: Podcast }) {
  return (
    <MediaCard
      to={`/podcasts/${podcast.id}`}
      kind="podcast"
      seed={podcast.id}
      gradient={podcast.color}
      title={podcast.title}
      subtitle={`${podcast.host} · ${podcast.episodes.length} episodios`}
      icon={Headphones}
    />
  );
}

export function SermonCard({ sermon }: { sermon: Sermon }) {
  return (
    <MediaCard
      to={`/sermons/${sermon.id}`}
      kind="sermon"
      seed={sermon.id}
      gradient={sermon.color}
      title={sermon.title}
      subtitle={sermon.passage}
      aspect="aspect-video"
      icon={Mic2}
      badge={formatLength(sermon.durationSec)}
    />
  );
}

export function VideoCard({ video, authorName }: { video: Video; authorName?: string }) {
  return (
    <MediaCard
      to={`/videos/${video.id}`}
      kind="video"
      seed={video.id}
      gradient={video.color}
      title={video.title}
      subtitle={`${authorName ?? video.category} · ${formatCompact(video.views)} vistas`}
      aspect="aspect-video"
      icon={VideoIcon}
      badge={formatLength(video.durationSec)}
    />
  );
}

export function MovieCard({ movie }: { movie: Movie }) {
  return (
    <MediaCard
      to={`/movies/${movie.id}`}
      kind="movie"
      seed={movie.id}
      gradient={movie.color}
      title={movie.title}
      subtitle={`${movie.genre} · ${movie.year}`}
      aspect="aspect-2/3"
      badge={movie.rating}
    />
  );
}

export function SeriesCard({ series }: { series: Series }) {
  const episodes = series.seasons.reduce((n, s) => n + s.episodes.length, 0);
  return (
    <MediaCard
      to={`/series/${series.id}`}
      kind="series"
      seed={series.id}
      gradient={series.color}
      title={series.title}
      subtitle={`${series.seasons.length} temporadas · ${episodes} episodios`}
      aspect="aspect-2/3"
      badge={series.rating}
    />
  );
}

export function CourseCard({ course, instructorName }: { course: Course; instructorName?: string }) {
  return (
    <Link
      to={`/courses/${course.id}`}
      className="group surface-card flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
    >
      <GenerativeCover
        seed={course.id}
        gradient={course.color}
        rounded="rounded-none"
        className="aspect-video w-full"
        icon={GraduationCap}
        label={course.title}
        title={course.title}
        kind="course"
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="primary">{course.category}</Badge>
          <Badge variant="outline">{course.level}</Badge>
          <Badge variant="outline">{course.modality}</Badge>
        </div>
        <h3 className="font-display text-sm font-semibold leading-snug clamp-2 transition-colors group-hover:text-primary">
          {course.title}
        </h3>
        {instructorName && (
          <p className="mt-1 truncate text-xs text-muted-foreground">{instructorName}</p>
        )}
        <div className="mt-auto pt-3">
          {course.progress > 0 ? (
            <>
              <Progress value={course.progress} label={`Progreso: ${course.progress} %`} />
              <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                {course.progress} % completado
              </p>
            </>
          ) : (
            <p className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" /> {course.durationHours} h
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" /> {formatCompact(course.students)}
              </span>
              <span>★ {course.rating}</span>
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ChurchCard({ church }: { church: Church }) {
  return (
    <Link
      to={`/churches/${church.id}`}
      className="group surface-card flex gap-4 overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
    >
      <GenerativeCover
        seed={church.id}
        gradient={church.color}
        className="size-16 shrink-0"
        rounded="rounded-xl"
        icon={ChurchIcon}
        label={church.name}
        title={church.name}
        kind="church"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-sm font-semibold transition-colors group-hover:text-primary">
          {church.name}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" /> {church.city}, {church.country}
          {/* La distancia solo aparece si hay una ubicación de verdad. */}
          {typeof church.distanceKm === "number" && church.distanceKm > 0 && (
            <> · a {church.distanceKm} km</>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{church.denomination}</Badge>
          <Badge variant="outline">{church.language}</Badge>
          <Badge>{formatCompact(church.members)} miembros</Badge>
        </div>
      </div>
    </Link>
  );
}

export function EventCard({ event }: { event: Event }) {
  return (
    <Link
      to={`/events/${event.id}`}
      className="group surface-card flex gap-4 overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
    >
      <div className="grid size-16 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-center">
        <span>
          <span className="block font-display text-lg font-semibold leading-none tabular-nums">
            {event.date.slice(-2)}
          </span>
          <span className="mt-0.5 block text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            {formatDateShort(event.date).split(" ")[1]}
          </span>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-sm font-semibold transition-colors group-hover:text-primary">
          {event.title}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" /> {event.time} · {event.venue}, {event.city}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="primary">{event.modality}</Badge>
          <Badge variant="outline">{event.type}</Badge>
          <Badge variant="outline">{formatCompact(event.attendees)} asistentes</Badge>
        </div>
      </div>
    </Link>
  );
}

export function PersonCard({ user, action }: { user: User; action?: ReactNode }) {
  return (
    <div className="surface-card flex flex-col items-center p-4 text-center">
      <UserAvatar user={user} className="size-16" />
      <Link to={`/profile/${user.id}`} className="mt-3 truncate text-sm font-medium hover:text-primary">
        {user.name}
      </Link>
      <p className="truncate text-xs text-muted-foreground">{user.city}</p>
      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        {formatCompact(user.followers)} seguidores
      </p>
      {action && <div className="mt-3 w-full">{action}</div>}
    </div>
  );
}

export function MinistryCard({ ministry }: { ministry: Ministry }) {
  return (
    <Link
      to={`/ministries/${ministry.id}`}
      className="group surface-card overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
    >
      <GenerativeCover
        seed={ministry.id}
        gradient={ministry.color}
        rounded="rounded-none"
        className="aspect-3/1 w-full"
        label={ministry.name}
        title={ministry.name}
        kind="ministry"
      />
      <div className="p-4">
        <h3 className="truncate font-display text-sm font-semibold transition-colors group-hover:text-primary">
          {ministry.name}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground clamp-2">{ministry.description}</p>
        <div className="mt-2.5 flex items-center gap-1.5">
          <Badge variant="primary">{ministry.category}</Badge>
          <Badge variant="outline">{ministry.members} personas</Badge>
        </div>
      </div>
    </Link>
  );
}

export function GroupCard({ group }: { group: Group }) {
  return (
    <Link
      to={`/groups/${group.id}`}
      className="group surface-card flex gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
    >
      <GenerativeCover
        seed={group.id}
        gradient={group.color}
        className="size-14 shrink-0"
        rounded="rounded-xl"
        icon={Users}
        label={group.name}
        title={group.name}
        kind="group"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-sm font-semibold transition-colors group-hover:text-primary">
          {group.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {group.topic} · {group.meeting}
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <Badge variant={group.privacy === "Abierto" ? "success" : "outline"}>{group.privacy}</Badge>
          <Badge variant="outline">{group.members.length} miembros</Badge>
        </div>
      </div>
    </Link>
  );
}

export function DevotionalCard({ devotional, authorName }: { devotional: Devotional; authorName?: string }) {
  return (
    <Link
      to={`/devotionals/${devotional.id}`}
      className="group surface-card overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
    >
      <GenerativeCover
        seed={devotional.id}
        gradient={devotional.color}
        rounded="rounded-none"
        className="aspect-video w-full"
        icon={BookOpen}
        label={devotional.title}
        title={devotional.title}
        kind="devotional"
      />
      <div className="p-4">
        <p className="text-xs font-medium text-primary">{devotional.verse.ref}</p>
        <h3 className="mt-1 font-display text-sm font-semibold leading-snug clamp-2 transition-colors group-hover:text-primary">
          {devotional.title}
        </h3>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {authorName ?? "Equipo Heseria"} · {devotional.minutes} min de lectura
        </p>
        {devotional.completed && (
          <Badge variant="success" className="mt-2">
            Completado
          </Badge>
        )}
      </div>
    </Link>
  );
}

export function FoundationCaseCard({ item }: { item: FoundationCase }) {
  const progress = pct(item.raised, item.goal);
  return (
    <Link
      to={`/foundation/cases/${item.id}`}
      className="group surface-card overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
    >
      <div className="relative">
        <GenerativeCover
          seed={item.id}
          gradient={item.color}
          rounded="rounded-none"
          className="aspect-video w-full"
          icon={HandHeart}
          label={item.title}
          title={item.title}
          kind="foundationCase"
        />
        {item.urgent && (
          <span className="absolute left-3 top-3 rounded-md bg-destructive px-2 py-0.5 text-[0.65rem] font-semibold text-destructive-foreground">
            Urgente
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display text-sm font-semibold leading-snug clamp-2 transition-colors group-hover:text-primary">
          {item.title}
        </h3>
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" /> {item.location}
        </p>
        <div className="mt-3">
          <Progress value={progress} label={`${progress} % recaudado`} />
          <div className="mt-1.5 flex items-center justify-between text-xs tabular-nums">
            <span className="font-medium">{formatMoney(item.raised)}</span>
            <span className="text-muted-foreground">de {formatMoney(item.goal)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function VolunteerCard({
  opportunity,
  onApply,
}: {
  opportunity: VolunteerOpportunity;
  onApply?: () => void;
}) {
  const left = opportunity.slots - opportunity.taken;
  return (
    <div className="surface-card flex flex-col p-4">
      <div className="flex items-start gap-3">
        <GenerativeCover
          seed={opportunity.id}
          gradient={opportunity.color}
          className="size-12 shrink-0"
          rounded="rounded-lg"
          icon={HandHeart}
          title={opportunity.title}
          kind="volunteer"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-semibold leading-snug clamp-2">{opportunity.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" /> {opportunity.location}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground clamp-2">{opportunity.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="primary">{opportunity.modality}</Badge>
        <Badge variant="outline">
          <CalendarDays className="size-3" /> {formatDateShort(opportunity.date)}
        </Badge>
        <Badge variant={left > 3 ? "success" : "warning"}>{left} cupos</Badge>
      </div>
      {onApply && (
        <button
          type="button"
          onClick={onApply}
          className="mt-4 h-9 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-all hover:brightness-110 active:scale-[0.985]"
        >
          Inscribirme
        </button>
      )}
    </div>
  );
}

export { MediaCover };
