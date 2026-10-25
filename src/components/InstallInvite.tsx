/**
 * HESERIA — Invitación a instalar la app (plantilla InstallInvite de Chambas GT).
 *
 * En la bienvenida y el inicio de sesión. Detecta Android o iPhone y muestra la guía de ese
 * sistema con mini pantallas que señalan qué tocar. En Android ofrece también el APK. No aparece
 * si ya se abrió como app instalada (o dentro del APK).
 */
import { useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Bell, BookOpen, ChevronLeft, ChevronRight, Download, EllipsisVertical, ExternalLink, Share,
  Smartphone, SquarePlus, WifiOff, X,
} from "lucide-react";
import { isAndroid, isInAppBrowser, isIos, useInstall } from "@/lib/install";

export const APK_URL = "https://github.com/CrisDavid-code/Heseria/releases/download/heseria-android/heseria.apk";

const HIDE_KEY = "heseria.installInviteHiddenAt";
const HIDE_DAYS = 7;

function hiddenRecently() {
  try {
    return Date.now() - Number(localStorage.getItem(HIDE_KEY)) < HIDE_DAYS * 864e5;
  } catch {
    return false;
  }
}

/** Mini pantalla de teléfono para la guía; `Hot` marca lo que hay que tocar. */
function Screen({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="relative h-24 w-32 shrink-0 overflow-hidden rounded-2xl border border-border bg-background p-1.5 shadow-sm">
      {children}
    </div>
  );
}
const Hot = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`relative inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground ring-4 ring-primary/25 motion-safe:animate-pulse ${className}`}>
    {children}
  </span>
);
const Line = ({ w = "w-3/4" }: { w?: string }) => <span className={`block h-1.5 rounded-full bg-border ${w}`} />;
const AppIcon = () => <img src="/icon-192.png" alt="" className="size-7 rounded-lg" />;

const ANDROID_STEPS: { title: string; screen: ReactNode }[] = [
  {
    title: "Toca el menú ⋮ de Chrome",
    screen: (
      <Screen>
        <div className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-1">
          <span className="block h-2 flex-1 rounded-full bg-border" />
          <Hot className="size-6"><EllipsisVertical className="size-4" /></Hot>
        </div>
        <div className="mt-2 flex flex-col gap-1.5 px-1"><Line /><Line w="w-1/2" /><Line w="w-2/3" /></div>
      </Screen>
    ),
  },
  {
    title: "Elige «Instalar app» o «Agregar a la pantalla principal»",
    screen: (
      <Screen>
        <div className="ml-auto flex w-[88%] flex-col gap-1.5 rounded-xl bg-surface p-1.5 shadow-sm">
          <Line w="w-2/3" />
          <Line w="w-1/2" />
          <Hot className="w-full justify-start gap-1 px-1.5 py-1 text-[9px] font-bold"><Download className="size-3" /> Instalar app</Hot>
          <Line w="w-3/5" />
        </div>
      </Screen>
    ),
  },
  {
    title: "Confirma con «Instalar»",
    screen: (
      <Screen>
        <div className="flex h-full flex-col justify-center rounded-xl bg-surface p-2 text-[9px] shadow-sm">
          <span className="flex items-center gap-1.5 font-bold"><AppIcon /> Heseria</span>
          <span className="mt-2 flex justify-end gap-1.5 font-bold">
            <span className="px-1 py-0.5 text-muted-foreground">Cancelar</span>
            <Hot className="px-1.5 py-0.5">Instalar</Hot>
          </span>
        </div>
      </Screen>
    ),
  },
];

