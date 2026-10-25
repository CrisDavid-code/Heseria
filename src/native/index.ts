/**
 * HESERIA — Native capability layer.
 *
 * Every native API the app will eventually use goes through this module.
 * On a device the Capacitor plugin runs; in a browser a safe web fallback runs
 * instead, so the same code works in `npm run dev` and in the packaged app.
 *
 * Anything marked TODO(backend) still needs server work — see
 * docs/native-integrations.md for exactly what Claude Code must implement.
 */
import { Capacitor } from "@capacitor/core";

export type Platform = "android" | "ios" | "web";

export const platform = (): Platform => Capacitor.getPlatform() as Platform;
export const isNative = (): boolean => Capacitor.isNativePlatform();
export const isAndroid = (): boolean => platform() === "android";
export const isIOS = (): boolean => platform() === "ios";

/* --------------------------------------------------------------- haptics */

export type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error";

/** Fires a tactile tick. No-op on web, where it would do nothing useful. */
export async function haptic(style: HapticStyle = "light"): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (style === "success" || style === "warning" || style === "error") {
      const map = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      } as const;
      await Haptics.notification({ type: map[style] });
      return;
    }
    const map = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    } as const;
    await Haptics.impact({ style: map[style] });
  } catch {
    /* plugin unavailable — silently skip */
  }
}

/* ----------------------------------------------------------------- share */

export interface SharePayload {
  title: string;
  text?: string;
  url?: string;
}

/**
 * Opens the OS share sheet on device, the Web Share API where available,
 * and falls back to copying the link to the clipboard.
 * Returns how the content was shared so the caller can show the right toast.
 */
export async function share(payload: SharePayload): Promise<"native" | "web" | "clipboard" | "failed"> {
  if (isNative()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: payload.title, text: payload.text, url: payload.url });
      return "native";
    } catch {
      /* fall through to the web paths */
    }
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(payload);
      return "web";
    } catch {
      return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(payload.url ?? payload.text ?? payload.title);
    return "clipboard";
  } catch {
    return "failed";
  }
}

/* ------------------------------------------------------ compartir imagen */

/** Convierte un Blob en base64 sin la cabecera `data:`. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Comparte una imagen por la hoja del sistema: WhatsApp, Instagram, correo, lo
 * que tenga instalado.
 *
 * En el teléfono hay que escribir el archivo antes, porque la hoja de compartir
 * necesita una ruta, no unos bytes. En el navegador se intenta la API de
 * compartir con archivos y, si no existe, se descarga.
 */
export async function shareImage(
  blob: Blob,
  options: { fileName: string; title?: string; text?: string },
): Promise<"native" | "web" | "download" | "failed"> {
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      const saved = await Filesystem.writeFile({
        path: options.fileName,
        data: await toBase64(blob),
        directory: Directory.Cache,
      });

      await Share.share({
        title: options.title,
        text: options.text,
        files: [saved.uri],
      });
      return "native";
    } catch {
      /* si algo falla, quedan las vías del navegador */
    }
  }

  const file = new File([blob], options.fileName, { type: blob.type || "image/png" });

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: options.title, text: options.text });
      return "web";
    } catch {
      return "failed";
    }
  }

  // Sin forma de compartir, al menos se guarda.
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = options.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return "download";
  } catch {
    return "failed";
  }
}

/* ------------------------------------------------------- enlaces externos */

/**
 * Abre una dirección fuera de la aplicación: PayPal, un banco, un mapa.
 *
 * En el teléfono se delega en el navegador del sistema, para que la persona vea
 * el candado y el dominio reales antes de pagar. Nunca se abre dentro del
 * WebView: pedir credenciales de un tercero dentro de nuestra app sería
 * exactamente lo que enseña a la gente a caer en fraudes.
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    // Capacitor entrega los enlaces externos al navegador del sistema, que es
    // justo lo que queremos: así se ve el dominio y el candado de verdad.
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- storage */

