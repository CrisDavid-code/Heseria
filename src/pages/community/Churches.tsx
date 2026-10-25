import {
  Calendar, Church as ChurchIcon, Clock, Globe, Mail, MapPin, Navigation, Phone, Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChurchCard, EventCard, MinistryCard, Rail, SermonCard } from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { GeoMap } from "@/components/media/GeoMap";
import { directionsUrl } from "@/lib/maps";
import { openExternal } from "@/native";
import { AsyncBoundary, DetailSkeleton, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { SimpleSelect, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Chip, Input } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { churchService, eventService, ministryService, sermonService } from "@/services";
import { useScreen } from "@/store/screen";
import { churches as allChurches, users } from "@/store/directory";
import { cn, formatCompact } from "@/lib/utils";
import { getCurrentPosition, type PositionResult } from "@/native";

const CITIES = [...new Set(allChurches.map((c) => c.city))];
const DENOMINATIONS = [...new Set(allChurches.map((c) => c.denomination))];

/* ------------------------------------------------------------------ list */

export function ChurchesList() {
  usePageMeta("Iglesias", "Encuentra una iglesia cerca de ti.");
  useScreen({ title: "Iglesias" });
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [denomination, setDenomination] = useState("");
  const [language, setLanguage] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const churches = useAsync(
    () => churchService.list({ q, city, denomination, language }),
    [q, city, denomination, language],
  );
  /* ------------------------------------------------------- ubicación */

  const [position, setPosition] = useState<PositionResult | null>(null);
  const [locating, setLocating] = useState(false);
  const [radius, setRadius] = useState(25);

  /** Enciende el GPS y guarda la posición. Explica por qué si no se puede. */
  const locate = useCallback(async () => {
    setLocating(true);
    const result = await getCurrentPosition({ highAccuracy: true });
    setPosition(result);
    setLocating(false);

    if (result.source === "default") {
      toast.error(
        result.reason === "denied"
          ? "Necesitamos tu permiso de ubicación para buscar cerca de ti."
          : result.reason === "timeout"
            ? "El GPS tardó demasiado. Sal a un lugar con mejor señal e inténtalo otra vez."
            : "No pudimos leer tu ubicación. Revisa que el GPS esté encendido.",
      );
    }
  }, []);

  // Se intenta al abrir la pantalla; si se deniega, no se insiste.
  useEffect(() => {
    void locate();
  }, [locate]);

  const located = position?.source !== "default" && position != null;

  const nearby = useAsync(
    () =>
      churchService.nearby({
        lat: located ? position.latitude : undefined,
        lng: located ? position.longitude : undefined,
        radius: located ? radius : undefined,
        denomination: denomination || undefined,
        limit: 20,
      }),
    [located, position?.latitude, position?.longitude, radius, denomination],
  );

  const activeFilters = [city, denomination, language].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar iglesia"
          aria-label="Buscar iglesia"
          className="h-11 flex-1 rounded-full"
        />
        <Button variant="outline" onClick={() => setFiltersOpen(true)} className="h-11 shrink-0">
          Filtros{activeFilters > 0 && ` (${activeFilters})`}
        </Button>
      </div>

      <GeoMap
        title="Iglesias cerca de ti"
        subtitle={
          located
            ? `Tu ubicación · radio de ${radius} km`
            : position
              ? "Sin ubicación · mostrando todas"
              : "Buscando tu ubicación…"
        }
        center={located ? { lat: position.latitude, lng: position.longitude } : null}
        radiusKm={located ? radius : undefined}
        points={(nearby.data?.churches ?? []).slice(0, 12).map((c) => ({
          id: c.id,
          label: c.name,
          meta: c.distanceKm == null ? c.city : `${c.distanceKm} km`,
          lat: c.lat,
          lng: c.lng,
        }))}
        onSelect={(p) => navigate(`/churches/${p.id}`)}
      />

      <Tabs defaultValue="cerca">
        <TabsList>
          <TabsTrigger value="cerca">Cerca de ti</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>

        <TabsContent value="cerca">
          {/* Estado del GPS: qué se está usando y cómo cambiarlo. */}
          <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
            <Navigation
              className={cn("size-4 shrink-0", located ? "text-primary" : "text-muted-foreground")}
            />
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              {locating ? (
                "Leyendo tu ubicación…"
              ) : located ? (
                <>
                  Buscando desde tu posición
                  {position?.accuracy ? ` (±${Math.round(position.accuracy)} m)` : ""}. Hay{" "}
                  <strong className="text-foreground">{nearby.data?.total ?? 0}</strong> a menos de{" "}
                  {radius} km.
                </>
              ) : (
                "Sin tu ubicación no podemos medir distancias. Enciende el GPS y concede el permiso."
              )}
            </p>
            <Button
              size="sm"
              variant={located ? "outline" : "primary"}
              loading={locating}
              onClick={() => void locate()}
            >
              {located ? "Actualizar" : "Usar mi GPS"}
            </Button>
          </div>

          {located && (
            <div className="mb-3 flex gap-1.5">
              {[5, 10, 25, 50, 100].map((km) => (
                <Chip key={km} active={radius === km} onClick={() => setRadius(km)}>
                  {km} km
                </Chip>
              ))}
            </div>
          )}

          <AsyncBoundary
            data={nearby.data?.churches}
            loading={nearby.loading}
            error={nearby.error}
            reload={nearby.reload}
            skeleton={<ListSkeleton />}
            empty={
              located
                ? `No hay iglesias registradas a menos de ${radius} km. Prueba a ampliar el radio.`
                : undefined
            }
          >
            {(items) => (
              <div className="space-y-3">
                {items.map((c) => (
                  <ChurchCard key={c.id} church={c} />
                ))}
              </div>
            )}
          </AsyncBoundary>
        </TabsContent>

        <TabsContent value="todas">
          <AsyncBoundary {...churches} skeleton={<ListSkeleton />}>
            {(items) => (
              <div className="space-y-3">
                {items.map((c) => (
                  <ChurchCard key={c.id} church={c} />
                ))}
              </div>
            )}
          </AsyncBoundary>
        </TabsContent>
      </Tabs>

      <BottomSheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <BottomSheetContent title="Filtrar iglesias">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Ciudad</p>
              <SimpleSelect
                value={city}
                onValueChange={setCity}
                options={[{ value: "", label: "Todas" }, ...CITIES.map((c) => ({ value: c, label: c }))]}
                ariaLabel="Ciudad"
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Denominación</p>
              <SimpleSelect
                value={denomination}
                onValueChange={setDenomination}
                options={[
                  { value: "", label: "Todas" },
                  ...DENOMINATIONS.map((d) => ({ value: d, label: d })),
                ]}
                ariaLabel="Denominación"
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Idioma</p>
              <SimpleSelect
                value={language}
                onValueChange={setLanguage}
                options={[
                  { value: "", label: "Todos" },
                  { value: "Español", label: "Español" },
                  { value: "Inglés", label: "Inglés" },
                ]}
                ariaLabel="Idioma"
              />
            </div>
          </div>
          <div className="mt-5 flex gap-2.5">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setCity("");
                setDenomination("");
                setLanguage("");
              }}
            >
              Limpiar
            </Button>
            <Button className="flex-[2]" onClick={() => setFiltersOpen(false)}>
              Ver resultados
            </Button>
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

