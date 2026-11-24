/** Radio en vivo: barra fija mientras suena (AppShell) y tarjeta «Sonando ahora» en la pantalla Radio. */
import { Moon, Radio as RadioIcon, RotateCw, Square } from "lucide-react";
import { Link } from "react-router-dom";
import { playRadio, setSleep, stopRadio, useRadio, type RadioStatus } from "@/lib/radio";

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
      <Link to="/radio" className="flex min-w-0 flex-1 items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${r.status === "en-vivo" ? "animate-pulse bg-rose-500" : "bg-muted-foreground"}`} aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{r.station.name}</span>
          <span className="block text-xs text-muted-foreground">{LABEL[r.status]}</span>
        </span>
      </Link>
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