/**
 * Key-value storage. Uses native Preferences on device (survives app updates)
 * and localStorage on web. Both are per-device: nothing syncs until the backend
 * exists.
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (isNative()) {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        return (await Preferences.get({ key })).value;
      } catch {
        /* fall through */
      }
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (isNative()) {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.set({ key, value });
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
  async remove(key: string): Promise<void> {
    if (isNative()) {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.remove({ key });
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

/* --------------------------------------------------------------- network */

export type ConnectionStatus = { connected: boolean; type: string };

export async function getNetworkStatus(): Promise<ConnectionStatus> {
  if (isNative()) {
    try {
      const { Network } = await import("@capacitor/network");
      const s = await Network.getStatus();
      return { connected: s.connected, type: s.connectionType };
    } catch {
      /* fall through */
    }
  }
  return {
    connected: typeof navigator === "undefined" ? true : navigator.onLine,
    type: "unknown",
  };
}

/** Subscribes to connectivity changes. Returns an unsubscribe function. */
export function onNetworkChange(cb: (status: ConnectionStatus) => void): () => void {
  if (isNative()) {
    let remove: (() => void) | undefined;
    import("@capacitor/network")
      .then(async ({ Network }) => {
        const handle = await Network.addListener("networkStatusChange", (s) =>
          cb({ connected: s.connected, type: s.connectionType }),
        );
        remove = () => handle.remove();
      })
      .catch(() => undefined);
    return () => remove?.();
  }
  const online = () => cb({ connected: true, type: "unknown" });
  const offline = () => cb({ connected: false, type: "none" });
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  return () => {
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
  };
}

/* -------------------------------------------------------------- location */

export interface Coordinates {
  latitude: number;
  longitude: number;
  city?: string;
}

/**
 * Punto de partida cuando todavía no hay ubicación: el centro de la Ciudad de
 * Guatemala. No sustituye al GPS, solo evita una pantalla vacía mientras llega.
 */
export const DEFAULT_LOCATION: Coordinates = {
  latitude: 14.6349,
  longitude: -90.5069,
  city: "Ciudad de Guatemala",
};

export interface PositionResult extends Coordinates {
  /** De dónde salió: el GPS, el navegador, o el valor por defecto. */
  source: "gps" | "web" | "default";
  /** Precisión en metros, cuando el sistema la informa. */
  accuracy?: number;
  /** Por qué no se pudo usar el GPS, si es el caso. */
  reason?: "denied" | "unavailable" | "timeout";
}

/**
 * Ubicación actual, de verdad.
 *
 * En el teléfono usa el GPS y pide el permiso en el momento. En el navegador
 * usa la API de geolocalización. Si no se puede —permiso denegado, GPS apagado,
 * sin señal— devuelve el punto por defecto **diciendo que lo es**, para que la
 * pantalla pueda explicarlo en vez de mentir sobre la distancia.
 */
export async function getCurrentPosition(options?: {
  /** Espera más y gasta más batería a cambio de precisión. */
  highAccuracy?: boolean;
  timeoutMs?: number;
}): Promise<PositionResult> {
  const timeout = options?.timeoutMs ?? 10_000;
  const highAccuracy = options?.highAccuracy ?? true;

  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      let permission = await Geolocation.checkPermissions();
      if (permission.location !== "granted") {
        permission = await Geolocation.requestPermissions();
      }
      if (permission.location !== "granted") {
        return { ...DEFAULT_LOCATION, source: "default", reason: "denied" };
      }
      const pos = await Geolocation.getCurrentPosition({
        timeout,
        enableHighAccuracy: highAccuracy,
        maximumAge: 30_000,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        source: "gps",
      };
    } catch (err) {
      const message = String((err as Error)?.message ?? "").toLowerCase();
      return {
        ...DEFAULT_LOCATION,
        source: "default",
        reason: message.includes("time") ? "timeout" : "unavailable",
      };
    }
  }

  // Navegador: solo funciona en https o en localhost.
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: highAccuracy,
          timeout,
          maximumAge: 30_000,
        });
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        source: "web",
      };
    } catch (err) {
      const code = (err as GeolocationPositionError)?.code;
      return {
        ...DEFAULT_LOCATION,
        source: "default",
        reason: code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable",
      };
    }
  }

  return { ...DEFAULT_LOCATION, source: "default", reason: "unavailable" };
}

/**
 * Sigue la posición mientras la persona se mueve. Devuelve la función para
 * dejar de seguirla; hay que llamarla o el GPS sigue encendido.
 */
export async function watchPosition(
  onChange: (position: PositionResult) => void,
): Promise<() => void> {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== "granted") return () => undefined;
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15_000 },
        (pos) => {
          if (!pos) return;
          onChange({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            source: "gps",
          });
        },
      );
      return () => {
        void Geolocation.clearWatch({ id });
      };
    } catch {
      return () => undefined;
    }
  }

  if (typeof navigator !== "undefined" && navigator.geolocation) {
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        onChange({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: "web",
        }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }

  return () => undefined;
}

/* ----------------------------------------------------------------- media */

export interface PickedMedia {
  /** Displayable source: a native file URI on device, an object URL on web. */
  src: string;
  format: string;
}

