import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useHtmlLang } from "@/i18n";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ownerAllowed } from "@/lib/nav";
import { isSuperAdmin } from "@/lib/permissions";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomTabs } from "@/components/layout/BottomTabs";
import { MiniPlayer, usePlayerClock } from "@/components/layout/Player";
import { OfflineState } from "@/components/states";
import { TooltipProvider } from "@/components/ui/overlays";
import {
  hideSplash, isNative, onDeepLink, openExternal, scheduleDailyVerse, onHardwareBack, onLocalNotificationOpened, onNetworkChange,
  onPushOpened, showLocalNotification, syncStatusBar,
} from "@/native";
import { onRealtimeEvent, reviveRealtime } from "@/services/realtime";
import { authService, enableWebPush } from "@/services";
import { userName } from "@/store/directory";
import { CallOverlay } from "@/pages/community/Calls";
import { preferencesStore, themeStore, usePreferences, useSession } from "@/store";
import { useScreenConfig } from "@/store/screen";

/**
 * HESERIA — Mobile app frame.
 *
 * A fixed header and a fixed tab bar with a single scrolling content column
 * between them, the way a native screen stack behaves. Nothing here scrolls the
 * document itself, so the tab bar and the player never drift.
 */
export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { offline } = usePreferences();
  const screen = useScreenConfig();
  const { user } = useSession();
  usePlayerClock();
  // Mantiene <html lang> al día con el idioma elegido.
  useHtmlLang();

  // Each navigation starts at the top, like pushing a new screen.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname, location.search]);

  // Dismiss the native splash once the first screen is mounted.
  useEffect(() => {
    void hideSplash();
  }, []);

  // Keep the OS status bar matching the app theme.
  useEffect(() => {
    const apply = () => {
      const dark = document.documentElement.classList.contains("dark");
      void syncStatusBar(dark);
    };
    apply();
    return themeStore.subscribe(apply);
  }, []);

  // Atrás de Android: regresa por el historial de la app. Se mira el índice
  // que guarda el router (`history.state.idx`), no `history.length`, que
  // siempre pasa de 1 y hacía que Atrás repitiera pantallas (lección del skill).
  // En la primera pantalla se deja pasar y Android cierra la app.
  useEffect(() => {
    return onHardwareBack(() => {
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) {
        navigate(-1);
        return true;
      }
      return false;
    });
  }, [navigate]);

  // Pulso de presencia: sin servidor, «conectada» es haber dado señal hace
  // menos de un minuto y medio. Es lo que permite saber si una llamada puede
  // sonar en el otro teléfono.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") void authService.heartbeat();
    };
    beat();
    const id = window.setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  // heseria://... and https://heseria.app/... open the matching screen.
  useEffect(() => {
    return onDeepLink((path) => navigate(path));
  }, [navigate]);

  // Tocar una notificación del sistema abre la pantalla que lleve dentro,
  // venga de Google/Apple o del propio teléfono.
  useEffect(() => {
    void onPushOpened((href) => navigate(href));
    void onLocalNotificationOpened((href) => navigate(href));
  }, [navigate]);

  // Un mensaje que llega con la app en segundo plano también avisa.
  useEffect(() => {
    return onRealtimeEvent("message", ({ message }) => {
      if (document.visibilityState !== "hidden") return;
      const autor = userName(message.authorId);
      void showLocalNotification({
        title: `Mensaje de ${autor}`,
        body: message.body.slice(0, 140),
        href: "/messages",
      });
    });
  }, []);

  // APK: si la web publica una versión más nueva (heseria.web.app/version.json), se ofrece
  // instalarla encima (misma llave y versionCode mayor: no hace falta desinstalar).
  useEffect(() => {
    if (!isNative()) return;
    const mine = Number(String(import.meta.env.VITE_APP_VERSION ?? "").split(".")[2] ?? 0);
    fetch("https://heseria.web.app/version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { code?: number; url?: string } | null) => {
        const latest = v?.code ?? 0;
        const url = v?.url;
        if (url && mine && latest > mine) {
          toast("Hay una nueva versión de Heseria", {
            duration: 15000,
            action: { label: "Actualizar", onClick: () => void openExternal(url) },
          });
        }
      })
      .catch(() => undefined);
  }, []);

  // Versículo del día: activado salvo que la persona lo apague en Configuración.
  // Se reprograma en cada apertura para que la ventana de 60 días no se acabe.
  useEffect(() => {
    if (isNative()) {
      if (localStorage.getItem("heseria.dailyVerse") !== "0") void scheduleDailyVerse(true);
    } else if (localStorage.getItem("heseria.pushToken") && Notification.permission === "granted") {
      // El token de FCM puede cambiar: se renueva sin volver a preguntar.
      void enableWebPush(false).catch(() => undefined);
    }
  }, []);

  // Real connectivity drives the offline experience.
  useEffect(() => {
    return onNetworkChange((status) => {
      preferencesStore.set({ offline: !status.connected });
      // Al recuperar la red, el canal en vivo vuelve sin esperar al reintento.
      if (status.connected) reviveRealtime();
    });
  }, []);

  // Volver del segundo plano también reabre el canal si se había caído.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reviveRealtime();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // El superadmin solo administra: cualquier pantalla de usuario lo regresa al panel.
  if (isSuperAdmin(user) && !ownerAllowed(location.pathname)) return <Navigate to="/admin" replace />;

  return (
    <TooltipProvider>
      {/* Una llamada puede entrar en cualquier pantalla, así que vive aquí. */}
      <CallOverlay />

      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <AppHeader />

        <main
          ref={scrollRef}
          id="contenido"
          className="min-h-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain"
        >
          <div className={screen.immersive ? "" : "px-4 pb-8 pt-4"}>
            {offline && !screen.immersive && <OfflineState className="mb-4" />}
            <div className="animate-fade-up">
              <Outlet />
            </div>
          </div>
        </main>

        {!screen.immersive && (
          <>
            <MiniPlayer />
            <BottomTabs />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