const IOS_STEPS: { title: string; screen: ReactNode }[] = [
  {
    title: "En Safari, toca Compartir",
    screen: (
      <Screen>
        <div className="flex flex-col gap-1.5 px-1 pt-1"><Line /><Line w="w-1/2" /><Line w="w-2/3" /></div>
        <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-around rounded-xl bg-surface py-1 text-muted-foreground">
          <ChevronLeft className="size-3.5" />
          <ChevronRight className="size-3.5" />
          <Hot className="size-6"><Share className="size-3.5" /></Hot>
          <span className="block size-3 rounded border border-current" />
        </div>
      </Screen>
    ),
  },
  {
    title: "Desliza y elige «Agregar a pantalla de inicio»",
    screen: (
      <Screen>
        <div className="absolute inset-x-1.5 bottom-1.5 flex flex-col gap-1.5 rounded-xl bg-surface p-1.5 shadow-sm">
          <Line w="w-1/2" />
          <Line w="w-2/3" />
          <Hot className="w-full justify-between px-1.5 py-1 text-[9px] font-bold">
            Agregar a inicio <SquarePlus className="size-3" />
          </Hot>
        </div>
      </Screen>
    ),
  },
  {
    title: "Toca «Agregar» arriba a la derecha",
    screen: (
      <Screen>
        <div className="flex items-center justify-between rounded-xl bg-surface px-1.5 py-1 text-[9px] font-bold">
          <span className="text-muted-foreground">Cancelar</span>
          <Hot className="px-1.5 py-0.5">Agregar</Hot>
        </div>
        <span className="mt-2 flex items-center gap-1.5 px-1 text-[9px] font-bold"><AppIcon /> Heseria</span>
      </Screen>
    ),
  },
];

const BENEFITS: [ReactNode, string][] = [
  [<BookOpen key="i" className="size-3.5" />, "La Biblia sin conexión"],
  [<Bell key="i" className="size-3.5" />, "Versículo de cada día"],
  [<WifiOff key="i" className="size-3.5" />, "Abre al instante"],
];

export function InstallInvite({ className = "" }: { className?: string }) {
  const install = useInstall();
  const [hidden, setHidden] = useState(hiddenRecently);
  const ios = isIos();
  const android = isAndroid();

  if (Capacitor.isNativePlatform() || install.installed || hidden) return null;
  // En computadora solo si el navegador ofrece instalar con un toque.
  if (!ios && !android && !install.canPrompt) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now()));
    } catch {
      /* sin almacenamiento: vuelve a aparecer al recargar */
    }
  };

  const steps = ios ? IOS_STEPS : ANDROID_STEPS;
  return (
    <section aria-labelledby="instalar" className={`relative overflow-hidden rounded-3xl border border-border bg-surface p-5 text-left shadow-sm ${className}`}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/10 blur-2xl" />
      <button type="button" onClick={close} aria-label="Ahora no" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-muted-foreground transition active:scale-90">
        <X className="size-4" aria-hidden />
      </button>
      <div className="flex items-center gap-3 pr-8">
        <img src="/icon-192.png" alt="" className="size-14 rounded-2xl shadow-sm" />
        <div>
          <h2 id="instalar" className="font-display text-lg font-semibold leading-tight">Instala Heseria</h2>
          <p className="text-sm text-muted-foreground">{ios ? "En tu iPhone, gratis y sin App Store." : "En tu teléfono, gratis y en segundos."}</p>
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {BENEFITS.map(([icon, text]) => (
          <li key={text} className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3 py-1 text-xs font-semibold text-primary">
            {icon} {text}
          </li>
        ))}
      </ul>

      {isInAppBrowser() ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-background p-3 text-sm">
          <ExternalLink className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          Estás dentro de otra app. Abre este enlace en {ios ? "Safari" : "Chrome"} (menú ⋯ → «Abrir en el navegador») para instalarla.
        </p>
      ) : (
        <>
          {install.canPrompt && (
            <button
              type="button"
              onClick={() => void install.install()}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground transition active:scale-[0.97]"
            >
              <Download className="size-5" aria-hidden /> Instalar app
            </button>
          )}
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {install.canPrompt ? "O hazlo desde el menú:" : ios ? "Así se instala en iPhone:" : "Así se instala en Android:"}
          </p>
          <ol className="mt-3 flex flex-col gap-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex items-center gap-3">
                {s.screen}
                <span className="flex items-start gap-2 text-sm leading-snug">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                  {s.title}
                </span>
              </li>
            ))}
          </ol>
          {ios && /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent) && (
            <p className="mt-3 text-xs text-muted-foreground">Si no ves «Agregar a pantalla de inicio», abre esta página en Safari.</p>
          )}
          {android && (
            <a href={APK_URL} className="mt-4 flex items-center gap-2 rounded-2xl border border-border p-3 text-sm font-medium">
              <Smartphone className="size-4 text-primary" aria-hidden />
              <span className="flex-1">¿Prefieres la app de Android? Descarga el APK</span>
              <Download className="size-4 text-muted-foreground" aria-hidden />
            </a>
          )}
        </>
      )}
    </section>
  );
}