/**
 * Opens the camera or the gallery.
 * TODO(backend): uploading the result needs an object store and a signed-URL
 * endpoint. Today the picked file is only shown locally.
 */
export async function pickMedia(source: "camera" | "gallery"): Promise<PickedMedia | null> {
  if (isNative()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.Uri,
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      });
      return { src: photo.webPath ?? "", format: photo.format };
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    if (source === "camera") input.capture = "environment";
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { src: URL.createObjectURL(file), format: file.type } : null);
    };
    input.click();
  });
}

/* --------------------------------------------------------- notifications */

/**
 * Pide permiso y registra el dispositivo para recibir avisos push.
 *
 * `register()` no devuelve el token: llega por el evento `registration`, así que
 * se espera a ese evento con un tope de cinco segundos. El token se guarda en el
 * servidor (`POST /api/auth/push-token`).
 *
 * Que el token quede registrado no significa que ya lleguen avisos: para eso
 * falta configurar FCM y APNs. Ver docs/push-notifications.md.
 */
export async function registerPush(): Promise<{ granted: boolean; token?: string }> {
  if (!isNative()) return { granted: false };
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") return { granted: false };

    const token = await new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), 5000);
      void PushNotifications.addListener("registration", (t) => {
        clearTimeout(timer);
        resolve(t.value);
      });
      void PushNotifications.addListener("registrationError", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
      void PushNotifications.register();
    });

    if (token) {
      const { authService } = await import("@/services");
      await authService.registerPushToken(token, platform()).catch(() => undefined);
    }
    return { granted: true, token };
  } catch {
    return { granted: false };
  }
}

/**
 * Abre la ruta que traiga la notificación al tocarla. Lo llama AppShell una vez
 * al arrancar.
 */
export async function onPushOpened(handler: (href: string) => void): Promise<void> {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const href = action.notification.data?.href;
      if (typeof href === "string" && href.startsWith("/")) handler(href);
    });
  } catch {
    /* plugin no disponible */
  }
}

/* --------------------------------------------------- avisos locales */

let localReady = false;

/**
 * Prepara los avisos locales: los que muestra el propio teléfono, sin pasar por
 * Google ni por Apple.
 *
 * Sirven mientras la app sigue viva —abierta o recién mandada a segundo plano—,
 * que es la mayor parte del tiempo de uso real. Para una app cerrada de verdad
 * hacen falta FCM y APNs; ver docs/push-notifications.md.
 */
async function prepareLocal(): Promise<boolean> {
  if (!isNative()) return false;
  if (localReady) return true;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== "granted") return false;
    }
    // Android agrupa por canal: uno propio permite sonido y color de la marca.
    if (isAndroid()) {
      await LocalNotifications.createChannel({
        id: "heseria",
        name: "Heseria",
        description: "Mensajes, avisos y novedades",
        importance: 4,
        lightColor: "#22D3EE",
        vibration: true,
      });
    }
    localReady = true;
    return true;
  } catch {
    return false;
  }
}

/** Muestra un aviso del sistema desde la propia app. */
export async function showLocalNotification(n: {
  title: string;
  body: string;
  href?: string;
}): Promise<boolean> {
  if (!(await prepareLocal())) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          // Un identificador de 32 bits; el plugin no admite cadenas.
          id: Math.floor(Math.random() * 2 ** 31),
          title: n.title,
          body: n.body,
          channelId: "heseria",
          smallIcon: "ic_stat_icon_config_sample",
          extra: { href: n.href ?? "/home" },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

const DAILY_VERSE_ID = 7001;

const DAILY_VERSE_DAYS = 60;

/**
 * El versículo del día como aviso, con su texto. Lo programa el propio teléfono
 * (sin servidor ni conexión): uno por día para los próximos 60 días, y se
 * renueva cada vez que se abre la app, así nunca se acaba.
 */
export async function scheduleDailyVerse(enabled: boolean, hour = 7): Promise<boolean> {
  if (!(await prepareLocal())) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const ids = Array.from({ length: DAILY_VERSE_DAYS }, (_, i) => ({ id: DAILY_VERSE_ID + i }));
    await LocalNotifications.cancel({ notifications: ids });
    if (!enabled) return true;
    const { verseOfTheDay } = await import("@/services/bible");
    const now = new Date();
    const notifications = [];
    for (let i = 0; i < DAILY_VERSE_DAYS; i++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, 0);
      if (at <= now) continue;
      const v = await verseOfTheDay(at);
      notifications.push({
        id: DAILY_VERSE_ID + i,
        title: `Versículo del día · ${v.ref}`,
        body: v.text,
        largeBody: v.text,
        channelId: "heseria",
        smallIcon: "ic_stat_notify",
        schedule: { at, allowWhileIdle: true },
        extra: { href: `/bible/${v.book}/${v.chapter}` },
      });
    }
    await LocalNotifications.schedule({ notifications });
    return true;
  } catch {
    return false;
  }
}

