/** Radio en vivo: barra fija mientras suena (AppShell) y tarjeta «Sonando ahora» en la pantalla Radio. */
import { Globe, Heart, Moon, Play, Radio as RadioIcon, RotateCw, SkipBack, SkipForward, Square } from "lucide-react";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import {
  playRadio, radioFavorites, setRadioExpanded, setSleep, stepRadio, stopRadio, toggleRadioFavorite, useRadio,
  type RadioStatus,
} from "@/lib/radio";
import { today } from "@/lib/radio-schedule";
import { cn } from "@/lib/utils";

const LABEL: Record<RadioStatus, string> = {
  detenida: "Detenida",
  conectando: "Conectando…",
  "en-vivo": "En vivo",
  reconectando: "Reconectando…",
  "sin-senal": "Sin señal",
};

export function RadioBar() {
  const r = useRadio();
  if (!r.station || r.status === "detenida") return null;
  return (
    <div className="flex items-center gap-3 border-t border-border bg-surface px-4 py-2">
      <button type="button" onClick={() => setRadioExpanded(true)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className={`size-2 shrink-0 rounded-full ${r.status === "en-vivo" ? "animate-pulse bg-rose-500" : "bg-muted-foreground"}`} aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{r.station.name}</span>
          <span className="block text-xs text-muted-foreground">{LABEL[r.status]}</span>
        </span>
      </button>
      <button type="button" onClick={stopRadio} aria-label="Detener radio" className="tap-target grid place-items-center rounded-full">
        <Square className="size-4 fill-current" />
      </button>
    </div>
  );
}

const SLEEP = [15, 30, 60];

export function RadioNowPlaying() {
  const r = useRadio();
  if (!r.station || r.status === "detenida") return null;
  const left = r.sleepAt ? Math.max(1, Math.round((r.sleepAt - Date.now()) / 60_000)) : null;
  return (
    <section className="rounded-3xl border border-primary/30 bg-primary/10 p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        {r.station.logo ? (
          <img src={r.station.logo} alt="" className="size-14 rounded-2xl object-cover" />
        ) : (
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/20 text-primary"><RadioIcon className="size-6" /></span>
        )}
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-rose-400">
            <span className={`size-2 rounded-full ${r.status === "en-vivo" ? "animate-pulse bg-rose-500" : "bg-muted-foreground"}`} /> {LABEL[r.status]}
          </p>
          <p className="truncate font-semibold">{r.station.name}</p>
        </div>
        {r.status === "sin-senal" ? (
          <button type="button" onClick={() => playRadio(r.station!)} aria-label="Reintentar" className="tap-target grid place-items-center rounded-full bg-primary text-primary-foreground">
            <RotateCw className="size-4" />
          </button>
        ) : (
          <button type="button" onClick={stopRadio} aria-label="Detener" className="tap-target grid place-items-center rounded-full bg-primary text-primary-foreground">
            <Square className="size-4 fill-current" />
          </button>
        )}
      </div>
      {r.status === "sin-senal" && (
        <p className="mt-2 text-xs text-muted-foreground">La emisora no responde. Puede estar fuera del aire; intenta más tarde.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <Moon className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">Apagar en:</span>
        {SLEEP.map((m) => (
          <button key={m} type="button" onClick={() => setSleep(m)} className="rounded-full border border-border px-2.5 py-1">{m} min</button>
        ))}
        {left && (
          <button type="button" onClick={() => setSleep(null)} className="rounded-full border border-primary px-2.5 py-1 text-primary">
            Se apaga en {left} min · quitar
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Reproductor de radio a pantalla completa (como el de podcasts): emisora, estado en vivo,
 * anterior/siguiente emisora, programación de hoy y la lista para cambiar de emisora.
 * Es en vivo: no hay barra de tiempo ni adelantar.
 */
export function RadioFullPlayer() {
  const r = useRadio();
  const s = r.station;
  const fav = radioFavorites();
  const left = r.sleepAt ? Math.max(1, Math.round((r.sleepAt - Date.now()) / 60_000)) : null;
  const playing = r.status !== "detenida" && r.status !== "sin-senal";
  const programs = today(s?.schedule);
  return (
    <BottomSheet open={Boolean(s) && r.expanded} onOpenChange={setRadioExpanded}>
      <BottomSheetContent title="Radio en vivo" fullScreen>
        {s && (
          <div className="mx-auto max-w-md space-y-6 pb-4">
            <div className="flex flex-col items-center text-center">
              {s.logo ? (
                <img src={s.logo} alt="" className="size-56 rounded-3xl bg-primary/10 object-cover shadow-[var(--shadow-lift)]" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
              ) : (
                <span className="grid size-56 place-items-center rounded-3xl bg-primary/15 text-primary"><RadioIcon className="size-20" /></span>
              )}
              <h2 className="mt-6 font-display text-2xl font-semibold">{s.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{[s.region, s.country].filter(Boolean).join(", ")}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-rose-400">
                <span className={cn("size-2 rounded-full", r.status === "en-vivo" ? "animate-pulse bg-rose-500" : "bg-muted-foreground")} /> {LABEL[r.status]}
              </p>
            </div>

            <div className="flex items-center justify-center gap-6">
              <button type="button" onClick={() => stepRadio(-1)} disabled={r.list.length < 2} aria-label="Emisora anterior" className="tap-target grid place-items-center disabled:opacity-30">
                <SkipBack className="size-7 fill-current" />
              </button>
              <button
                type="button"
                onClick={() => (playing ? stopRadio() : playRadio(s))}
                aria-label={playing ? "Detener" : "Escuchar"}
                className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                {r.status === "sin-senal" ? <RotateCw className="size-6" /> : playing ? <Square className="size-6 fill-current" /> : <Play className="ml-1 size-7 fill-current" />}
              </button>
              <button type="button" onClick={() => stepRadio(1)} disabled={r.list.length < 2} aria-label="Emisora siguiente" className="tap-target grid place-items-center disabled:opacity-30">
                <SkipForward className="size-7 fill-current" />
              </button>
            </div>
            {r.status === "sin-senal" && <p className="text-center text-xs text-muted-foreground">La emisora no responde. Puede estar fuera del aire; prueba otra.</p>}

            <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
              <button type="button" onClick={() => toggleRadioFavorite(s.id)} aria-pressed={fav.includes(s.id)} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1">
                <Heart className={cn("size-3.5", fav.includes(s.id) && "fill-rose-500 text-rose-500")} /> Favorita
              </button>
              {s.site && (
                <a href={s.site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1"><Globe className="size-3.5" /> Sitio</a>
              )}
              <Moon className="ml-1 size-3.5 text-muted-foreground" aria-hidden />
              {SLEEP.map((m) => (
                <button key={m} type="button" onClick={() => setSleep(m)} className="rounded-full border border-border px-2.5 py-1">{m} min</button>
              ))}
              {left && <button type="button" onClick={() => setSleep(null)} className="rounded-full border border-primary px-2.5 py-1 text-primary">Se apaga en {left} min · quitar</button>}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Programación de hoy</h3>
              {programs.length ? (
                <ul className="space-y-1.5">
                  {programs.map((p) => (
                    <li key={`${p.start}-${p.title}`} className={cn("flex gap-3 rounded-xl px-3 py-2 text-sm", p.live ? "bg-primary/12 font-medium" : "bg-surface-2")}>
                      <span className="tabular-nums text-muted-foreground">{p.start}–{p.end}</span>
                      <span className="min-w-0 flex-1">{p.title}</span>
                      {p.live && <span className="text-xs font-semibold text-rose-400">AL AIRE</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
                  Esta emisora aún no publica su programación en Heseria.{s.site ? " Puedes verla en su sitio." : ""}
                </p>
              )}
            </section>

            {r.list.length > 1 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Cambiar de emisora</h3>
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {r.list.map((x) => (
                    <li key={x.id}>
                      <button type="button" onClick={() => playRadio(x)} className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm", x.id === s.id ? "bg-primary/12 font-medium text-primary" : "active:bg-secondary")}>
                        <RadioIcon className="size-4 shrink-0" /> <span className="min-w-0 flex-1 truncate">{x.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{x.country}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
