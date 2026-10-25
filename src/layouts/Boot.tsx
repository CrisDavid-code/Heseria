/**
 * HESERIA — Arranque y guardas de ruta.
 *
 * `BootGate` decide qué se ve en el primer segundo: recupera la sesión que
 * Firebase guardó en el teléfono y carga el directorio. Hasta que termina se
 * muestra la marca, no una pantalla a medio pintar.
 *
 * Si la app se compiló sin la configuración de Firebase no se finge que todo va
 * bien: se dice qué falta (lección del skill: `isFirebaseConfigured`).
 */
import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { HeseriaMark } from "@/components/layout/Brand";
import { auth, isFirebaseConfigured } from "@/services/firebase";
import { loadDirectory } from "@/store/directory";
import { hideSplash } from "@/native";
import {
  endSession, loadLibrary, loadNotifications, restoreSession, sessionStore, useSession,
} from "@/store";
import { can, isSuperAdmin } from "@/lib/permissions";
import type { Permission } from "@/types";

type BootState = "starting" | "ready";

/* ------------------------------------------------------------- pantallas */

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="flex flex-col items-center gap-4">
        <HeseriaMark className="size-14 animate-pulse" />
        <span className="font-display text-lg font-semibold tracking-tight text-foreground/80">Heseria</span>
      </div>
    </div>
  );
}

/** La app se compiló sin la configuración de Firebase. */
function NotConfigured() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <h1 className="font-display text-xl font-semibold">Falta conectar Heseria con Firebase</h1>
      <p className="text-sm text-muted-foreground">
        Esta versión se compiló sin la configuración del proyecto. Hay que añadirla en
        <code className="mx-1 rounded bg-muted px-1">.env.production</code> y volver a compilar.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ BootGate */

export function BootGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BootState>("starting");

  const boot = useCallback(async () => {
    setState("starting");
    const authenticated = await restoreSession();
    // Con red lenta o sin red, Firestore tarda en rendirse y la app se quedaría
    // en la pantalla de inicio. Se espera como mucho 4 s; lo que falte llega
    // después y las pantallas se actualizan solas (useDirectory).
    await Promise.race([
      Promise.all([loadDirectory(), authenticated && Promise.all([loadLibrary(), loadNotifications()])]),
      new Promise((done) => setTimeout(done, 4000)),
    ]);
    setState("ready");
    void hideSplash();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      sessionStore.set({ status: "anonymous" });
      void hideSplash();
      return;
    }
    void boot();
  }, [boot]);

  /*
   * La pantalla de apertura la retira la app, no un temporizador, para que no
   * se vea ni un parpadeo de más. Pero si el arranque se atascara, quedaría la
   * marca fija para siempre: esto lo impide.
   */
  useEffect(() => {
    const id = window.setTimeout(() => void hideSplash(), 6000);
    return () => window.clearTimeout(id);
  }, []);

  // Si la sesión se cierra desde otro lado (cuenta borrada, contraseña
  // cambiada), se vuelve al acceso.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(auth, (account) => {
      if (!account && sessionStore.get().status === "authenticated") void endSession();
    });
  }, []);

  if (!isFirebaseConfigured) return <NotConfigured />;
  if (state === "starting") return <Splash />;
  return <>{children}</>;
}

/* --------------------------------------------------------------- guardas */

/** Exige sesión. Recuerda a dónde iba para volver ahí tras entrar. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useSession();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!authenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

/**
 * Exige un permiso concreto. Las reglas de Firestore lo vuelven a comprobar en
 * cada lectura y escritura; esto solo evita enseñar una pantalla que no se va a
 * poder usar.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const { authenticated, loading, role, user } = useSession();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!authenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!can(role, permission)) return <Navigate to="/home" replace />;
  // La Fundación es solo del superadmin, también para otros administradores.
  if (location.pathname.startsWith("/admin/foundation") && !isSuperAdmin(user)) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

/**
 * Qué hay en la raíz.
 *
 * En el teléfono, la aplicación instalada **nunca** muestra la página web de
 * presentación: abre directamente en Inicio si hay sesión, o en el acceso si no
 * la hay. La portada solo tiene sentido en un navegador, para quien todavía no
 * conoce Heseria.
 */
export function RootRoute({ landing }: { landing: React.ReactNode }) {
  const { authenticated, loading, user } = useSession();
  const native = isAppShell();

  if (loading) return <Splash />;
  if (authenticated) return <Navigate to={isSuperAdmin(user) ? "/admin" : "/home"} replace />;
  if (native) return <Navigate to="/login" replace />;
  return <>{landing}</>;
}

/**
 * ¿Se está ejecutando como aplicación y no como página?
 * Cubre Capacitor (Android/iOS) y también la instalación como PWA.
 */
function isAppShell(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (capacitor?.isNativePlatform?.()) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}
