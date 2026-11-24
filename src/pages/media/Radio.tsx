/**
 * HESERIA — Radio cristiana en vivo.
 *
 * Catálogo que administra la administración (Administración → Radios), solo con transmisiones
 * verificadas. Búsqueda, filtros por país e idioma, favoritos e historial en el teléfono.
 */
import { Globe, Heart, Radio as RadioIcon, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { SimpleSelect } from "@/components/ui/controls";
import { Input } from "@/components/ui/primitives";
import { RadioNowPlaying } from "@/components/media/RadioBar";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { playRadio, radioFavorites, radioHistory, toggleRadioFavorite, useRadio } from "@/lib/radio";
import { radioService, type RadioStation } from "@/services";
import { useScreen } from "@/store/screen";
import { cn } from "@/lib/utils";

const ALL = "Todos";

export default function Radio() {
  usePageMeta("Radio cristiana", "Emisoras cristianas en vivo.");
  useScreen({ title: "Radio" });
  const stations = useAsync(() => radioService.list(), []);
  const radio = useRadio();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState(ALL);
  const [language, setLanguage] = useState(ALL);
  const [onlyFav, setOnlyFav] = useState(false);
  const fav = radioFavorites();

  const options = (key: "country" | "language") =>
    [ALL, ...new Set((stations.data ?? []).map((s) => s[key]).filter(Boolean))].map((v) => ({ value: v, label: v }));

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (stations.data ?? []).filter(
      (s) =>
        (!needle || `${s.name} ${s.description} ${s.categories.join(" ")}`.toLowerCase().includes(needle)) &&
        (country === ALL || s.country === country) &&
        (language === ALL || s.language === language) &&
        (!onlyFav || fav.includes(s.id)),
    );
  }, [stations.data, q, country, language, onlyFav, fav]);

  const recent = radioHistory()
    .map((id) => stations.data?.find((s) => s.id === id))
    .filter((s): s is RadioStation => Boolean(s))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <RadioNowPlaying />

      {stations.loading ? (
        <ListSkeleton count={5} />
      ) : stations.error ? (
        <ErrorState onRetry={stations.reload} />
      ) : !stations.data?.length ? (
        <EmptyState
          icon={RadioIcon}
          title="Pronto habrá emisoras aquí"
          description="Estamos verificando emisoras cristianas y sus permisos de transmisión antes de publicarlas."
        />
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar emisora" aria-label="Buscar emisora" className="pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SimpleSelect value={country} onValueChange={setCountry} options={options("country")} ariaLabel="País" />
            <SimpleSelect value={language} onValueChange={setLanguage} options={options("language")} ariaLabel="Idioma" />
          </div>
          <button
            type="button"
            onClick={() => setOnlyFav((v) => !v)}
            aria-pressed={onlyFav}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", onlyFav ? "border-primary text-primary" : "border-border")}
          >
            <Heart className={cn("size-3.5", onlyFav && "fill-current")} /> Mis favoritas
          </button>

          {recent.length > 0 && !q && !onlyFav && (
            <section>
              <h2 className="mb-2 text-section font-semibold">Escuchadas recientemente</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recent.map((s) => (
                  <button key={s.id} type="button" onClick={() => playRadio(s)} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-sm">
                    {s.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna emisora coincide.</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((s) => {
                const live = radio.station?.id === s.id && radio.status !== "detenida";
                return (
                  <li key={s.id} className={cn("flex items-center gap-3 rounded-2xl border p-3", live ? "border-primary bg-primary/5" : "border-border")}>
                    <button type="button" onClick={() => playRadio(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      {s.logo ? (
                        <img src={s.logo} alt="" className="size-12 shrink-0 rounded-xl object-cover" loading="lazy" />
                      ) : (
                        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><RadioIcon className="size-5" /></span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[s.region, s.country].filter(Boolean).join(", ")}{s.categories.length ? ` · ${s.categories.join(", ")}` : ""}
                        </span>
                      </span>
                    </button>
                    {s.site && (
                      <a href={s.site} target="_blank" rel="noreferrer" aria-label={`Sitio oficial de ${s.name}`} className="tap-target grid place-items-center rounded-full text-muted-foreground">
                        <Globe className="size-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleRadioFavorite(s.id)}
                      aria-pressed={fav.includes(s.id)}
                      aria-label={fav.includes(s.id) ? `Quitar ${s.name} de favoritas` : `Agregar ${s.name} a favoritas`}
                      className="tap-target grid place-items-center rounded-full text-muted-foreground"
                    >
                      <Heart className={cn("size-4", fav.includes(s.id) && "fill-rose-400 text-rose-400")} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Las emisoras transmiten desde sus propios servidores; Heseria no aloja su audio. La fuente puede incluir
            sus propios anuncios.
          </p>
        </>
      )}
    </div>
  );
}