/** Tocar un aviso local abre la pantalla que lleve dentro. */
export async function onLocalNotificationOpened(
  handler: (href: string) => void,
): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      const href = action.notification.extra?.href;
      if (typeof href === "string" && href.startsWith("/")) handler(href);
    });
  } catch {
    /* plugin no disponible */
  }
}

/* ------------------------------------------------------------- status bar */

/** Keeps the OS status bar in sync with the app theme. */
export async function syncStatusBar(dark: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: dark ? "#0F1117" : "#FAFAFA" });
    }
  } catch {
    /* plugin unavailable */
  }
}

export async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* plugin unavailable */
  }
}

/* ------------------------------------------------- hardware back + links */

/**
 * Android hardware back button. `handler` returns true when it consumed the
 * event; returning false lets the app exit from the root screen.
 */
export function onHardwareBack(handler: () => boolean): () => void {
  if (!isNative()) return () => undefined;
  let remove: (() => void) | undefined;
  import("@capacitor/app")
    .then(async ({ App }) => {
      const handle = await App.addListener("backButton", () => {
        const consumed = handler();
        if (!consumed) App.exitApp();
      });
      remove = () => handle.remove();
    })
    .catch(() => undefined);
  return () => remove?.();
}

/**
 * Deep links: heseria://bible/juan/3 and https://heseria.app/... links.
 * The listener receives the full URL; the router maps it to a route.
 * See docs/deep-links.md for the scheme and the universal-link setup
 * (Android assetlinks.json / iOS apple-app-site-association) Claude Code
 * must host on the backend.
 */
export function onDeepLink(handler: (path: string) => void): () => void {
  if (!isNative()) return () => undefined;
  let remove: (() => void) | undefined;
  import("@capacitor/app")
    .then(async ({ App }) => {
      const handle = await App.addListener("appUrlOpen", ({ url }) => {
        handler(parseDeepLink(url));
      });
      remove = () => handle.remove();
    })
    .catch(() => undefined);
  return () => remove?.();
}

/** "heseria://bible/juan/3" and "https://heseria.app/bible/juan/3" -> "/bible/juan/3" */
export function parseDeepLink(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "heseria:") {
      return `/${parsed.hostname}${parsed.pathname}`.replace(/\/+/g, "/");
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/home";
  }
}

/** Builds a shareable link for any piece of content (spec §36). */
export function shareUrl(path: string): string {
  return `https://heseria.app${path.startsWith("/") ? path : `/${path}`}`;
}

/* ------------------------------------------------------ guardar archivos */

export interface SaveResult {
  /** Dónde acabó: guardado en el teléfono, bajado por el navegador, o nada. */
  where: "device" | "browser" | "failed";
  /** La ruta o el nombre, para poder decírselo a la persona. */
  detail: string;
}

/**
 * Guarda un archivo que la persona pidió descargar.
 *
 * En el teléfono se escribe en Documentos y se ofrece la hoja del sistema, que
 * es por donde se abre con la app que corresponda (un PDF con el lector, un
 * audio con el reproductor). En el navegador basta un enlace de descarga.
 *
 * Recibe los bytes ya descargados y no la URL, porque la descarga necesita la
 * sesión: el servidor no entrega el material de un curso a quien no lo cursa.
 */
export async function saveFile(
  blob: Blob,
  fileName: string,
  options: { share?: boolean } = {},
): Promise<SaveResult> {
  const safeName = fileName.replace(/[\/:*?"<>|]/g, "_").slice(0, 120) || "archivo";

  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const saved = await Filesystem.writeFile({
        path: safeName,
        data: await toBase64(blob),
        directory: Directory.Documents,
        recursive: true,
      });

      if (options.share !== false) {
        try {
          const { Share } = await import("@capacitor/share");
          await Share.share({ title: safeName, files: [saved.uri] });
        } catch {
          // Cancelar la hoja de compartir no deshace el guardado.
        }
      }
      return { where: "device", detail: safeName };
    } catch (err) {
      return { where: "failed", detail: err instanceof Error ? err.message : "" };
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { where: "browser", detail: safeName };
  } catch (err) {
    return { where: "failed", detail: err instanceof Error ? err.message : "" };
  }
}
