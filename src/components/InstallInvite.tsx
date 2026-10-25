/**
 * HESERIA — Invitación a instalar la versión web (PWA). Plantilla del skill, simplificada.
 *
 * Android y computadora: botón «Instalar» con el aviso del navegador. iPhone no tiene ese
 * aviso: se explica Compartir → «Agregar a pantalla de inicio». No aparece dentro del
 * APK/iOS ni si ya se abrió como app instalada.
 */
import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";

type PromptEvent = Event & { prompt: () => Promise<void> };

const HIDE_KEY = "heseria.installHiddenAt";
const hiddenRecently = () => {
  try {
    return Date.now() - Number(localStorage.getItem(HIDE_KEY)) < 7 * 864e5;
  } catch {
    return false;
  }
};

export function InstallInvite({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [hidden, setHidden] = useState(hiddenRecently);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (Capacitor.isNativePlatform() || installed || hidden || (!ios && !prompt)) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now()));
    } catch {
      /* sin almacenamiento: vuelve a aparecer al recargar */
    }
  };

  return (
    <section className={`relative rounded-2xl border border-border bg-surface p-4 ${className}`}>
      <button
        type="button"
        onClick={close}
        aria-label="Ahora no"
        className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-muted-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-3 pr-8">
        <img src="/icon-192.png" alt="" className="size-12 rounded-xl" />
        <div>
          <h2 className="font-semibold leading-tight">Instala Heseria</h2>
          <p className="text-sm text-muted-foreground">Gratis, abre al instante y funciona sin conexión.</p>
        </div>
      </div>
      {prompt ? (
        <Button
          full
          className="mt-3"
          onClick={() => void prompt.prompt().then(() => setPrompt(null))}
        >
          <Download className="size-4" /> Instalar app
        </Button>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          En Safari toca <Share className="inline size-4 align-text-bottom text-primary" aria-label="Compartir" />{" "}
          y luego <strong>«Agregar a pantalla de inicio»</strong>.
        </p>
      )}
    </section>
  );
}