/* ---------------------------------------------------------------- detail */

function ChurchProfile({ id }: { id: string }) {
  const church = useAsync(() => churchService.get(id), [id]);
  const members = useAsync(() => churchService.members(id), [id]);
  const ministries = useAsync(() => ministryService.byChurch(id), [id]);
  const events = useAsync(() => eventService.byChurch(id), [id]);
  const sermons = useAsync(() => sermonService.byChurch(id), [id]);
  const [joined, setJoined] = useState(false);

  if (church.loading) return <DetailSkeleton />;
  const c = church.data;
  if (!c) return null;

  const pastor = users.find((u) => u.id === c.pastorId);

  return (
    <div className="space-y-6">
      <HeroMedia seed={c.id} title={c.name} kind="church" gradient={c.color} className="flex min-h-52 items-end p-5">
        <div className="relative z-10 flex items-end gap-3.5">
          <GenerativeCover
            seed={`${c.id}-logo`}
            gradient={c.color}
            className="size-16 shrink-0 border-2 border-white/20"
            rounded="rounded-2xl"
            icon={ChurchIcon}
          />
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold text-white">{c.name}</h1>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-white/80">
              <MapPin className="size-3.5" /> {c.city}, {c.country}
            </p>
          </div>
        </div>
      </HeroMedia>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="primary">{c.denomination}</Badge>
        <Badge variant="outline">{c.language}</Badge>
        <Badge variant="outline">
          <Users className="size-3" /> {formatCompact(c.members)} miembros
        </Badge>
        <Badge variant="outline">a {c.distanceKm} km</Badge>
      </div>

      <div className="flex gap-2.5">
        <Button
          className="flex-1"
          variant={joined ? "secondary" : "primary"}
          onClick={async () => {
            await churchService.join(c.id);
            setJoined(true);
            toast.success(`Te uniste a ${c.name}`);
          }}
        >
          {joined ? "Eres miembro" : "Unirme"}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void openExternal(
              directionsUrl({ lat: c.lat, lng: c.lng, label: c.name, address: `${c.city}, ${c.country}` }),
            )
          }
        >
          <Navigation className="size-4" /> Cómo llegar
        </Button>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
        {c.description}
      </p>

      <GeoMap
        title={c.name}
        subtitle={`${c.city}, ${c.country}`}
        center={c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null}
        points={[{ id: c.id, label: c.name, meta: c.city, lat: c.lat, lng: c.lng }]}
      />

      <section>
        <h2 className="mb-2.5 text-section font-semibold">Horarios</h2>
        <ul className="space-y-2">
          {c.services.map((s) => (
            <li
              key={`${s.day}-${s.time}`}
              className="flex items-center gap-3 rounded-xl border border-border p-3"
            >
              <Clock className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{s.type}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.day} · {s.time}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {pastor && (
        <Link
          to={`/profile/${pastor.id}`}
          className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors active:bg-secondary"
        >
          <GenerativeCover
            seed={pastor.id}
            gradient={pastor.color}
            className="size-11 shrink-0"
            rounded="rounded-full"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{pastor.name}</span>
            <span className="block text-xs text-muted-foreground">Pastor</span>
          </span>
        </Link>
      )}

      <Tabs defaultValue="ministerios">
        <TabsList>
          <TabsTrigger value="ministerios">Ministerios</TabsTrigger>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="sermones">Sermones</TabsTrigger>
          <TabsTrigger value="miembros">Miembros</TabsTrigger>
        </TabsList>

        <TabsContent value="ministerios">
          <div className="grid gap-4 sm:grid-cols-2">
            {ministries.data?.map((m) => (
              <MinistryCard key={m.id} ministry={m} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="eventos">
          <div className="space-y-3">
            {events.data?.length ? (
              events.data.map((e) => <EventCard key={e.id} event={e} />)
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Esta iglesia no tiene eventos publicados por ahora.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="sermones">
          <div className="grid gap-4 sm:grid-cols-2">
            {sermons.data?.map((s) => (
              <SermonCard key={s.id} sermon={s} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="miembros">
          <div className="space-y-2">
            {members.data?.slice(0, 12).map((m) => (
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
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.ministries.join(", ")}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <section>
        <h2 className="mb-2.5 text-section font-semibold">Contacto</h2>
        <ul className="space-y-2">
          <li className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{c.contact.email}</span>
          </li>
          <li className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
            <Phone className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{c.contact.phone}</span>
          </li>
          <li className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
            <Globe className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{c.contact.site}</span>
          </li>
        </ul>
      </section>

      <Rail title="Próximos encuentros">
        {events.data?.slice(0, 6).map((e) => (
          <Link key={e.id} to={`/events/${e.id}`} className="min-w-0">
            <GenerativeCover
              seed={e.id}
              gradient={e.color}
              className="aspect-square w-full"
              icon={Calendar}
              label={e.title}
            />
            <p className="mt-2 truncate text-sm font-medium">{e.title}</p>
            <p className="truncate text-xs text-muted-foreground">{e.date}</p>
          </Link>
        ))}
      </Rail>
    </div>
  );
}

export function ChurchDetail() {
  const { id = "" } = useParams();
  const church = useAsync(() => churchService.get(id), [id]);
  usePageMeta(church.data?.name ?? "Iglesia", church.data?.description);
  useScreen({ title: church.data?.name ?? "Iglesia", back: true, hideSections: true }, [
    church.data?.id,
  ]);
  return <ChurchProfile id={id} />;
}

export function MyChurch() {
  const church = useAsync(() => churchService.myChurch(), []);
  usePageMeta("Mi iglesia", "Tu comunidad local en Heseria.");
  useScreen({ title: "Mi iglesia", back: true, hideSections: true }, [church.data?.id]);

  if (church.loading) return <DetailSkeleton />;
  if (!church.data) return null;
  return <ChurchProfile id={church.data.id} />;
}
