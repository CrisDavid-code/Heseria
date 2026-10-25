/**
 * HESERIA — ¿Se puede instalar la web? (PWA). Plantilla del skill (useInstall de Chambas GT).
 *
 * Chrome lanza `beforeinstallprompt` una sola vez y muy pronto: se escucha desde main.tsx,
 * antes de que cargue la pantalla que muestra la invitación.
 */
import { useEffect, useState } from "react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function listenForInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(navigator.userAgent);
/** Facebook, Instagram, WhatsApp… abren enlaces en su propio navegador, que no instala. */
export const isInAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\/|TikTok|; wv\)/i.test(navigator.userAgent);
export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return {
    canPrompt: Boolean(deferred),
    installed: isStandalone(),
    async install() {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => undefined);
      deferred = null;
      notify();
    },
  };
}
