/**
 * HESERIA — Estados globales.
 *
 * Observables a nivel de módulo leídos con `useSyncExternalStore`: sin librería
 * de estado y sin árbol de proveedores. Cada estado persiste en su propia clave.
 *
 * Lo que pertenece a la cuenta (sesión, biblioteca, notificaciones) vive en el
 * servidor; aquí solo se guarda la copia con la que pinta la interfaz, para que
 * la app abra sin esperar a la red y las pulsaciones respondan al instante.
 */
import { useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/locales";
import type { NotificationItem, Role, Song, User } from "@/types";
import {
  authService, libraryService, notificationService, type Session,
} from "@/services";
import { mediaUrl } from "@/services/api";
import { DEFAULT_VERSION, VERSION_IDS } from "@/services/bible";
import { clearDirectory, refreshDirectory } from "@/store/directory";
import { connectRealtime, disconnectRealtime, onRealtimeEvent } from "@/services/realtime";
import { showLocalNotification } from "@/native";

function createStore<T extends object>(initial: T, persistKey?: string) {
  let state = initial;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => state,
    set(patch: Partial<T> | ((prev: T) => Partial<T>)) {
      const next = typeof patch === "function" ? (patch as (p: T) => Partial<T>)(state) : patch;
      state = { ...state, ...next };
      if (persistKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(persistKey, JSON.stringify(state));
        } catch {
          /* storage unavailable — ignore */
        }
      }
      emit();
    },
    hydrate() {
      if (!persistKey || typeof window === "undefined") return;
      try {
        const raw = window.localStorage.getItem(persistKey);
        if (raw) {
          state = { ...state, ...JSON.parse(raw) };
          emit();
        }
      } catch {
        /* corrupt payload — keep defaults */
      }
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

type Store<T extends object> = ReturnType<typeof createStore<T>>;

function useStore<T extends object, S>(store: Store<T>, select: (s: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}

/* ---------------------------------------------------------------- theme */

export type ThemeMode = "dark" | "light" | "system";

export const themeStore = createStore<{ mode: ThemeMode }>({ mode: "dark" }, "heseria.theme");

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const mode = useStore(themeStore, (s) => s.mode);
  return {
    mode,
    setMode(next: ThemeMode) {
      themeStore.set({ mode: next });
      applyTheme(next);
    },
  };
}

/** Perfil vacío para pintar antes de tener sesión. */
const ANONYMOUS: User = {
  id: "",
  firstName: "Invitada",
  lastName: "",
  name: "Invitada",
  handle: "invitada",
  email: "",
  role: "visitor",
  bio: "",
  city: "",
  country: "",
  ministries: [],
  interests: [],
  followers: 0,
  following: 0,
  joinedAt: "",
  color: "from-cyan-500/70 to-blue-700/70",
};

/* -------------------------------------------------------------- session */

export type SessionStatus = "loading" | "authenticated" | "anonymous";

export interface SessionState {
  user: User | null;
  status: SessionStatus;
  onboarded: boolean;
}

/**
 * Solo se guarda el perfil, nunca las credenciales: la sesión la guarda
 * Firebase Auth por su cuenta.
 */
export const sessionStore = createStore<SessionState>(
  { user: null, status: "loading", onboarded: false },
  "heseria.session",
);

/** Guarda la sesión recién abierta y recarga los datos de la cuenta. */
export async function startSession(session: Session): Promise<void> {
  sessionStore.set({ user: session.user, status: "authenticated" });
  connectRealtime();
  await Promise.all([refreshDirectory(), loadLibrary(), loadNotifications()]);
}

export async function endSession(): Promise<void> {
  disconnectRealtime();
  await authService.logout().catch(() => undefined);
  sessionStore.set({ user: null, status: "anonymous" });
  libraryStore.set({ saved: {} });
  notificationStore.set({ items: [], loaded: false });
  clearDirectory();
  try {
    window.localStorage.removeItem("heseria.session");
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Recupera la sesión que Firebase guardó en el teléfono. */
export async function restoreSession(): Promise<boolean> {
  try {
    const user = await authService.getCurrentUser();
    if (!user) {
      sessionStore.set({ user: null, status: "anonymous" });
      return false;
    }
    sessionStore.set({ user, status: "authenticated" });
    connectRealtime();
    return true;
  } catch {
    sessionStore.set({ user: null, status: "anonymous" });
    return false;
  }
}

export function useSession() {
  const account = useStore(sessionStore, (s) => s.user);
  const status = useStore(sessionStore, (s) => s.status);
  const onboarded = useStore(sessionStore, (s) => s.onboarded);
  // Todas las pantallas viven detrás de RequireAuth, así que `user` nunca es
  // nulo ahí dentro. `account` es el valor real para quien sí deba comprobarlo.
  const user = account ?? ANONYMOUS;

  return {
    user,
    account,
    status,
    authenticated: status === "authenticated",
    loading: status === "loading",
    onboarded,
    role: user.role as Role,
    signIn: startSession,
    signOut: endSession,
    setUser(next: User) {
      sessionStore.set({ user: next });
    },
    setOnboarded(value: boolean) {
      sessionStore.set({ onboarded: value });
    },
  };
}

/**
 * Usuario para pintar. Nunca es nulo, de modo que las pantallas no tienen que
 * comprobarlo: fuera de sesión no se llega a ellas.
 */
export function useCurrentUser(): User {
  const user = useStore(sessionStore, (s) => s.user);
  return user ?? ANONYMOUS;
}


/* --------------------------------------------------------------- player */

export interface PlayerTrack {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  durationSec: number;
  /**
   * URL de audio real. Cuando existe, un elemento <audio> conduce la
   * reproducción y el reloj simulado se aparta.
   */
  src?: string;
}

export interface PlayerState {
  queue: PlayerTrack[];
  index: number;
  playing: boolean;
  positionSec: number;
  volume: number;
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  expanded: boolean;
  liked: string[];
}

export const trackFromSong = (song: Song): PlayerTrack => ({
  id: song.id,
  title: song.title,
  subtitle: song.genre,
  color: song.color,
  durationSec: song.durationSec,
  src: song.audioUrl ? mediaUrl(song.audioUrl) : undefined,
});

export const playerStore = createStore<PlayerState>({
  queue: [],
  index: 0,
  playing: false,
  positionSec: 0,
  volume: 0.8,
  shuffle: false,
  repeat: "off",
  expanded: false,
  liked: [],
});

export function usePlayer() {
  const state = useStore(playerStore, (s) => s);
  const track = state.queue[state.index];

  return {
    ...state,
    track,
    play(tracks?: PlayerTrack[], index = 0) {
      if (tracks?.length) playerStore.set({ queue: tracks, index, positionSec: 0, playing: true });
      else playerStore.set({ playing: true });
    },
    playTrack(t: PlayerTrack) {
      const queue = playerStore.get().queue;
      const existing = queue.findIndex((x) => x.id === t.id);
      if (existing >= 0) playerStore.set({ index: existing, positionSec: 0, playing: true });
      else playerStore.set({ queue: [t, ...queue], index: 0, positionSec: 0, playing: true });
    },
    toggle() {
      playerStore.set({ playing: !playerStore.get().playing });
    },
    next() {
      const s = playerStore.get();
      if (!s.queue.length) return;
      playerStore.set({ index: (s.index + 1) % s.queue.length, positionSec: 0 });
    },
    prev() {
      const s = playerStore.get();
      if (!s.queue.length) return;
      if (s.positionSec > 4) return playerStore.set({ positionSec: 0 });
      playerStore.set({ index: (s.index - 1 + s.queue.length) % s.queue.length, positionSec: 0 });
    },
    seek(sec: number) {
      playerStore.set({ positionSec: Math.max(0, sec) });
    },
    setVolume(v: number) {
      playerStore.set({ volume: Math.min(1, Math.max(0, v)) });
    },
    toggleShuffle() {
      playerStore.set({ shuffle: !playerStore.get().shuffle });
    },
    cycleRepeat() {
      const order = ["off", "one", "all"] as const;
      playerStore.set({ repeat: order[(order.indexOf(playerStore.get().repeat) + 1) % 3] });
    },
    toggleLike(id: string) {
      const liked = playerStore.get().liked;
      playerStore.set({
        liked: liked.includes(id) ? liked.filter((x) => x !== id) : [...liked, id],
      });
    },
    isLiked(id: string) {
      return state.liked.includes(id);
    },
    setExpanded(expanded: boolean) {
      playerStore.set({ expanded });
    },
  };
}

/** Avanza la reproducción un segundo. Lo llama un único intervalo en AppShell. */
export function playerTick() {
  const s = playerStore.get();
  if (!s.playing || !s.queue.length) return;
  const current = s.queue[s.index];
  if (!current) return;
  // El audio real informa de su propia posición; no se avanza dos veces.
  if (current.src) return;
  if (s.positionSec + 1 >= current.durationSec) {
    if (s.repeat === "one") return playerStore.set({ positionSec: 0 });
    const nextIndex = s.shuffle
      ? Math.floor(Math.random() * s.queue.length)
      : (s.index + 1) % s.queue.length;
    const stops = s.repeat === "off" && !s.shuffle && nextIndex === 0;
    playerStore.set({ index: nextIndex, positionSec: 0, playing: !stops });
    return;
  }
  playerStore.set({ positionSec: s.positionSec + 1 });
}

/* -------------------------------------------------------------- library */

export type SavedKind =
  | "song" | "sermon" | "course" | "movie" | "video" | "verse"
  | "playlist" | "podcast" | "series" | "content" | "event";

export const libraryStore = createStore<{ saved: Record<string, string[]> }>({ saved: {} });

/** Lee del servidor qué tiene guardado esta cuenta. */
export async function loadLibrary(): Promise<void> {
  try {
    const saved = await libraryService.savedIds();
    libraryStore.set({ saved });
  } catch {
    /* sin conexión: se conserva lo que hubiera en memoria */
  }
}

export function useLibrary() {
  const saved = useStore(libraryStore, (s) => s.saved);
  return {
    saved,
    isSaved: (kind: SavedKind, id: string) => (saved[kind] ?? []).includes(id),
    count: (kind: SavedKind) => (saved[kind] ?? []).length,
    /**
     * Guarda o quita. Se actualiza la interfaz al momento y se confirma con el
     * servidor; si la petición falla, se deshace.
     */
    toggle(kind: SavedKind, id: string) {
      const list = saved[kind] ?? [];
      const wasSaved = list.includes(id);
      const next = wasSaved ? list.filter((x) => x !== id) : [...list, id];
      libraryStore.set({ saved: { ...saved, [kind]: next } });

      void libraryService.toggleSave(id, kind).catch(() => {
        const current = libraryStore.get().saved[kind] ?? [];
        libraryStore.set({
          saved: {
            ...libraryStore.get().saved,
            [kind]: wasSaved ? [...current, id] : current.filter((x) => x !== id),
          },
        });
      });
      return !wasSaved;
    },
  };
}

/* -------------------------------------------------------- notifications */

export const notificationStore = createStore<{ items: NotificationItem[]; loaded: boolean }>({
  items: [],
  loaded: false,
});

export async function loadNotifications(): Promise<void> {
  try {
    const items = await notificationService.list();
    notificationStore.set({ items, loaded: true });
  } catch {
    notificationStore.set({ loaded: true });
  }
}

/**
 * Lo que llega por el canal en vivo entra directo al buzón, sin volver a
 * pedirlo. Se registra una sola vez, al cargar el módulo.
 *
 * Si en ese momento la app no está a la vista, además se levanta un aviso del
 * sistema desde el propio teléfono. Eso cubre el caso más común —la app en
 * segundo plano— sin depender de Google ni de Apple.
 */
onRealtimeEvent("notification", ({ notification }) => {
  const current = notificationStore.get().items;
  if (current.some((n) => n.id === notification.id)) return;
  notificationStore.set({ items: [notification, ...current].slice(0, 100) });

  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (hidden) {
    void showLocalNotification({
      title: notification.title,
      body: notification.body,
      href: notification.href,
    });
  }
});

export function useNotifications() {
  const items = useStore(notificationStore, (s) => s.items);
  const loaded = useStore(notificationStore, (s) => s.loaded);
  return {
    items,
    loaded,
    unread: items.filter((n) => !n.read).length,
    reload: loadNotifications,
    markRead(id: string) {
      notificationStore.set({
        items: notificationStore.get().items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      });
      void notificationService.markRead(id).catch(() => undefined);
    },
    markAllRead() {
      notificationStore.set({ items: notificationStore.get().items.map((n) => ({ ...n, read: true })) });
      void notificationService.markAllRead().catch(() => undefined);
    },
  };
}

/* ---------------------------------------------------------- preferences */

export interface PreferencesState {
  /** Idioma de la interfaz. Ver `src/i18n`. */
  language: Locale;
  autoplay: boolean;
  dataSaver: boolean;
  offline: boolean;
  interests: string[];
  reduceMotion: boolean;
  bibleVersion: string;
  bibleFontScale: number;
  readingMode: boolean;
  /** Instrumental de fondo al leer la Biblia y los devocionales. */
  readingMusic: boolean;
}

export const preferencesStore = createStore<PreferencesState>(
  {
    language: "es",
    autoplay: true,
    dataSaver: false,
    offline: false,
    interests: [],
    reduceMotion: false,
    bibleVersion: DEFAULT_VERSION,
    bibleFontScale: 1,
    readingMode: false,
    readingMusic: true,
  },
  "heseria.preferences",
);

export function usePreferences() {
  const state = useStore(preferencesStore, (s) => s);
  return { ...state, set: preferencesStore.set };
}

/* -------------------------------------------------------------- messages */

export const messageDraftStore = createStore<{ drafts: Record<string, string> }>({ drafts: {} });

export function useMessageDrafts() {
  const drafts = useStore(messageDraftStore, (s) => s.drafts);
  return {
    drafts,
    get: (id: string) => drafts[id] ?? "",
    set(id: string, value: string) {
      messageDraftStore.set({ drafts: { ...messageDraftStore.get().drafts, [id]: value } });
    },
  };
}

/* ------------------------------------------------------------- bootstrap */

export function hydrateStores() {
  themeStore.hydrate();
  sessionStore.hydrate();
  preferencesStore.hydrate();
  // Una versión que ya no existe se cambia por la principal.
  if (!VERSION_IDS.includes(preferencesStore.get().bibleVersion)) {
    preferencesStore.set({ bibleVersion: DEFAULT_VERSION });
  }
  applyTheme(themeStore.get().mode);
  // El estado guardado dice quién era; solo el servidor dice si sigue siendo.
  sessionStore.set({ status: "loading" });
}
