import { CalendarDays, Clock, Heart, MapPin, Share2, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { EventCard, MinistryCard, Rail } from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { PlaceLink } from "@/components/media/GeoMap";
import { AsyncBoundary, DetailSkeleton, ListSkeleton, GridSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge, Chip, Progress } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { share, shareUrl } from "@/native";
import { eventService, ministryService } from "@/services";
import { useLibrary } from "@/store";
import { useScreen } from "@/store/screen";
import { churches, users } from "@/store/directory";
import { formatCompact, formatDate, pct } from "@/lib/utils";

const MODALITIES = ["Todas", "Presencial", "Online", "Híbrido"];

export function EventsList() {
  usePageMeta("Eventos", "Conferencias, conciertos, talleres y actividades.");
  useScreen({ title: "Eventos" });

  const [modality, setModality] = useState("Todas");
  const events = useAsync(
    () => eventService.list(modality === "Todas" ? undefined : modality),
    [modality],
  );

  return (
    <div className="space-y-5">
      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {MODALITIES.map((m) => (
          <Chip key={m} active={modality === m} onClick={() => setModality(m)}>
            {m}
          </Chip>
        ))}
      </div>

      <AsyncBoundary {...events} skeleton={<ListSkeleton />}>
        {(items) => (
          <div className="space-y-3">
            {items.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

export function EventDetail() {
  const { id = "" } = useParams();
  const event = useAsync(() => eventService.get(id), [id]);
  const library = useLibrary();
  const [going, setGoing] = useState(false);

  usePageMeta(event.data?.title ?? "Evento", event.data?.description);
  useScreen({ title: event.data?.title ?? "Evento", back: true, hideSections: true }, [
    event.data?.id,
  ]);

  const related = useAsync(() => eventService.upcoming(), []);

  if (event.loading) return <DetailSkeleton />;
  const e = event.data;
  if (!e) return null;

  const church = churches.find((c) => c.id === e.churchId);
  const saved = library.isSaved("event", e.id);
  const fill = pct(e.attendees, e.capacity);

  return (
    <div className="space-y-6">
      <HeroMedia seed={e.id} title={e.title} kind="event" gradient={e.color} className="flex min-h-52 items-end p-5">
        <div className="relative z-10">
          <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
            {e.type}
          </Badge>
          <h1 className="font-display text-xl font-semibold text-white">{e.title}</h1>
          <p className="mt-1 text-sm text-white/80">
            {formatDate(e.date)} · {e.time}
          </p>
        </div>
      </HeroMedia>

      <div className="flex gap-2.5">
        <Button
          className="flex-1"
          variant={going ? "secondary" : "primary"}
          onClick={async () => {
            await eventService.rsvp(e.id);
            setGoing(true);
            toast.success("Confirmaste tu asistencia");
          }}
        >
          {going ? "Asistirás" : "Confirmar asistencia"}
        </Button>
        <Button
          variant="outline"
          aria-label="Guardar"
          onClick={() => {
            library.toggle("event", e.id);
            toast.success(saved ? "Quitado de guardados" : "Guardado");
          }}
        >
          <Heart className={saved ? "size-4 fill-current text-primary" : "size-4"} />
        </Button>
        <Button
          variant="outline"
          aria-label="Compartir"
          onClick={async () => {
            const how = await share({ title: e.title, url: shareUrl(`/events/${e.id}`) });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
        >
          <Share2 className="size-4" />
        </Button>
      </div>

      <ul className="space-y-2">
        <li className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
          <CalendarDays className="size-4 shrink-0 text-primary" />
          <span>{formatDate(e.date)}</span>
        </li>
        <li className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
          <Clock className="size-4 shrink-0 text-primary" />
          <span>{e.time} h</span>
        </li>
        <li className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
          <MapPin className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate">
            {e.venue}, {e.city}
          </span>
          <Badge variant="outline" className="ml-auto shrink-0">
            {e.modality}
          </Badge>
        </li>
      </ul>

      <div className="surface-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" /> Asistentes
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatCompact(e.attendees)} / {formatCompact(e.capacity)}
          </span>
        </div>
        <Progress value={fill} label={`${fill} % de aforo`} />
      </div>

      {e.modality !== "Online" && (
        <PlaceLink
          title={e.venue}
          subtitle={e.city}
          target={{ label: e.venue, address: e.city }}
        />
      )}

      <section>
        <h2 className="mb-2 text-section font-semibold">Sobre el evento</h2>
        <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
          {e.description}
        </p>
      </section>

      {church && (
        <Link
          to={`/churches/${church.id}`}
          className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
        >
          <GenerativeCover
            seed={church.id}
            gradient={church.color}
            className="size-11 shrink-0"
            rounded="rounded-lg"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{church.name}</span>
            <span className="block text-xs text-muted-foreground">Organiza</span>
          </span>
        </Link>
      )}

      <Rail title="Otros eventos" href="/events">
        {related.data
          ?.filter((r) => r.id !== e.id)
          .slice(0, 6)
          .map((r) => (
            <Link key={r.id} to={`/events/${r.id}`} className="min-w-0">
              <GenerativeCover
                seed={r.id}
                gradient={r.color}
                className="aspect-square w-full"
                icon={CalendarDays}
                label={r.title}
              />
              <p className="mt-2 truncate text-sm font-medium">{r.title}</p>
              <p className="truncate text-xs text-muted-foreground">{r.city}</p>
            </Link>
          ))}
      </Rail>
    </div>
  );
}

/* ------------------------------------------------------------ ministries */

export function MinistriesList() {
  usePageMeta("Ministerios", "Encuentra dónde servir según tus dones.");
  useScreen({ title: "Ministerios" });

  const [category, setCategory] = useState("Todos");
  const ministries = useAsync(() => ministryService.list(), []);
  const categories = ["Todos", ...new Set((ministries.data ?? []).map((m) => m.category))];
  const visible =
    category === "Todos" ? ministries.data : ministries.data?.filter((m) => m.category === category);

  return (
    <div className="space-y-5">
      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {categories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={ministries.loading}
        error={ministries.error}
        data={visible}
        reload={ministries.reload}
        skeleton={<GridSkeleton aspect="aspect-3/1" />}
      >
        {(items) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((m) => (
              <MinistryCard key={m.id} ministry={m} />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

export function MinistryDetail() {
  const { id = "" } = useParams();
  const ministry = useAsync(() => ministryService.get(id), [id]);
  const [joined, setJoined] = useState(false);

  usePageMeta(ministry.data?.name ?? "Ministerio", ministry.data?.description);
  useScreen({ title: ministry.data?.name ?? "Ministerio", back: true, hideSections: true }, [
    ministry.data?.id,
  ]);

  const events = useAsync(() => eventService.upcoming(), []);

  if (ministry.loading) return <DetailSkeleton />;
  const m = ministry.data;
  if (!m) return null;

  const leader = users.find((u) => u.id === m.leaderId);
  const church = churches.find((c) => c.id === m.churchId);

  return (
    <div className="space-y-6">
      <HeroMedia seed={m.id} title={m.name} kind="ministry" gradient={m.color} className="flex min-h-44 items-end p-5">
        <div className="relative z-10">
          <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
            {m.category}
          </Badge>
          <h1 className="font-display text-xl font-semibold text-white">{m.name}</h1>
          <p className="mt-1 text-sm text-white/80">{m.members} personas sirviendo</p>
        </div>
      </HeroMedia>

      <Button
        full
        variant={joined ? "secondary" : "primary"}
        onClick={() => {
          setJoined(true);
          toast.success("Enviamos tu solicitud al líder del ministerio");
        }}
      >
        {joined ? "Solicitud enviada" : "Quiero servir aquí"}
      </Button>

      <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
        {m.description}
      </p>

      <div className="space-y-2.5">
        {leader && (
          <Link
            to={`/profile/${leader.id}`}
            className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
          >
            <GenerativeCover
              seed={leader.id}
              gradient={leader.color}
              className="size-11 shrink-0"
              rounded="rounded-full"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{leader.name}</span>
              <span className="block text-xs text-muted-foreground">Líder del ministerio</span>
            </span>
          </Link>
        )}
        {church && (
          <Link
            to={`/churches/${church.id}`}
            className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
          >
            <GenerativeCover
              seed={church.id}
              gradient={church.color}
              className="size-11 shrink-0"
              rounded="rounded-lg"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{church.name}</span>
              <span className="block text-xs text-muted-foreground">
                {church.city}, {church.country}
              </span>
            </span>
          </Link>
        )}
      </div>

      <Rail title="Próximas actividades" href="/events">
        {events.data?.slice(0, 5).map((e) => (
          <Link key={e.id} to={`/events/${e.id}`} className="min-w-0">
            <GenerativeCover
              seed={e.id}
              gradient={e.color}
              className="aspect-square w-full"
              icon={CalendarDays}
              label={e.title}
            />
            <p className="mt-2 truncate text-sm font-medium">{e.title}</p>
            <p className="truncate text-xs text-muted-foreground">{formatDate(e.date)}</p>
          </Link>
        ))}
      </Rail>
    </div>
  );
}
