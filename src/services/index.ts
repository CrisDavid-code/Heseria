/**
 * HESERIA — Capa de servicios sobre Firebase (Auth + Firestore).
 *
 * Contrato: Pantalla → Hook/Store → Servicio → Firebase.
 *
 * Cada dominio expone una **interfaz** y un objeto que la implementa. Las
 * interfaces son las mismas que tenía la versión con servidor propio, así que
 * las pantallas no cambiaron: cambió de dónde salen los datos. Esta es la
 * única carpeta que importa Firebase.
 *
 * Sin servidor: lo que antes validaba el backend lo imponen ahora las reglas
 * de `firestore.rules`. Las consultas están escritas para no necesitar índices
 * compuestos (filtros de igualdad u orden por un solo campo); lo demás se
 * ordena en el teléfono.
 */
import { OWNER_EMAIL } from "@/lib/permissions";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile as updateAuthProfile,
  getAuth,
  type User as AuthUser,
} from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";
import {
  addDoc,
  arrayUnion,
  deleteDoc,
  deleteField,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { auth, db } from "@/services/firebase";
import {
  AppError, col, colorFor, compressImage, fold, friendly, handleFrom, iso, list, me, ms,
  myIdOrNull, one, ref,
} from "@/services/fb";
import * as bible from "@/services/bible";
import { readFeed } from "@/services/rss";
import { isExternal, type MediaSource } from "@/lib/media-source";
import type { ContentItem, MediaKind } from "@/store/content";
import type { AutoEvent, AutoRule, Campaign, CampaignSource, SegmentId } from "@/store/broadcast";
import type {
  Album, Artist, BibleBook, BibleChapter, BibleVersion, Church, ContinueItem, Conversation,
  Course, Devotional, Donation, Event, FoundationCase, Group, ID, Message, Ministry,
  ModerationItem, Movie, NotificationItem, Plan, Playlist, Podcast, Post, PrayerRequest,
  Role, Series, Sermon, Song, User, Video, VolunteerOpportunity,
} from "@/types";

/** Rutas de archivos de la app: con Firebase ya no hay servidor que resolver. */
export const mediaUrl = (path: string | undefined | null): string => path ?? "";

const today = () => new Date().toISOString().slice(0, 10);

/* ================================================================ personas */

/** Documento de `users/{uid}` → `User`. El correo se añade aparte (es privado). */
function toUser(d: DocumentSnapshot<DocumentData>, email = ""): User | null {
  const x = d.data();
  if (!x || typeof x.firstName !== "string") return null;
  return {
    id: d.id,
    firstName: x.firstName,
    lastName: x.lastName ?? "",
    name: x.name ?? `${x.firstName} ${x.lastName ?? ""}`.trim(),
    handle: x.handle ?? d.id.slice(0, 8),
    email,
    role: (x.role ?? "user") as Role,
    bio: x.bio ?? "",
    city: x.city ?? "",
    country: x.country ?? "",
    churchId: x.churchId || undefined,
    ministries: x.ministries ?? [],
    interests: x.interests ?? [],
    followers: x.followers ?? 0,
    following: x.following ?? 0,
    joinedAt: iso(x.joinedAt),
    color: x.color ?? colorFor(d.id),
    avatarUrl: x.avatarUrl || undefined,
    coverUrl: x.hasCover ? `cover:${d.id}` : undefined,
    onboarded: x.onboarded ?? false,
    status: x.status ?? "active",
  };
}

/**
 * Se asegura de que la cuenta tenga su perfil. Pasa la primera vez que alguien
 * entra con Google: Firebase crea la cuenta, pero el perfil lo creamos aquí.
 */
async function ensureProfile(
  account: AuthUser,
  extra: { firstName?: string; lastName?: string; country?: string; city?: string; birthDate?: string } = {},
): Promise<{ user: User; created: boolean }> {
  const snap = await getDoc(ref("users", account.uid));
  if (snap.exists()) {
    // La dueña de la plataforma se vuelve administradora la primera vez que
    // entra con su correo verificado. Las reglas la reconocen por ese correo
    // (`ownerEmail()` en firestore.rules); nadie más puede hacerlo.
    if (isOwnerAccount(account) && snap.data().role !== "admin") {
      await updateDoc(ref("users", account.uid), { role: "admin" });
      return { user: toUser(await getDoc(ref("users", account.uid)), account.email ?? "")!, created: false };
    }
    return { user: toUser(snap, account.email ?? "")!, created: false };
  }

  const parts = (account.displayName ?? account.email?.split("@")[0] ?? "Usuario").trim().split(/\s+/);
  const firstName = (extra.firstName ?? parts[0] ?? "Usuario").slice(0, 60);
  const lastName = (extra.lastName ?? parts.slice(1).join(" ")).slice(0, 60);

  const batch = writeBatch(db);
  batch.set(ref("users", account.uid), {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    handle: handleFrom(firstName, lastName, account.uid),
    role: "user",
    status: "active",
    bio: "",
    city: extra.city ?? "",
    country: extra.country ?? "",
    churchId: "",
    ministries: [],
    interests: [],
    followers: 0,
    following: 0,
    color: colorFor(account.uid),
    avatarUrl: account.photoURL ?? "",
    onboarded: false,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });
  batch.set(ref(`users/${account.uid}/private`, "info"), {
    email: account.email ?? "",
    birthDate: extra.birthDate ?? "",
  });
  batch.set(ref(`users/${account.uid}/notifications`, "bienvenida"), {
    category: "comunidad",
    title: `Te damos la bienvenida, ${firstName}`,
    body: "Explora la Biblia, los planes de lectura y la comunidad desde Inicio.",
    href: "/home",
    createdAt: serverTimestamp(),
    read: false,
    from: account.uid,
  });
  await batch.commit();

  if (isOwnerAccount(account)) await updateDoc(ref("users", account.uid), { role: "admin" });
  const created = await getDoc(ref("users", account.uid));
  return { user: toUser(created, account.email ?? "")!, created: true };
}

/**
 * Cuenta de la dueña de Heseria. Debe coincidir con `ownerEmail()` de
 * firestore.rules: allí es donde de verdad se decide.
 */
const isOwnerAccount = (account: AuthUser) =>
  account.email?.toLowerCase() === OWNER_EMAIL && account.emailVerified;

/** Lo que el resto de la app conoce como «sesión». Firebase guarda los tokens solo. */
async function sessionFor(account: AuthUser, user: User): Promise<Session> {
  return { user, accessToken: await account.getIdToken(), refreshToken: "" };
}

/* ------------------------------------------------------------------ auth */

export interface Credentials {
  email: string;
  password: string;
  remember?: boolean;
}
export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  country: string;
  city: string;
  birthDate?: string;
  acceptedTerms: boolean;
}
export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}
export interface AuthProviders {
  password: boolean;
  google: { enabled: boolean; clientId?: string | null };
}
export interface AuthService {
  login(input: Credentials): Promise<Session>;
  register(input: RegisterInput): Promise<Session>;
  logout(refreshToken?: string): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  updateProfile(patch: Partial<User>): Promise<User>;
  changePassword(currentPassword: string, newPassword: string): Promise<Session>;
  /** Firebase manda el correo con el enlace para crear una contraseña nueva. */
  requestPasswordReset(email: string): Promise<{ sent: boolean; emailConfigured: boolean; code?: string }>;
  resetPassword(token: string, password: string): Promise<{ ok: boolean }>;
  registerPushToken(token: string, platform: string): Promise<{ ok: boolean }>;
  heartbeat(): Promise<{ ok: boolean }>;
  deleteAccount(): Promise<{ ok: boolean }>;
  uploadPhoto(
    kind: "avatar" | "cover",
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{ url: string; user: User }>;
  removePhoto(kind: "avatar" | "cover"): Promise<{ ok: boolean; user: User }>;
  /** Vuelve a mandar el correo de verificación. */
  resendVerification(): Promise<{ ok: boolean }>;
}

/** Lo que una persona puede cambiar de su perfil. Rol y estado no. */
const EDITABLE: (keyof User)[] = [
  "firstName", "lastName", "bio", "city", "country", "interests", "ministries", "onboarded", "churchId",
];

export const authService: AuthService = {
  login: ({ email, password }) =>
    friendly(async () => {
      const { user: account } = await signInWithEmailAndPassword(auth, email.trim(), password);
      const { user } = await ensureProfile(account);
      if (user.status === "suspended") {
        await signOut(auth);
        throw new AppError("Esta cuenta está suspendida.");
      }
      return sessionFor(account, user);
    }),

  register: (input) =>
    friendly(async () => {
      if (!input.acceptedTerms) throw new AppError("Debes aceptar los términos para continuar.");
      const firstName = input.firstName.trim();
      const lastName = input.lastName.trim();
      if (firstName.length < 2) throw new AppError("Escribe tu nombre.");
      if (lastName.length < 2) throw new AppError("Escribe tu apellido.");

      const { user: account } = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
      await updateAuthProfile(account, { displayName: `${firstName} ${lastName}` });
      const { user } = await ensureProfile(account, {
        firstName, lastName, country: input.country, city: input.city, birthDate: input.birthDate,
      });
      // El correo de verificación no bloquea: si falla, se puede reenviar.
      void sendEmailVerification(account).catch(() => undefined);
      return sessionFor(account, user);
    }),

  async logout() {
    await signOut(auth).catch(() => undefined);
  },

  async getCurrentUser() {
    await auth.authStateReady();
    const account = auth.currentUser;
    if (!account) return null;
    // Quien verificó su correo tocando el enlace vuelve a la app con un token
    // viejo que aún dice «no verificado». Se refresca para que las reglas lo vean.
    await account.reload().catch(() => undefined);
    if (account.emailVerified) {
      const token = await account.getIdTokenResult().catch(() => null);
      if (token && token.claims.email_verified !== true) await account.getIdToken(true);
    }
    const { user } = await ensureProfile(account);
    return user;
  },

  updateProfile: (patch) =>
    friendly(async () => {
      const id = me();
      const update: Record<string, unknown> = {};
      for (const key of EDITABLE) if (key in patch) update[key] = patch[key] ?? "";
      if (patch.firstName !== undefined || patch.lastName !== undefined) {
        const current = (await getDoc(ref("users", id))).data() ?? {};
        const first = String(patch.firstName ?? current.firstName ?? "").trim();
        const last = String(patch.lastName ?? current.lastName ?? "").trim();
        update.name = `${first} ${last}`.trim();
      }
      await updateDoc(ref("users", id), update);
      const snap = await getDoc(ref("users", id));
      return toUser(snap, auth.currentUser?.email ?? "")!;
    }),

  changePassword: (currentPassword, newPassword) =>
    friendly(async () => {
      const account = auth.currentUser;
      if (!account?.email) throw new AppError("Inicia sesión para continuar.");
      await reauthenticateWithCredential(account, EmailAuthProvider.credential(account.email, currentPassword));
      await updatePassword(account, newPassword);
      const { user } = await ensureProfile(account);
      return sessionFor(account, user);
    }),

  requestPasswordReset: (email) =>
    friendly(async () => {
      try {
        await sendPasswordResetEmail(auth, email.trim());
      } catch (err) {
        // No se revela si la cuenta existe: se responde igual.
        const code = (err as { code?: string }).code;
        if (code !== "auth/user-not-found") throw err;
      }
      return { sent: true, emailConfigured: true };
    }),

  async resetPassword() {
    // El cambio se hace en la página segura del enlace que manda Firebase.
    return { ok: true };
  },

  async registerPushToken() {
    // Plan gratuito: sin servidor que envíe push. Los avisos llegan a la campana.
    return { ok: true };
  },

  async heartbeat() {
    const id = myIdOrNull();
    if (id) await updateDoc(ref("users", id), { lastSeenAt: serverTimestamp() }).catch(() => undefined);
    return { ok: true };
  },

  deleteAccount: () =>
    friendly(async () => {
      const account = auth.currentUser;
      if (!account) throw new AppError("Inicia sesión para continuar.");
      await deleteDoc(ref(`users/${account.uid}/private`, "info")).catch(() => undefined);
      await deleteDoc(ref("covers", account.uid)).catch(() => undefined);
      await deleteDoc(ref("users", account.uid));
      await deleteUser(account);
      return { ok: true };
    }),

  uploadPhoto: (kind, file, onProgress) =>
    friendly(async () => {
      const id = me();
      onProgress?.(10);
      if (kind === "avatar") {
        // Pequeña a propósito: se lee cada vez que aparece tu nombre.
        const data = await compressImage(file, 192, 0.75);
        onProgress?.(70);
        await updateDoc(ref("users", id), { avatarUrl: data });
        onProgress?.(100);
        const snap = await getDoc(ref("users", id));
        return { url: data, user: toUser(snap, auth.currentUser?.email ?? "")! };
      }
      const data = await compressImage(file, 1280, 0.7);
      onProgress?.(70);
      await setDoc(ref("covers", id), { data, updatedAt: serverTimestamp() });
      await updateDoc(ref("users", id), { hasCover: true });
      onProgress?.(100);
      coverCache.set(id, data);
      const snap = await getDoc(ref("users", id));
      return { url: data, user: toUser(snap, auth.currentUser?.email ?? "")! };
    }),

  removePhoto: (kind) =>
    friendly(async () => {
      const id = me();
      if (kind === "avatar") {
        await updateDoc(ref("users", id), { avatarUrl: "" });
      } else {
        await deleteDoc(ref("covers", id));
        await updateDoc(ref("users", id), { hasCover: false });
        coverCache.delete(id);
      }
      const snap = await getDoc(ref("users", id));
      return { ok: true, user: toUser(snap, auth.currentUser?.email ?? "")! };
    }),

  resendVerification: () =>
    friendly(async () => {
      const account = auth.currentUser;
      if (account && !account.emailVerified) await sendEmailVerification(account);
      return { ok: true };
    }),
};

/* ---------------------------------------------------------- portada */

const coverCache = new Map<string, string>();

/** La foto de portada de una persona (vive aparte para no pesar en cada lectura). */
export async function coverOf(userId: string): Promise<string> {
  const hit = coverCache.get(userId);
  if (hit !== undefined) return hit;
  const snap = await getDoc(ref("covers", userId));
  const data = (snap.data()?.data as string | undefined) ?? "";
  coverCache.set(userId, data);
  return data;
}

/* ================================================================ archivos */

export type FileScope =
  | "course" | "lesson" | "group" | "church" | "message" | "event" | "ministry" | "user";

export interface StoredFile {
  id: ID;
  title: string;
  name: string;
  mime: string;
  size: number;
  scope: FileScope | null;
  scopeId: ID | null;
  visibility: "public" | "enrolled" | "members" | "private";
  ownerId: ID | null;
  createdAt: string;
  /** `fs:<id>`: se abre con `fileService.blob`. */
  viewUrl: string;
  downloadUrl: string;
}

export interface FileService {
  upload(
    file: File | Blob,
    options?: {
      scope?: FileScope;
      scopeId?: ID;
      title?: string;
      visibility?: StoredFile["visibility"];
      /** Para material de un curso: quién está matriculado lo puede abrir. */
      courseId?: ID;
      onProgress?: (percent: number) => void;
    },
  ): Promise<StoredFile>;
  /**
   * Los archivos de un curso, un grupo, una iglesia… La visibilidad va en la
   * consulta: sin ella las reglas no pueden comprobarla y la rechazan.
   */
  list(
    scope: FileScope,
    scopeId: ID,
    visibility?: StoredFile["visibility"],
    courseId?: ID,
  ): Promise<StoredFile[]>;
  get(id: ID): Promise<StoredFile>;
  remove(id: ID): Promise<{ ok: boolean }>;
  /** Reúne los trozos y devuelve el archivo. */
  blob(id: ID, onProgress?: (percent: number) => void): Promise<Blob>;
}

/**
 * Sin Storage en el plan gratuito, el archivo se guarda en trozos de base64
 * dentro de Firestore (cada documento admite 1 MB). Diez megas son unos trece
 * trozos: suficiente para un PDF, una presentación o un audio corto.
 * ponytail: tope de 10 MB; para video o archivos grandes, plan Blaze + Storage.
 */
const MAX_FILE = 10 * 1024 * 1024;
const CHUNK = 600 * 1024; // en bytes crudos; en base64 queda en ~800 KB

function toStoredFile(d: DocumentSnapshot<DocumentData>): StoredFile | null {
  const x = d.data();
  if (!x) return null;
  return {
    id: d.id,
    title: x.title || x.name,
    name: x.name,
    mime: x.mime,
    size: x.size,
    scope: x.scope ?? null,
    scopeId: x.scopeId ?? null,
    visibility: x.visibility ?? "public",
    ownerId: x.ownerId ?? null,
    createdAt: iso(x.createdAt),
    viewUrl: `fs:${d.id}`,
    downloadUrl: `fs:${d.id}`,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export const fileService: FileService = {
  upload: (file, options = {}) =>
    friendly(async () => {
      const owner = me();
      if (file.size > MAX_FILE) {
        throw new AppError("El archivo pasa de 10 MB. Comprímelo o compártelo con un enlace.");
      }
      const name = (file as File).name ?? options.title ?? "archivo";
      const fileRef = await addDoc(col("files"), {
        name: name.slice(0, 200),
        title: (options.title ?? name).slice(0, 160),
        mime: file.type || "application/octet-stream",
        size: file.size,
        scope: options.scope ?? null,
        scopeId: options.scopeId ?? null,
        courseId: options.courseId ?? (options.scope === "course" ? options.scopeId : null) ?? null,
        visibility: options.visibility ?? "public",
        ownerId: owner,
        chunks: Math.ceil(file.size / CHUNK),
        createdAt: serverTimestamp(),
      });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const total = Math.ceil(bytes.length / CHUNK);
      for (let i = 0; i < total; i++) {
        await setDoc(ref(`files/${fileRef.id}/chunks`, String(i)), {
          data: bytesToBase64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)),
        });
        options.onProgress?.(Math.round(((i + 1) / total) * 100));
      }
      return toStoredFile(await getDoc(fileRef))!;
    }),

  list: (scope, scopeId, visibility = "public", courseId) =>
    friendly(async () => {
      const filters = [
        where("scope", "==", scope),
        where("scopeId", "==", scopeId),
        where("visibility", "==", visibility),
        ...(visibility === "enrolled" ? [where("courseId", "==", courseId ?? scopeId)] : []),
      ];
      const items = await list(query(col("files"), ...filters), toStoredFile)
        .catch(() => [] as StoredFile[]); // lo que no puede ver, no se lista
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }),

  get: (id) =>
    friendly(async () => {
      const f = await one("files", id, toStoredFile);
      if (!f) throw new AppError("Ese archivo ya no está.");
      return f;
    }),

  remove: (id) =>
    friendly(async () => {
      const snap = await getDoc(ref("files", id));
      const chunks = Number(snap.data()?.chunks ?? 0);
      for (let i = 0; i < chunks; i++) await deleteDoc(ref(`files/${id}/chunks`, String(i)));
      await deleteDoc(ref("files", id));
      return { ok: true };
    }),

  blob: (id, onProgress) =>
    friendly(async () => {
      const snap = await getDoc(ref("files", id));
      const meta = snap.data();
      if (!meta) throw new AppError("Ese archivo ya no está.");
      const parts: BlobPart[] = [];
      for (let i = 0; i < meta.chunks; i++) {
        const chunk = await getDoc(ref(`files/${id}/chunks`, String(i)));
        const binary = atob(String(chunk.data()?.data ?? ""));
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        parts.push(bytes);
        onProgress?.(Math.round(((i + 1) / meta.chunks) * 100));
      }
      return new Blob(parts, { type: meta.mime });
    }),
};

/* ======================================================== podcasts (RSS) */

export interface PodcastFeed {
  id: ID;
  feedUrl: string;
  title: string;
  author: string;
  description: string;
  language: string;
  link: string;
  image: string;
  categories: string[];
  color: string;
  episodes: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  addedBy: ID | null;
}

export interface PodcastEpisode {
  id: ID;
  feedId: ID;
  showTitle: string;
  showImage: string;
  color: string;
  title: string;
  description: string;
  durationSec: number;
  sizeBytes: number;
  publishedAt: string;
  episodeNumber: number | null;
  season: number | null;
  image: string;
  mime: string;
  /** El MP3 en el servidor de quien publica. Se reproduce directo. */
  audioUrl: string;
  sourceUrl: string;
}

export interface PodcastFeedService {
  list(): Promise<PodcastFeed[]>;
  get(id: ID, limit?: number): Promise<PodcastFeed & { items: PodcastEpisode[] }>;
  latest(limit?: number): Promise<PodcastEpisode[]>;
  episode(id: ID): Promise<PodcastEpisode>;
  subscribe(feedUrl: string): Promise<{ feed: PodcastFeed; added: number; total: number }>;
  sync(id: ID): Promise<{ feed: PodcastFeed; added: number; total: number }>;
  remove(id: ID): Promise<{ ok: boolean }>;
}

function toFeed(d: DocumentSnapshot<DocumentData>): PodcastFeed | null {
  const x = d.data();
  if (!x || !x.feedUrl) return null;
  return {
    id: d.id,
    feedUrl: x.feedUrl,
    title: x.title ?? "",
    author: x.author ?? "",
    description: x.description ?? "",
    language: x.language ?? "",
    link: x.link ?? "",
    image: x.image ?? "",
    categories: x.categories ?? [],
    color: x.color ?? colorFor(d.id),
    episodes: x.episodes ?? 0,
    lastSyncedAt: x.lastSyncedAt ? iso(x.lastSyncedAt) : null,
    syncError: x.syncError ?? null,
    addedBy: x.addedBy ?? null,
  };
}

function toEpisode(d: DocumentSnapshot<DocumentData>): PodcastEpisode | null {
  const x = d.data();
  if (!x || !x.audioUrl) return null;
  return {
    id: d.id,
    feedId: x.feedId,
    showTitle: x.showTitle ?? "",
    showImage: x.showImage ?? "",
    color: x.color ?? colorFor(x.feedId ?? d.id),
    title: x.title ?? "",
    description: x.description ?? "",
    durationSec: x.durationSec ?? 0,
    sizeBytes: x.sizeBytes ?? 0,
    publishedAt: iso(x.publishedAt),
    episodeNumber: x.episodeNumber ?? null,
    season: x.season ?? null,
    image: x.image ?? "",
    mime: x.mime ?? "audio/mpeg",
    audioUrl: x.audioUrl,
    sourceUrl: x.audioUrl,
  };
}

/** Id estable para un episodio: el mismo guid siempre cae en el mismo documento. */
function episodeId(feedId: string, guid: string): string {
  let h = 2166136261;
  for (let i = 0; i < guid.length; i++) h = Math.imul(h ^ guid.charCodeAt(i), 16777619) >>> 0;
  return `${feedId}_${h.toString(36)}`;
}

async function syncFeedDoc(feedId: string, feedUrl: string) {
  const { show, episodes } = await readFeed(feedUrl);
  const before = (await getCountFromServer(query(col("podcastEpisodes"), where("feedId", "==", feedId)))).data().count;
  const color = colorFor(feedUrl);

  // Lotes de 400: Firestore admite 500 escrituras por lote.
  for (let i = 0; i < episodes.length; i += 400) {
    const batch = writeBatch(db);
    for (const e of episodes.slice(i, i + 400)) {
      batch.set(ref("podcastEpisodes", episodeId(feedId, e.guid)), {
        ...e,
        feedId,
        showTitle: show.title,
        showImage: show.image,
        color,
        publishedAt: Timestamp.fromDate(new Date(e.publishedAt)),
      });
    }
    await batch.commit();
  }
  const total = (await getCountFromServer(query(col("podcastEpisodes"), where("feedId", "==", feedId)))).data().count;
  await updateDoc(ref("podcastFeeds", feedId), {
    ...show,
    episodes: total,
    syncError: null,
    lastSyncedAt: serverTimestamp(),
  });
  return { added: total - before, total };
}

export const podcastFeedService: PodcastFeedService = {
  list: () =>
    friendly(async () =>
      (await list(col("podcastFeeds"), toFeed)).sort((a, b) => a.title.localeCompare(b.title)),
    ),

  get: (id, max = 50) =>
    friendly(async () => {
      const feed = await one("podcastFeeds", id, toFeed);
      if (!feed) throw new AppError("Ese podcast no existe.");
      const items = (await list(query(col("podcastEpisodes"), where("feedId", "==", id)), toEpisode))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, max);
      return { ...feed, items };
    }),

  latest: (max = 30) =>
    friendly(() =>
      list(query(col("podcastEpisodes"), orderBy("publishedAt", "desc"), limit(max)), toEpisode),
    ),

  episode: (id) =>
    friendly(async () => {
      const e = await one("podcastEpisodes", id, toEpisode);
      if (!e) throw new AppError("Ese episodio no existe.");
      return e;
    }),

  subscribe: (feedUrl) =>
    friendly(async () => {
      const uid = me();
      const url = feedUrl.trim();
      const existing = await getDocs(query(col("podcastFeeds"), where("feedUrl", "==", url)));
      if (!existing.empty) throw new AppError("Ese podcast ya está en Heseria.");
      const feedRef = await addDoc(col("podcastFeeds"), {
        feedUrl: url,
        title: "Cargando…",
        color: colorFor(url),
        addedBy: uid,
        episodes: 0,
        createdAt: serverTimestamp(),
      });
      try {
        const result = await syncFeedDoc(feedRef.id, url);
        return { feed: (await one("podcastFeeds", feedRef.id, toFeed))!, ...result };
      } catch (err) {
        // Un feed que no sirve no deja una ficha rota en el catálogo.
        await deleteDoc(feedRef).catch(() => undefined);
        throw err;
      }
    }),

  sync: (id) =>
    friendly(async () => {
      const feed = await one("podcastFeeds", id, toFeed);
      if (!feed) throw new AppError("Ese podcast ya no está.");
      try {
        const result = await syncFeedDoc(id, feed.feedUrl);
        return { feed: (await one("podcastFeeds", id, toFeed))!, ...result };
      } catch (err) {
        await updateDoc(ref("podcastFeeds", id), {
          syncError: (err as Error).message.slice(0, 300),
          lastSyncedAt: serverTimestamp(),
        }).catch(() => undefined);
        throw err;
      }
    }),

  remove: (id) =>
    friendly(async () => {
      const eps = await getDocs(query(col("podcastEpisodes"), where("feedId", "==", id)));
      for (let i = 0; i < eps.docs.length; i += 400) {
        const batch = writeBatch(db);
        eps.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(ref("podcastFeeds", id));
      return { ok: true };
    }),
};

/* ================================================================== user */

export interface UserService {
  list(): Promise<User[]>;
  get(id: ID): Promise<User | undefined>;
  updateProfile(id: ID, patch: Partial<User>): Promise<User>;
  follow(id: ID): Promise<{ following: boolean }>;
  byRole(role: Role): Promise<User[]>;
  suggested(): Promise<User[]>;
}

export const userService: UserService = {
  // ponytail: los 300 más recientes para resolver nombres; con miles de
  // cuentas conviene un perfil público reducido y búsqueda por prefijo.
  list: () =>
    friendly(() => list(query(col("users"), orderBy("joinedAt", "desc"), limit(300)), (d) => toUser(d))),
  get: (id) => friendly(() => one("users", id, (d) => toUser(d))),
  updateProfile: (_id, patch) => authService.updateProfile(patch),

  follow: (id) =>
    friendly(async () => {
      const uid = me();
      if (id === uid) throw new AppError("No puedes seguirte a ti misma.");
      const followRef = ref(`users/${uid}/following`, id);
      const already = (await getDoc(followRef)).exists();
      const batch = writeBatch(db);
      if (already) batch.delete(followRef);
      else batch.set(followRef, { at: serverTimestamp() });
      batch.update(ref("users", id), { followers: increment(already ? -1 : 1) });
      batch.update(ref("users", uid), { following: increment(already ? -1 : 1) });
      await batch.commit();
      return { following: !already };
    }),

  byRole: (role) => friendly(() => list(query(col("users"), where("role", "==", role)), (d) => toUser(d))),

  suggested: () =>
    friendly(async () => {
      const uid = myIdOrNull();
      return (await userService.list()).filter((u) => u.id !== uid).slice(0, 12);
    }),
};

/* ================================================================ church */

export interface ChurchFilters {
  city?: string;
  denomination?: string;
  language?: string;
  q?: string;
}
export interface NearbyChurches {
  located: boolean;
  total?: number;
  radiusKm?: number | null;
  churches: Church[];
}
export interface NearbyQuery {
  lat?: number;
  lng?: number;
  radius?: number;
  denomination?: string;
  limit?: number;
}
export interface ChurchService {
  list(filters?: ChurchFilters): Promise<Church[]>;
  get(id: ID): Promise<Church | undefined>;
  myChurch(): Promise<Church | null>;
  join(id: ID): Promise<{ joined: boolean }>;
  members(churchId: ID): Promise<User[]>;
  nearby(query?: NearbyQuery): Promise<NearbyChurches>;
  denominations(): Promise<string[]>;
}

function toChurch(d: DocumentSnapshot<DocumentData>): Church | null {
  const x = d.data();
  if (!x || !x.name) return null;
  return {
    id: d.id,
    name: x.name,
    denomination: x.denomination ?? "Evangélica",
    city: x.city ?? "",
    country: x.country ?? "Guatemala",
    language: x.language ?? "Español",
    description: x.description ?? "",
    members: x.members ?? 0,
    services: x.services ?? [],
    ministries: x.ministries ?? [],
    pastorId: x.pastorId ?? "",
    contact: { email: x.contact?.email ?? "", phone: x.contact?.phone ?? "", site: x.contact?.site ?? "" },
    color: x.color ?? colorFor(d.id),
    distanceKm: 0,
    lat: typeof x.lat === "number" ? x.lat : undefined,
    lng: typeof x.lng === "number" ? x.lng : undefined,
  };
}

let churchCache: Promise<Church[]> | null = null;
const allChurches = () => {
  churchCache ??= list(col("churches"), toChurch).catch((err) => {
    churchCache = null;
    throw err;
  });
  return churchCache;
};

/** Distancia en km entre dos coordenadas (haversine). */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const churchService: ChurchService = {
  list: (f = {}) =>
    friendly(async () => {
      let items = await allChurches();
      if (f.city) items = items.filter((c) => fold(c.city) === fold(f.city!));
      if (f.denomination) items = items.filter((c) => fold(c.denomination) === fold(f.denomination!));
      if (f.language) items = items.filter((c) => fold(c.language) === fold(f.language!));
      if (f.q) {
        const q = fold(f.q);
        items = items.filter((c) => fold(`${c.name} ${c.city} ${c.denomination}`).includes(q));
      }
      return items.sort((a, b) => a.name.localeCompare(b.name));
    }),

  get: (id) => friendly(() => one("churches", id, toChurch)),

  myChurch: () =>
    friendly(async () => {
      const user = await authService.getCurrentUser();
      if (!user?.churchId) return null;
      return (await one("churches", user.churchId, toChurch)) ?? null;
    }),

  join: (id) =>
    friendly(async () => {
      const uid = me();
      const memberRef = ref(`churches/${id}/members`, uid);
      const already = (await getDoc(memberRef)).exists();
      const batch = writeBatch(db);
      if (already) {
        batch.delete(memberRef);
        batch.update(ref("churches", id), { members: increment(-1) });
        batch.update(ref("users", uid), { churchId: "" });
      } else {
        batch.set(memberRef, { at: serverTimestamp() });
        batch.update(ref("churches", id), { members: increment(1) });
        batch.update(ref("users", uid), { churchId: id });
      }
      await batch.commit();
      return { joined: !already };
    }),

  members: (churchId) =>
    friendly(async () => {
      const ids = (await getDocs(col(`churches/${churchId}/members`))).docs.map((d) => d.id);
      const users = await Promise.all(ids.slice(0, 100).map((id) => one("users", id, (d) => toUser(d))));
      return users.filter((u): u is User => Boolean(u));
    }),

  nearby: (q = {}) =>
    friendly(async () => {
      let items = await allChurches();
      if (q.denomination) items = items.filter((c) => fold(c.denomination) === fold(q.denomination!));
      const max = Math.min(50, q.limit ?? 12);
      if (q.lat == null || q.lng == null) {
        return { located: false, churches: items.slice(0, max).map((c) => ({ ...c, distanceKm: null })) };
      }
      const withDistance = items
        .filter((c) => c.lat != null && c.lng != null)
        .map((c) => ({ ...c, distanceKm: Math.round(distanceKm(q.lat!, q.lng!, c.lat!, c.lng!) * 10) / 10 }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
      const near = q.radius ? withDistance.filter((c) => c.distanceKm <= q.radius!) : withDistance;
      return { located: true, total: near.length, radiusKm: q.radius ?? null, churches: near.slice(0, max) };
    }),

  denominations: () =>
    friendly(async () => [...new Set((await allChurches()).map((c) => c.denomination))].sort()),
};

/* ================================================================= bible */

export interface VerseMark {
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  color?: string;
  note?: string;
  saved: boolean;
  updatedAt?: string;
}
export interface VerseComparison {
  ref: string;
  versions: { id: string; name: string; abbreviation: string; licensed: boolean; text: string }[];
}
export interface ChapterAnalysis {
  bookName: string;
  chapter: number;
  verses: number;
  words: number;
  characters: number;
  readingMinutes: number;
  longestVerse: number;
  frequent: { word: string; count: number }[];
  popular: { verse: number; marks: number; text: string }[];
}
export interface BibleService {
  versions(): Promise<BibleVersion[]>;
  books(): Promise<BibleBook[]>;
  chapter(book: string, chapter: number, version?: string): Promise<BibleChapter>;
  search(q: string): Promise<{ ref: string; text: string }[]>;
  verseOfTheDay(): Promise<{ ref: string; text: string }>;
  marks(book?: string, chapter?: number): Promise<VerseMark[]>;
  savedVerses(): Promise<(VerseMark & { ref: string; text: string })[]>;
  mark(
    book: string,
    chapter: number,
    verse: number,
    patch: { color?: string | null; note?: string; saved?: boolean },
  ): Promise<VerseMark>;
  compare(book: string, chapter: number, verse: number): Promise<VerseComparison>;
  analysis(book: string, chapter: number): Promise<ChapterAnalysis>;
}

const markId = (book: string, ch: number, v: number) => `${book}.${ch}.${v}`;

function toMark(d: DocumentSnapshot<DocumentData>): VerseMark | null {
  const x = d.data();
  if (!x) return null;
  return {
    reference: d.id,
    book: x.book,
    chapter: x.chapter,
    verse: x.verse,
    color: x.color || undefined,
    note: x.note || undefined,
    saved: Boolean(x.saved),
    updatedAt: iso(x.updatedAt),
  };
}

export const bibleService: BibleService = {
  versions: () => bible.versions(),
  books: () => bible.books(),
  chapter: (book, n, version) => bible.chapter(book, n, version === "hsd" || !version ? bible.DEFAULT_VERSION : version),
  search: (q) => bible.search(q),
  async verseOfTheDay() {
    const v = await bible.verseOfTheDay();
    return { ref: v.ref, text: v.text };
  },

  marks: (book, n) =>
    friendly(async () => {
      const uid = myIdOrNull();
      if (!uid) return [];
      const base = col(`users/${uid}/marks`);
      const q = book && n ? query(base, where("book", "==", book), where("chapter", "==", n)) : base;
      return list(q, toMark);
    }),

  savedVerses: () =>
    friendly(async () => {
      const marks = await list(query(col(`users/${me()}/marks`), where("saved", "==", true)), toMark);
      return Promise.all(
        marks.map(async (m) => ({
          ...m,
          ref: `${await bible.bookName(m.book)} ${m.chapter}:${m.verse}`,
          text: await bible.verseText(m.book, m.chapter, m.verse),
        })),
      );
    }),

  mark: (book, n, v, patch) =>
    friendly(async () => {
      const uid = me();
      const id = markId(book, n, v);
      const markRef = ref(`users/${uid}/marks`, id);
      const before = (await getDoc(markRef)).data();
      const next = {
        book,
        chapter: n,
        verse: v,
        color: patch.color === undefined ? before?.color ?? "" : patch.color ?? "",
        note: patch.note ?? before?.note ?? "",
        saved: patch.saved ?? before?.saved ?? false,
        updatedAt: serverTimestamp(),
      };
      const empty = !next.color && !next.note && !next.saved;
      if (empty) await deleteDoc(markRef);
      else await setDoc(markRef, next);

      // Cuántas personas marcaron el versículo, para «lo que más marca la comunidad».
      const had = Boolean(before && (before.color || before.note || before.saved));
      const has = !empty;
      if (had !== has) {
        await setDoc(
          ref("verseCounts", `${book}.${n}`),
          { [String(v)]: increment(has ? 1 : -1) },
          { merge: true },
        ).catch(() => undefined);
      }
      return { reference: id, book, chapter: n, verse: v, color: next.color || undefined, note: next.note || undefined, saved: next.saved };
    }),

  compare: (book, n, v) =>
    friendly(async () => {
      const versions = await bible.versions();
      const name = await bible.bookName(book);
      const texts = await Promise.all(versions.map((ver) => bible.verseText(book, n, v, ver.id)));
      return {
        ref: `${name} ${n}:${v}`,
        versions: versions.map((ver, i) => ({
          id: ver.id,
          name: ver.name,
          abbreviation: ver.abbr,
          licensed: true,
          text: texts[i],
        })),
      };
    }),

  analysis: (book, n) =>
    friendly(async () => {
      const a = await bible.analysis(book, n);
      let popular: ChapterAnalysis["popular"] = [];
      if (myIdOrNull()) {
        const counts = (await getDoc(ref("verseCounts", `${book}.${n}`))).data() ?? {};
        popular = Object.entries(counts)
          .map(([verse, marks]) => ({ verse: Number(verse), marks: Number(marks) }))
          .filter((p) => p.marks > 0 && a.texts[p.verse - 1])
          .sort((x, y) => y.marks - x.marks)
          .slice(0, 5)
          .map((p) => ({ ...p, text: a.texts[p.verse - 1].text }));
      }
      const { texts: _texts, ...rest } = a;
      return { ...rest, popular };
    }),
};

/* ====================================== devocionales, planes y oración */

function toDevotional(d: DocumentSnapshot<DocumentData>, done = new Set<string>()): Devotional | null {
  const x = d.data();
  if (!x || !x.title) return null;
  return {
    id: d.id,
    title: x.title,
    authorId: x.authorId ?? "heseria",
    date: x.date ?? "",
    minutes: x.minutes ?? 5,
    verse: x.verse ?? { ref: "", text: "" },
    reflection: x.reflection ?? [],
    prayer: x.prayer ?? "",
    topics: x.topics ?? [],
    completed: done.has(d.id),
    color: x.color ?? colorFor(d.id),
  };
}

/** Lo que la persona ya hizo, por tipo: para pintar los «completado». */
async function historyIds(kind: string): Promise<Set<string>> {
  const uid = myIdOrNull();
  if (!uid) return new Set();
  const snap = await getDocs(query(col(`users/${uid}/history`), where("kind", "==", kind)));
  return new Set(snap.docs.filter((d) => (d.data().progress ?? 0) >= 1).map((d) => d.data().itemId as string));
}

export interface DevotionalService {
  list(): Promise<Devotional[]>;
  get(id: ID): Promise<Devotional | undefined>;
  today(): Promise<Devotional>;
  complete(id: ID): Promise<{ completed: boolean }>;
}
export const devotionalService: DevotionalService = {
  list: () =>
    friendly(async () => {
      const done = await historyIds("devotional");
      return (await list(col("devotionals"), (d) => toDevotional(d, done)))
        .sort((a, b) => a.date.localeCompare(b.date));
    }),
  get: (id) =>
    friendly(async () => one("devotionals", id, (d) => toDevotional(d, new Set())).then(async (dev) => {
      if (!dev) return dev;
      return { ...dev, completed: (await historyIds("devotional")).has(id) };
    })),
  today: () =>
    friendly(async () => {
      const all = await devotionalService.list();
      if (all.length === 0) throw new AppError("Todavía no hay devocionales.");
      // Uno por día del año, en orden: toda la comunidad lee el mismo.
      const start = new Date(new Date().getFullYear(), 0, 0);
      const day = Math.floor((Date.now() - start.getTime()) / 86400000);
      return { ...all[day % all.length], date: today() };
    }),
  complete: async (id) => {
    await libraryService.recordProgress("devotional", id, 0, 1);
    return { completed: true };
  },
};

export interface PlanService {
  list(category?: string): Promise<Plan[]>;
  get(id: ID): Promise<Plan | undefined>;
  markDay(id: ID, day: number): Promise<{ ok: boolean }>;
}

async function planDone(planId: string): Promise<number[]> {
  const uid = myIdOrNull();
  if (!uid) return [];
  return ((await getDoc(ref(`users/${uid}/planProgress`, planId))).data()?.days as number[]) ?? [];
}

function toPlan(d: DocumentSnapshot<DocumentData>, done: number[] = []): Plan | null {
  const x = d.data();
  if (!x || !Array.isArray(x.days)) return null;
  const days = (x.days as Plan["days"]).map((day) => ({ ...day, done: done.includes(day.day) }));
  return {
    id: d.id,
    title: x.title,
    category: x.category ?? "",
    description: x.description ?? "",
    days,
    participants: x.participants ?? 0,
    progress: days.length ? Math.round((done.length / days.length) * 100) : 0,
    color: x.color ?? colorFor(d.id),
  };
}

export const planService: PlanService = {
  list: (category) =>
    friendly(async () => {
      const uid = myIdOrNull();
      const progress = new Map<string, number[]>();
      if (uid) {
        for (const p of (await getDocs(col(`users/${uid}/planProgress`))).docs) {
          progress.set(p.id, p.data().days ?? []);
        }
      }
      const items = await list(col("plans"), (d) => toPlan(d, progress.get(d.id) ?? []));
      return (category ? items.filter((p) => p.category === category) : items)
        .sort((a, b) => a.days.length - b.days.length);
    }),
  get: (id) => friendly(async () => one("plans", id, (d) => toPlan(d)).then(async (p) => p && toPlanWith(p, await planDone(id)))),
  markDay: (id, day) =>
    friendly(async () => {
      const uid = me();
      const progressRef = ref(`users/${uid}/planProgress`, id);
      const first = !(await getDoc(progressRef)).exists();
      await setDoc(progressRef, { days: arrayUnion(day), updatedAt: serverTimestamp() }, { merge: true });
      if (first) await updateDoc(ref("plans", id), { participants: increment(1) }).catch(() => undefined);
      return { ok: true };
    }),
};

function toPlanWith(p: Plan, done: number[]): Plan {
  const days = p.days.map((d) => ({ ...d, done: done.includes(d.day) }));
  return { ...p, days, progress: days.length ? Math.round((done.length / days.length) * 100) : 0 };
}

export type PrayerScope = "all" | "mine" | "church" | "answered";
export interface PrayerService {
  list(scope?: PrayerScope): Promise<PrayerRequest[]>;
  get(id: ID): Promise<PrayerRequest | undefined>;
  create(input: {
    title: string;
    body: string;
    category: string;
    visibility: PrayerRequest["visibility"];
  }): Promise<PrayerRequest>;
  pray(id: ID): Promise<{ prayingCount: number }>;
  markAnswered(id: ID): Promise<{ ok: boolean }>;
}

function toPrayer(d: DocumentSnapshot<DocumentData>): PrayerRequest | null {
  const x = d.data();
  if (!x || !x.title) return null;
  return {
    id: d.id,
    authorId: x.authorId,
    title: x.title,
    body: x.body ?? "",
    category: x.category ?? "",
    visibility: x.visibility ?? "public",
    prayingCount: x.prayingCount ?? 0,
    answered: Boolean(x.answered),
    createdAt: iso(x.createdAt),
    testimony: x.testimony || undefined,
  };
}

const newest = <T extends { createdAt: string }>(items: T[]) =>
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const prayerService: PrayerService = {
  list: (scope = "all") =>
    friendly(async () => {
      const prayers = col("prayers");
      if (scope === "mine") return newest(await list(query(prayers, where("authorId", "==", me())), toPrayer));
      if (scope === "church") {
        const user = await authService.getCurrentUser();
        if (!user?.churchId) return [];
        return newest(await list(
          query(prayers, where("visibility", "==", "church"), where("churchId", "==", user.churchId)),
          toPrayer,
        ));
      }
      const base = scope === "answered"
        ? query(prayers, where("visibility", "==", "public"), where("answered", "==", true))
        : query(prayers, where("visibility", "==", "public"));
      return newest(await list(base, toPrayer)).slice(0, 100);
    }),

  get: (id) => friendly(() => one("prayers", id, toPrayer)),

  create: (input) =>
    friendly(async () => {
      const uid = me();
      const user = await authService.getCurrentUser();
      const docRef = await addDoc(col("prayers"), {
        authorId: uid,
        title: input.title.trim(),
        body: input.body.trim(),
        category: input.category,
        visibility: input.visibility,
        churchId: user?.churchId ?? "",
        prayingCount: 0,
        answered: false,
        createdAt: serverTimestamp(),
      });
      return (await one("prayers", docRef.id, toPrayer))!;
    }),

  pray: (id) =>
    friendly(async () => {
      const uid = me();
      const prayedRef = ref(`prayers/${id}/prayedBy`, uid);
      const already = (await getDoc(prayedRef)).exists();
      const batch = writeBatch(db);
      if (already) batch.delete(prayedRef);
      else batch.set(prayedRef, { at: serverTimestamp() });
      batch.update(ref("prayers", id), { prayingCount: increment(already ? -1 : 1) });
      await batch.commit();
      const prayer = await one("prayers", id, toPrayer);
      // A quien pidió le llega un aviso: alguien está orando por su petición.
      if (!already && prayer && prayer.authorId !== uid) {
        await notifyUser(prayer.authorId, {
          category: "oración",
          title: "Alguien está orando por ti",
          body: prayer.title,
          href: "/prayer",
        });
      }
      return { prayingCount: prayer?.prayingCount ?? 0 };
    }),

  markAnswered: (id) =>
    friendly(async () => {
      await updateDoc(ref("prayers", id), { answered: true });
      return { ok: true };
    }),
};

/** Deja un aviso en la campana de alguien. Lo permiten las reglas con `from`. */
export async function notifyUser(
  userId: string,
  n: { category: NotificationItem["category"]; title: string; body: string; href?: string },
): Promise<void> {
  const from = myIdOrNull();
  if (!from) return;
  await addDoc(col(`users/${userId}/notifications`), {
    category: n.category,
    title: n.title.slice(0, 140),
    body: n.body.slice(0, 400),
    href: n.href ?? "",
    createdAt: serverTimestamp(),
    read: false,
    from,
  }).catch(() => undefined);
}

/* ============================================ media de sus propios dueños */

/**
 * Música, videos, sermones, películas y series: solo lo que publica quien
 * tiene los derechos (un enlace a su YouTube, Spotify, Vimeo o un archivo).
 * No hay catálogo de terceros. Todo sale de la colección `content`.
 */
function toContent(d: DocumentSnapshot<DocumentData>): ContentItem | null {
  const x = d.data();
  if (!x || !x.title || !x.source) return null;
  return {
    id: d.id,
    kind: x.kind,
    title: x.title,
    subtitle: x.subtitle ?? "",
    description: x.description ?? "",
    category: x.category ?? "",
    durationSec: x.durationSec ?? 0,
    source: x.source as MediaSource,
    color: x.color ?? colorFor(d.id),
    status: x.status ?? "publicado",
    createdAt: iso(x.createdAt),
    ownerId: x.ownerId,
    views: x.views ?? 0,
  };
}

const published = (kind: MediaKind) =>
  friendly(async () =>
    newest(await list(
      query(col("content"), where("status", "==", "publicado"), where("kind", "==", kind)),
      toContent,
    )),
  );

const playable = (c: ContentItem): string | undefined => (c.source.url ? c.source.url : undefined);

const asSong = (c: ContentItem): Song => ({
  id: c.id, title: c.title, artistId: c.ownerId, albumId: "", durationSec: c.durationSec,
  genre: c.category || "Alabanza", plays: c.views ?? 0, color: c.color, audioUrl: playable(c),
});
const asVideo = (c: ContentItem): Video => ({
  id: c.id, title: c.title, authorId: c.ownerId, category: c.category || "General",
  description: c.description, durationSec: c.durationSec, views: c.views ?? 0,
  publishedAt: c.createdAt, color: c.color, videoUrl: playable(c),
});
const asSermon = (c: ContentItem): Sermon => ({
  id: c.id, title: c.title, preacherId: c.ownerId, churchId: "", durationSec: c.durationSec,
  description: c.description, passage: c.subtitle, topics: c.category ? [c.category] : [],
  publishedAt: c.createdAt, views: c.views ?? 0, chapters: [], color: c.color,
  videoUrl: c.source.provider.includes("video") || isExternal(c.source.provider) ? playable(c) : undefined,
  audioUrl: c.source.provider === "direct-audio" ? playable(c) : undefined,
});
const asMovie = (c: ContentItem): Movie => ({
  id: c.id, title: c.title, year: new Date(c.createdAt).getFullYear(), genre: c.category || "Familiar",
  synopsis: c.description, durationMin: Math.round(c.durationSec / 60), rating: "Todo público",
  cast: [], director: c.subtitle, color: c.color, videoUrl: playable(c),
});

export interface MusicService {
  songs(): Promise<Song[]>;
  song(id: ID): Promise<Song | undefined>;
  artists(): Promise<Artist[]>;
  artist(id: ID): Promise<Artist | undefined>;
  albums(): Promise<Album[]>;
  album(id: ID): Promise<Album | undefined>;
  playlists(): Promise<Playlist[]>;
  playlist(id: ID): Promise<Playlist | undefined>;
  songsByArtist(artistId: ID): Promise<Song[]>;
  songsByAlbum(albumId: ID): Promise<Song[]>;
  albumsByArtist(artistId: ID): Promise<Album[]>;
  newReleases(): Promise<Album[]>;
  popular(): Promise<Song[]>;
  genres(): Promise<string[]>;
}

const asAlbum = (c: ContentItem): Album => ({
  id: c.id, title: c.title, artistId: c.ownerId, year: new Date(c.createdAt).getFullYear(),
  trackIds: [], color: c.color,
});

/** Quien publicó canciones es artista, con el nombre de su perfil. */
async function artistsFrom(songs: Song[]): Promise<Artist[]> {
  const ids = [...new Set(songs.map((s) => s.artistId))];
  const users = await Promise.all(ids.map((id) => one("users", id, (d) => toUser(d))));
  return users.filter((u): u is User => Boolean(u)).map((u) => ({
    id: u.id, name: u.name, genre: songs.find((s) => s.artistId === u.id)?.genre ?? "Alabanza",
    country: u.country, bio: u.bio, monthlyListeners: songs.filter((s) => s.artistId === u.id)
      .reduce((n, s) => n + s.plays, 0), color: u.color,
  }));
}

export const musicService: MusicService = {
  songs: async () => (await published("song")).map(asSong),
  song: async (id) => (await musicService.songs()).find((s) => s.id === id),
  artists: async () => artistsFrom(await musicService.songs()),
  artist: async (id) => (await musicService.artists()).find((a) => a.id === id),
  albums: async () => (await published("album")).map(asAlbum),
  album: async (id) => (await musicService.albums()).find((a) => a.id === id),
  // ponytail: sin listas de reproducción todavía; se añaden cuando haya catálogo.
  playlists: async () => [],
  playlist: async () => undefined,
  songsByArtist: async (artistId) => (await musicService.songs()).filter((s) => s.artistId === artistId),
  songsByAlbum: async () => [],
  albumsByArtist: async (artistId) => (await musicService.albums()).filter((a) => a.artistId === artistId),
  newReleases: async () => (await musicService.albums()).slice(0, 12),
  popular: async () => [...(await musicService.songs())].sort((a, b) => b.plays - a.plays).slice(0, 20),
  genres: async () => [...new Set((await musicService.songs()).map((s) => s.genre))],
};

/** Los podcasts del catálogo son los programas suscritos por RSS. */
export interface PodcastService {
  list(): Promise<Podcast[]>;
  get(id: ID): Promise<Podcast | undefined>;
  categories(): Promise<string[]>;
}
export const podcastService: PodcastService = {
  list: async () =>
    (await podcastFeedService.list()).map((f) => ({
      id: f.id, title: f.title, host: f.author, category: f.categories[0] ?? "Fe",
      description: f.description, episodes: [], color: f.color,
    })),
  get: async (id) => {
    const f = await podcastFeedService.get(id, 100).catch(() => undefined);
    if (!f) return undefined;
    return {
      id: f.id, title: f.title, host: f.author, category: f.categories[0] ?? "Fe",
      description: f.description, color: f.color,
      episodes: f.items.map((e) => ({
        id: e.id, title: e.title, description: e.description, durationSec: e.durationSec,
        publishedAt: e.publishedAt, audioUrl: e.audioUrl,
      })),
    };
  },
  categories: async () => [...new Set((await podcastService.list()).map((p) => p.category))],
};

export interface SermonService {
  list(): Promise<Sermon[]>;
  get(id: ID): Promise<Sermon | undefined>;
  related(id: ID): Promise<Sermon[]>;
  byChurch(churchId: ID): Promise<Sermon[]>;
}
export const sermonService: SermonService = {
  list: async () => (await published("sermon")).map(asSermon),
  get: async (id) => (await sermonService.list()).find((s) => s.id === id),
  related: async (id) => (await sermonService.list()).filter((s) => s.id !== id).slice(0, 6),
  byChurch: async () => [],
};

export interface VideoService {
  list(category?: string): Promise<Video[]>;
  get(id: ID): Promise<Video | undefined>;
  categories(): Promise<string[]>;
}
export const videoService: VideoService = {
  list: async (category) => {
    const items = (await published("video")).map(asVideo);
    return category ? items.filter((v) => v.category === category) : items;
  },
  get: async (id) => (await videoService.list()).find((v) => v.id === id),
  categories: async () => [...new Set((await videoService.list()).map((v) => v.category))],
};

export interface MovieService {
  list(genre?: string): Promise<Movie[]>;
  get(id: ID): Promise<Movie | undefined>;
  featured(): Promise<Movie | undefined>;
  genres(): Promise<string[]>;
}
export const movieService: MovieService = {
  list: async (genre) => {
    const items = (await published("movie")).map(asMovie);
    return genre ? items.filter((m) => m.genre === genre) : items;
  },
  get: async (id) => (await movieService.list()).find((m) => m.id === id),
  featured: async () => (await movieService.list())[0],
  genres: async () => [...new Set((await movieService.list()).map((m) => m.genre))],
};

export interface SeriesService {
  list(): Promise<Series[]>;
  get(id: ID): Promise<Series | undefined>;
}
export const seriesService: SeriesService = {
  list: async () =>
    (await published("series")).map((c) => ({
      id: c.id, title: c.title, year: new Date(c.createdAt).getFullYear(), genre: c.category || "Familiar",
      synopsis: c.description, rating: "Todo público", color: c.color,
      seasons: [{ number: 1, episodes: [{ id: c.id, number: 1, title: c.title, durationMin: Math.round(c.durationSec / 60), synopsis: c.description, videoUrl: playable(c) }] }],
    })),
  get: async (id) => (await seriesService.list()).find((s) => s.id === id),
};

/* =============================================================== academy */

export interface CourseFilters {
  category?: string;
  level?: string;
  modality?: string;
  q?: string;
}
export interface CourseProgress {
  enrolled: boolean;
  completedLessons: ID[];
  progress: number;
}
export interface CourseService {
  list(filters?: CourseFilters): Promise<Course[]>;
  get(id: ID): Promise<Course | undefined>;
  enroll(id: ID): Promise<{ enrolled: boolean }>;
  myCourses(): Promise<Course[]>;
  byInstructor(id: ID): Promise<Course[]>;
  progress(id: ID): Promise<CourseProgress>;
  completeLesson(courseId: ID, lessonId: ID): Promise<{ progress: number }>;
  save(course: Partial<Course>): Promise<{ id: ID }>;
  categories(): Promise<string[]>;
  /** La nota que la persona escribió en una lección. */
  note(courseId: ID, lessonId: ID): Promise<string>;
  saveNote(courseId: ID, lessonId: ID, text: string): Promise<{ ok: boolean }>;
}

function toCourse(d: DocumentSnapshot<DocumentData>, completed: string[] = []): Course | null {
  const x = d.data();
  if (!x || !x.title || !Array.isArray(x.modules)) return null;
  const modules = (x.modules as Course["modules"]).map((m) => ({
    ...m,
    lessons: m.lessons.map((l) => ({ ...l, completed: completed.includes(l.id) })),
  }));
  const total = modules.reduce((n, m) => n + m.lessons.length, 0);
  return {
    id: d.id,
    title: x.title,
    instructorId: x.instructorId ?? "heseria",
    category: x.category ?? "Biblia",
    level: x.level ?? "Inicial",
    modality: x.modality ?? "Online",
    description: x.description ?? "",
    requirements: x.requirements ?? [],
    students: x.students ?? 0,
    rating: x.rating ?? 0,
    durationHours: x.durationHours ?? 1,
    certificate: Boolean(x.certificate),
    progress: total ? Math.round((completed.length / total) * 100) : 0,
    modules,
    city: x.city,
    color: x.color ?? colorFor(d.id),
  };
}

async function enrollment(courseId: string) {
  const uid = myIdOrNull();
  if (!uid) return null;
  return (await getDoc(ref(`users/${uid}/enrollments`, courseId))).data() ?? null;
}

export const courseService: CourseService = {
  list: (f = {}) =>
    friendly(async () => {
      let items = await list(col("courses"), (d) => toCourse(d));
      if (f.category) items = items.filter((c) => c.category === f.category);
      if (f.level) items = items.filter((c) => c.level === f.level);
      if (f.modality) items = items.filter((c) => c.modality === f.modality);
      if (f.q) {
        const q = fold(f.q);
        items = items.filter((c) => fold(`${c.title} ${c.description}`).includes(q));
      }
      return items;
    }),
  get: (id) =>
    friendly(async () => {
      const e = await enrollment(id);
      return one("courses", id, (d) => toCourse(d, e?.completedLessons ?? []));
    }),
  enroll: (id) =>
    friendly(async () => {
      const uid = me();
      const enrollRef = ref(`users/${uid}/enrollments`, id);
      if ((await getDoc(enrollRef)).exists()) return { enrolled: true };
      await setDoc(enrollRef, { completedLessons: [], enrolledAt: serverTimestamp() });
      await updateDoc(ref("courses", id), { students: increment(1) }).catch(() => undefined);
      return { enrolled: true };
    }),
  myCourses: () =>
    friendly(async () => {
      const uid = myIdOrNull();
      if (!uid) return [];
      const rows = (await getDocs(col(`users/${uid}/enrollments`))).docs;
      const courses = await Promise.all(
        rows.map((r) => one("courses", r.id, (d) => toCourse(d, r.data().completedLessons ?? []))),
      );
      return courses.filter((c): c is Course => Boolean(c));
    }),
  byInstructor: (id) =>
    friendly(() => list(query(col("courses"), where("instructorId", "==", id)), (d) => toCourse(d))),
  progress: (id) =>
    friendly(async () => {
      const e = await enrollment(id);
      const course = await courseService.get(id);
      return { enrolled: Boolean(e), completedLessons: e?.completedLessons ?? [], progress: course?.progress ?? 0 };
    }),
  completeLesson: (courseId, lessonId) =>
    friendly(async () => {
      const uid = me();
      await setDoc(
        ref(`users/${uid}/enrollments`, courseId),
        { completedLessons: arrayUnion(lessonId), updatedAt: serverTimestamp() },
        { merge: true },
      );
      return { progress: (await courseService.get(courseId))?.progress ?? 0 };
    }),
  save: (course) =>
    friendly(async () => {
      const uid = me();
      const { id, progress: _p, students: _s, ...rest } = course;
      const clean = JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
      if (id) {
        await updateDoc(ref("courses", id), { ...clean, updatedAt: serverTimestamp() });
        return { id };
      }
      const created = await addDoc(col("courses"), {
        ...clean,
        instructorId: uid,
        students: 0,
        rating: 0,
        color: clean.color ?? colorFor(String(clean.title ?? uid)),
        createdAt: serverTimestamp(),
      });
      return { id: created.id };
    }),
  categories: () => friendly(async () => [...new Set((await courseService.list()).map((c) => c.category))]),
  note: async (courseId, lessonId) => ((await enrollment(courseId))?.notes?.[lessonId] as string) ?? "",
  saveNote: (courseId, lessonId, text) =>
    friendly(async () => {
      await setDoc(
        ref(`users/${me()}/enrollments`, courseId),
        { notes: { [lessonId]: text.slice(0, 5000) }, updatedAt: serverTimestamp() },
        { merge: true },
      );
      return { ok: true };
    }),
};
export const academyService = courseService;

/* ====================================================== social y comunidad */

function toPost(d: DocumentSnapshot<DocumentData>): Post | null {
  const x = d.data();
  if (!x || typeof x.body !== "string") return null;
  return {
    id: d.id,
    authorId: x.authorId,
    type: x.type ?? "texto",
    body: x.body,
    createdAt: iso(x.createdAt),
    likes: x.likes ?? 0,
    comments: [],
    commentCount: x.commentCount ?? 0,
    shares: x.shares ?? 0,
    groupId: x.groupId || undefined,
    image: x.image || undefined,
    hashtags: x.hashtags ?? [],
    color: x.color ?? colorFor(d.id),
  };
}

export interface CommunityService {
  feed(filter?: string): Promise<Post[]>;
  get(id: ID): Promise<Post | undefined>;
  create(input: {
    body: string;
    type: Post["type"];
    audience?: string;
    hashtags: string[];
    groupId?: ID;
    /** Foto ya comprimida (data URL). */
    image?: string;
  }): Promise<Post>;
  like(id: ID): Promise<{ likes: number; liked: boolean }>;
  comment(id: ID, body: string): Promise<{ ok: boolean }>;
  report(id: ID, reason: string): Promise<{ ok: boolean }>;
  remove(id: ID): Promise<{ ok: boolean }>;
  byAuthor(id: ID): Promise<Post[]>;
}

export const communityService: CommunityService = {
  feed: (filter) =>
    friendly(async () => {
      let posts = await list(query(col("posts"), orderBy("createdAt", "desc"), limit(80)), toPost);
      posts = posts.filter((p) => !p.groupId); // lo de los grupos se ve dentro del grupo
      if (filter === "siguiendo") {
        const uid = me();
        const following = new Set((await getDocs(col(`users/${uid}/following`))).docs.map((d) => d.id));
        posts = posts.filter((p) => following.has(p.authorId) || p.authorId === uid);
      } else if (filter && filter !== "todos" && filter !== "para-ti") {
        posts = posts.filter((p) => p.type === filter);
      }
      return posts;
    }),

  get: (id) =>
    friendly(async () => {
      const post = await one("posts", id, toPost);
      if (!post) return undefined;
      const comments = await list(query(col(`posts/${id}/comments`), orderBy("createdAt")), (c) => {
        const x = c.data();
        return x ? { id: c.id, authorId: x.authorId, body: x.body, createdAt: iso(x.createdAt), likes: 0 } : null;
      });
      return { ...post, comments };
    }),

  create: (input) =>
    friendly(async () => {
      const docRef = await addDoc(col("posts"), {
        authorId: me(),
        type: input.type,
        body: input.body.trim(),
        hashtags: input.hashtags.slice(0, 10),
        groupId: input.groupId ?? "",
        image: input.image ?? "",
        likes: 0,
        shares: 0,
        commentCount: 0,
        color: colorFor(input.body),
        createdAt: serverTimestamp(),
      });
      return (await one("posts", docRef.id, toPost))!;
    }),

  like: (id) =>
    friendly(async () => {
      const uid = me();
      const likeRef = ref(`posts/${id}/likes`, uid);
      const liked = (await getDoc(likeRef)).exists();
      const batch = writeBatch(db);
      if (liked) batch.delete(likeRef);
      else batch.set(likeRef, { at: serverTimestamp() });
      batch.update(ref("posts", id), { likes: increment(liked ? -1 : 1) });
      await batch.commit();
      const post = await one("posts", id, toPost);
      return { likes: post?.likes ?? 0, liked: !liked };
    }),

  comment: (id, body) =>
    friendly(async () => {
      const batch = writeBatch(db);
      batch.set(ref(`posts/${id}/comments`, `${Date.now()}_${me().slice(0, 6)}`), {
        authorId: me(),
        body: body.trim(),
        createdAt: serverTimestamp(),
      });
      batch.update(ref("posts", id), { commentCount: increment(1) });
      await batch.commit();
      const post = await one("posts", id, toPost);
      if (post && post.authorId !== me()) {
        await notifyUser(post.authorId, {
          category: "comunidad",
          title: "Comentaron tu publicación",
          body: body.slice(0, 120),
          href: "/community",
        });
      }
      return { ok: true };
    }),

  report: (id, reason) =>
    friendly(async () => {
      await addDoc(col("reports"), {
        kind: "contenido",
        targetId: id,
        reportedBy: me(),
        reason: reason.slice(0, 500),
        status: "pendiente",
        createdAt: serverTimestamp(),
      });
      return { ok: true };
    }),

  remove: (id) =>
    friendly(async () => {
      await deleteDoc(ref("posts", id));
      return { ok: true };
    }),

  byAuthor: (id) =>
    friendly(async () => newest(await list(query(col("posts"), where("authorId", "==", id)), toPost))),
};

export interface GroupService {
  list(): Promise<Group[]>;
  get(id: ID): Promise<Group | undefined>;
  join(id: ID): Promise<{ joined: boolean }>;
  posts(groupId: ID): Promise<Post[]>;
  members(groupId: ID): Promise<User[]>;
  create(input: Partial<Group>): Promise<Group>;
}

async function toGroupWithMembers(d: DocumentSnapshot<DocumentData>): Promise<Group | null> {
  const x = d.data();
  if (!x || !x.name) return null;
  const members = (await getDocs(col(`groups/${d.id}/members`))).docs.map((m) => m.id);
  return {
    id: d.id,
    name: x.name,
    churchId: x.churchId ?? "",
    topic: x.topic ?? "",
    description: x.description ?? "",
    members,
    privacy: x.privacy ?? "Abierto",
    meeting: x.meeting ?? "",
    color: x.color ?? colorFor(d.id),
  };
}

export const groupService: GroupService = {
  list: () =>
    friendly(async () => {
      const snap = await getDocs(col("groups"));
      const groups = await Promise.all(snap.docs.map(toGroupWithMembers));
      return groups.filter((g): g is Group => Boolean(g));
    }),
  get: (id) =>
    friendly(async () => {
      const snap = await getDoc(ref("groups", id));
      return snap.exists() ? (await toGroupWithMembers(snap)) ?? undefined : undefined;
    }),
  join: (id) =>
    friendly(async () => {
      const uid = me();
      const memberRef = ref(`groups/${id}/members`, uid);
      const already = (await getDoc(memberRef)).exists();
      const batch = writeBatch(db);
      if (already) batch.delete(memberRef);
      else batch.set(memberRef, { at: serverTimestamp() });
      batch.update(ref("groups", id), { memberCount: increment(already ? -1 : 1) });
      await batch.commit();
      return { joined: !already };
    }),
  posts: (groupId) =>
    friendly(async () => newest(await list(query(col("posts"), where("groupId", "==", groupId)), toPost))),
  members: (groupId) =>
    friendly(async () => {
      const ids = (await getDocs(col(`groups/${groupId}/members`))).docs.map((d) => d.id);
      const users = await Promise.all(ids.map((id) => one("users", id, (d) => toUser(d))));
      return users.filter((u): u is User => Boolean(u));
    }),
  create: (input) =>
    friendly(async () => {
      const uid = me();
      const docRef = await addDoc(col("groups"), {
        name: input.name ?? "Grupo",
        churchId: input.churchId ?? "",
        topic: input.topic ?? "",
        description: input.description ?? "",
        privacy: input.privacy ?? "Abierto",
        meeting: input.meeting ?? "",
        color: colorFor(input.name ?? uid),
        ownerId: uid,
        memberCount: 1,
        createdAt: serverTimestamp(),
      });
      await setDoc(ref(`groups/${docRef.id}/members`, uid), { at: serverTimestamp() });
      return (await groupService.get(docRef.id))!;
    }),
};

/* ============================================================= mensajería */

export interface CallSetup {
  peer: { id: ID; name: string; color: string };
  kind: "audio" | "video";
  online: boolean;
  iceServers: RTCIceServer[];
}

export interface MessageService {
  conversations(): Promise<Conversation[]>;
  conversation(id: ID): Promise<Conversation | undefined>;
  messages(conversationId: ID): Promise<Message[]>;
  send(conversationId: ID, body: string, attachmentId?: ID): Promise<Message>;
  react(messageId: ID, emoji: string): Promise<{ ok: boolean }>;
  startCall(conversationId: ID, kind: "audio" | "video"): Promise<CallSetup>;
  openWith(userId: ID): Promise<{ id: ID; created: boolean }>;
}

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export function toConversation(d: DocumentSnapshot<DocumentData>, uid: string): Conversation | null {
  const x = d.data();
  if (!x || !Array.isArray(x.members)) return null;
  const lastAt = ms(x.lastAt);
  const readAt = ms(x.readBy?.[uid] ?? 0);
  const lastFromOther = x.last?.authorId && x.last.authorId !== uid;
  return {
    id: d.id,
    kind: x.members.length > 2 ? "group" : "direct",
    title: x.title ?? "",
    // El otro primero: así las pantallas toman `participantIds[1]`… o el que no soy yo.
    participantIds: [uid, ...x.members.filter((m: string) => m !== uid)],
    lastMessageAt: iso(x.lastAt),
    unread: lastFromOther && lastAt > readAt ? Math.max(1, x.unread?.[uid] ?? 1) : 0,
    color: x.color ?? colorFor(d.id),
  };
}

export function toMessage(d: DocumentSnapshot<DocumentData>, chatId: string): Message | null {
  const x = d.data();
  if (!x) return null;
  return {
    id: d.id,
    conversationId: chatId,
    authorId: x.authorId,
    body: x.body ?? "",
    createdAt: iso(x.createdAt),
    kind: x.kind ?? "text",
    attachment: x.attachment ?? null,
    reactions: x.reactions ?? [],
  };
}

/** Dónde vive cada mensaje, para reaccionar sin tener que saber de qué chat es. */
const messageChat = new Map<string, string>();

export const messageService: MessageService = {
  conversations: () =>
    friendly(async () => {
      const uid = me();
      const items = await list(query(col("chats"), where("members", "array-contains", uid)), (d) =>
        toConversation(d, uid),
      );
      return items.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    }),

  conversation: (id) => friendly(async () => one("chats", id, (d) => toConversation(d, me()))),

  messages: (chatId) =>
    friendly(async () => {
      const items = await list(query(col(`chats/${chatId}/messages`), orderBy("createdAt")), (d) => toMessage(d, chatId));
      items.forEach((m) => messageChat.set(m.id, chatId));
      await updateDoc(ref("chats", chatId), { [`readBy.${me()}`]: serverTimestamp(), [`unread.${me()}`]: 0 })
        .catch(() => undefined);
      return items;
    }),

  send: (chatId, body, attachmentId) =>
    friendly(async () => {
      const uid = me();
      let attachment: Message["attachment"] = null;
      let kind: Message["kind"] = "text";
      if (attachmentId) {
        const f = await fileService.get(attachmentId);
        attachment = { id: f.id, title: f.title, name: f.name, mime: f.mime, size: f.size, viewUrl: f.viewUrl, downloadUrl: f.downloadUrl };
        kind = f.mime.startsWith("image/") ? "image" : f.mime.startsWith("audio/") ? "audio"
          : f.mime.startsWith("video/") ? "video" : "file";
      }
      if (!body.trim() && !attachment) throw new AppError("Escribe un mensaje.");

      const msgRef = ref(`chats/${chatId}/messages`, `${Date.now()}_${uid.slice(0, 6)}`);
      const chat = (await getDoc(ref("chats", chatId))).data();
      const others: string[] = (chat?.members ?? []).filter((m: string) => m !== uid);
      const batch = writeBatch(db);
      const message = { authorId: uid, body: body.trim(), kind, attachment, reactions: [], createdAt: serverTimestamp() };
      batch.set(msgRef, message);
      const summary: Record<string, unknown> = {
        last: { id: msgRef.id, authorId: uid, body: body.trim().slice(0, 300), kind, attachment },
        lastAt: serverTimestamp(),
        [`readBy.${uid}`]: serverTimestamp(),
        [`typing.${uid}`]: deleteField(),
      };
      for (const o of others) summary[`unread.${o}`] = increment(1);
      batch.update(ref("chats", chatId), summary);
      await batch.commit();

      // Aviso en la campana de quien recibe (las reglas exigen `from`).
      const sender = await one("users", uid, (d) => toUser(d));
      await Promise.all(others.map((o) => notifyUser(o, {
        category: "mensajes",
        title: `Nuevo mensaje de ${sender?.name ?? "alguien"}`,
        body: body.trim().slice(0, 120) || "Te envió un archivo",
        href: `/messages?c=${chatId}`,
      })));

      messageChat.set(msgRef.id, chatId);
      return toMessage(await getDoc(msgRef), chatId)!;
    }),

  react: (messageId, emoji) =>
    friendly(async () => {
      const chatId = messageChat.get(messageId);
      if (!chatId) throw new AppError("Abre la conversación para reaccionar.");
      await updateDoc(ref(`chats/${chatId}/messages`, messageId), { reactions: arrayUnion(emoji) });
      return { ok: true };
    }),

  startCall: (chatId, kind) =>
    friendly(async () => {
      const uid = me();
      const chat = (await getDoc(ref("chats", chatId))).data();
      const peerId: string | undefined = (chat?.members ?? []).find((m: string) => m !== uid);
      if (!peerId) throw new AppError("Esta conversación no tiene con quién llamar.");
      const peer = await one("users", peerId, (d) => toUser(d));
      if (!peer) throw new AppError("Esa persona ya no está en Heseria.");
      // Sin servidor, «conectada» es haber abierto la app en el último minuto y medio.
      const seen = ms((await getDoc(ref("users", peerId))).data()?.lastSeenAt ?? 0);
      return {
        peer: { id: peer.id, name: peer.name, color: peer.color },
        kind,
        online: Date.now() - seen < 90_000,
        iceServers: ICE_SERVERS,
      };
    }),

  openWith: (userId) =>
    friendly(async () => {
      const uid = me();
      if (userId === uid) throw new AppError("No puedes escribirte a ti misma.");
      // Un chat por pareja, con id fijo: no hay forma de crear dos.
      const id = [uid, userId].sort().join("_");
      const chatRef = ref("chats", id);
      const snap = await getDoc(chatRef);
      if (snap.exists()) return { id, created: false };
      const other = await one("users", userId, (d) => toUser(d));
      await setDoc(chatRef, {
        members: [uid, userId].sort(),
        title: other?.name ?? "",
        color: colorFor(id),
        lastAt: serverTimestamp(),
        readBy: {},
        unread: {},
        createdAt: serverTimestamp(),
      });
      return { id, created: true };
    }),
};

/* ================================================== eventos y ministerios */

function toEvent(d: DocumentSnapshot<DocumentData>): Event | null {
  const x = d.data();
  if (!x || !x.title) return null;
  return {
    id: d.id,
    title: x.title,
    churchId: x.churchId || undefined,
    type: x.type ?? "Culto",
    modality: x.modality ?? "Presencial",
    date: x.date ?? today(),
    time: x.time ?? "",
    city: x.city ?? "",
    venue: x.venue ?? "",
    description: x.description ?? "",
    attendees: x.attendees ?? 0,
    capacity: x.capacity ?? 0,
    color: x.color ?? colorFor(d.id),
  };
}

export interface EventService {
  list(modality?: string): Promise<Event[]>;
  get(id: ID): Promise<Event | undefined>;
  rsvp(id: ID): Promise<{ going: boolean; attendees: number }>;
  upcoming(): Promise<Event[]>;
  byChurch(churchId: ID): Promise<Event[]>;
  create(input: Partial<Event>): Promise<Event>;
}
export const eventService: EventService = {
  list: (modality) =>
    friendly(async () => {
      const items = (await list(col("events"), toEvent)).sort((a, b) => a.date.localeCompare(b.date));
      return modality ? items.filter((e) => e.modality === modality) : items;
    }),
  get: (id) => friendly(() => one("events", id, toEvent)),
  rsvp: (id) =>
    friendly(async () => {
      const uid = me();
      const rsvpRef = ref(`events/${id}/rsvps`, uid);
      const going = (await getDoc(rsvpRef)).exists();
      const batch = writeBatch(db);
      if (going) batch.delete(rsvpRef);
      else batch.set(rsvpRef, { at: serverTimestamp() });
      batch.update(ref("events", id), { attendees: increment(going ? -1 : 1) });
      await batch.commit();
      return { going: !going, attendees: (await one("events", id, toEvent))?.attendees ?? 0 };
    }),
  upcoming: async () => (await eventService.list()).filter((e) => e.date >= today()),
  byChurch: async (churchId) => (await eventService.list()).filter((e) => e.churchId === churchId),
  create: (input) =>
    friendly(async () => {
      const docRef = await addDoc(col("events"), {
        ...JSON.parse(JSON.stringify(input)),
        attendees: 0,
        color: colorFor(input.title ?? "evento"),
        ownerId: me(),
        createdAt: serverTimestamp(),
      });
      return (await one("events", docRef.id, toEvent))!;
    }),
};

export interface MinistryService {
  list(category?: string): Promise<Ministry[]>;
  get(id: ID): Promise<Ministry | undefined>;
  byChurch(churchId: ID): Promise<Ministry[]>;
}
function toMinistry(d: DocumentSnapshot<DocumentData>): Ministry | null {
  const x = d.data();
  if (!x || !x.name) return null;
  return {
    id: d.id, name: x.name, category: x.category ?? "", churchId: x.churchId ?? "",
    leaderId: x.leaderId ?? x.ownerId ?? "", description: x.description ?? "",
    members: x.members ?? 0, color: x.color ?? colorFor(d.id),
  };
}
export const ministryService: MinistryService = {
  list: (category) =>
    friendly(async () => {
      const items = await list(col("ministries"), toMinistry);
      return category ? items.filter((m) => m.category === category) : items;
    }),
  get: (id) => friendly(() => one("ministries", id, toMinistry)),
  byChurch: (churchId) => friendly(() => list(query(col("ministries"), where("churchId", "==", churchId)), toMinistry)),
};

/* ============================================ fundación (única que recauda) */

function toCase(d: DocumentSnapshot<DocumentData>): FoundationCase | null {
  const x = d.data();
  if (!x || !x.title) return null;
  return {
    id: d.id, title: x.title, category: x.category ?? "", location: x.location ?? "",
    summary: x.summary ?? "", situation: x.situation ?? "", goal: x.goal ?? 0, raised: x.raised ?? 0,
    needs: x.needs ?? [], updates: x.updates ?? [], participants: x.participants ?? 0,
    urgent: Boolean(x.urgent), color: x.color ?? colorFor(d.id),
  };
}
function toOpportunity(d: DocumentSnapshot<DocumentData>): VolunteerOpportunity | null {
  const x = d.data();
  if (!x || !x.title) return null;
  return {
    id: d.id, title: x.title, caseId: x.caseId || undefined, location: x.location ?? "",
    modality: x.modality ?? "Presencial", date: x.date ?? "", skills: x.skills ?? [],
    slots: x.slots ?? 0, taken: x.taken ?? 0, description: x.description ?? "",
    color: x.color ?? colorFor(d.id),
  };
}

export interface FoundationService {
  cases(category?: string): Promise<FoundationCase[]>;
  case(id: ID): Promise<FoundationCase | undefined>;
  featured(): Promise<FoundationCase[]>;
  volunteerOpportunities(): Promise<VolunteerOpportunity[]>;
  applyVolunteer(id: ID, message?: string): Promise<{ ok: boolean }>;
}
export const foundationService: FoundationService = {
  cases: (category) =>
    friendly(async () => {
      const items = await list(col("foundationCases"), toCase);
      return category ? items.filter((c) => c.category === category) : items;
    }),
  case: (id) => friendly(() => one("foundationCases", id, toCase)),
  featured: async () => (await foundationService.cases()).filter((c) => c.urgent).slice(0, 4),
  volunteerOpportunities: () => friendly(() => list(col("volunteer"), toOpportunity)),
  applyVolunteer: (id, message) =>
    friendly(async () => {
      const uid = me();
      await setDoc(ref("volunteerApplications", `${id}_${uid}`), {
        opportunityId: id,
        userId: uid,
        message: (message ?? "").slice(0, 1000),
        createdAt: serverTimestamp(),
      });
      await updateDoc(ref("volunteer", id), { taken: increment(1) }).catch(() => undefined);
      return { ok: true };
    }),
};

export interface PaymentMethod {
  id: string;
  type: "paypal" | "transferencia" | "mercadopago" | "enlace" | "efectivo";
  label: string;
  description: string;
}
export interface PaymentMethodConfig extends PaymentMethod {
  handle: string;
  instructions: string;
  enabled: boolean;
}
export interface DonationReceipt {
  id: ID;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  recurring: boolean;
  projectId: ID | null;
  project?: string;
  method: { id: string; type: string; label: string };
  payUrl: string | null;
  instructions: string;
  createdAt?: string;
}
export interface AdminDonation extends Omit<Donation, "status"> {
  method: string;
  status: string;
  reference: string;
  project?: string;
  donorNote?: string;
  confirmedAt?: string;
  donor: { name: string; email: string } | null;
}
export interface DonationService {
  history(): Promise<Donation[]>;
  methods(): Promise<PaymentMethod[]>;
  donate(input: {
    amount: number;
    currency?: string;
    frequency: Donation["frequency"];
    projectId: ID;
    method: string;
  }): Promise<DonationReceipt>;
  confirm(id: ID, note?: string): Promise<DonationReceipt>;
}

async function paymentMethods(): Promise<PaymentMethodConfig[]> {
  return ((await getDoc(ref("settings", "payments"))).data()?.methods as PaymentMethodConfig[]) ?? [];
}

/** El enlace o las instrucciones para hacer llegar la ofrenda con ese método. */
function payAction(m: PaymentMethodConfig, amount: number, currency: string, reference: string) {
  const clean = Number(amount).toFixed(2).replace(/\.00$/, "");
  const extra = m.instructions ? `\n\n${m.instructions}` : "";
  switch (m.type) {
    case "paypal":
      return {
        url: m.handle ? `https://www.paypal.com/paypalme/${encodeURIComponent(m.handle)}/${clean}${currency}` : null,
        instructions: `Escribe la referencia ${reference} en la nota de PayPal.${extra}`,
      };
    case "mercadopago":
    case "enlace":
      return {
        url: /^https:\/\//.test(m.handle) ? m.handle : null,
        instructions: `Monto: ${clean} ${currency}. Referencia: ${reference}.${extra}`,
      };
    case "transferencia":
      return { url: null, instructions: `${m.handle}\nMonto: ${clean} ${currency}\nReferencia: ${reference}${extra}` };
    default:
      return { url: null, instructions: `Entrega tu ofrenda con la referencia ${reference}.${extra}` };
  }
}

async function receiptFor(d: DocumentSnapshot<DocumentData>): Promise<DonationReceipt> {
  const x = d.data()!;
  const methods = await paymentMethods();
  const m = methods.find((mm) => mm.id === x.methodId) ??
    { id: x.methodId, type: "enlace", label: x.method, description: "", handle: "", instructions: "", enabled: true };
  const action = payAction(m, x.amount, x.currency, x.reference);
  return {
    id: d.id, reference: x.reference, status: x.status, amount: x.amount, currency: x.currency,
    recurring: Boolean(x.recurring), projectId: x.projectId || null, project: x.project,
    method: { id: m.id, type: m.type, label: m.label }, payUrl: action.url,
    instructions: action.instructions, createdAt: iso(x.createdAt),
  };
}

const STATUS_LABEL: Record<string, Donation["status"]> = {
  completada: "Completada", pendiente: "Pendiente", "por-verificar": "Pendiente", cancelada: "Fallida",
};

export const donationService: DonationService = {
  history: () =>
    friendly(async () =>
      newest(await list(query(col("donations"), where("donorId", "==", me())), (d) => {
        const x = d.data();
        return x ? {
          id: d.id, donorId: x.donorId, amount: x.amount, currency: x.currency,
          frequency: x.recurring ? "Mensual" : "Única", projectId: x.projectId ?? "",
          createdAt: iso(x.createdAt), status: STATUS_LABEL[x.status] ?? "Pendiente",
        } as Donation : null;
      })),
    ),
  methods: () =>
    friendly(async () =>
      (await paymentMethods()).filter((m) => m.enabled)
        .map(({ id, type, label, description }) => ({ id, type, label, description })),
    ),
  donate: (input) =>
    friendly(async () => {
      const uid = me();
      const methods = (await paymentMethods()).filter((m) => m.enabled);
      if (!methods.length) throw new AppError("Todavía no hay formas de ofrendar configuradas.");
      const method = methods.find((m) => m.id === input.method) ?? methods[0];
      // Solo un caso de la Fundación Heseria puede recibir el aporte.
      const project = input.projectId ? await one("foundationCases", input.projectId, toCase) : undefined;
      if (input.projectId && !project) throw new AppError("Ese proyecto no existe en la Fundación Heseria.");
      const docRef = ref("donations", `dn_${Date.now().toString(36)}${uid.slice(0, 4)}`);
      await setDoc(docRef, {
        donorId: uid,
        amount: input.amount,
        currency: input.currency ?? "USD",
        recurring: input.frequency !== "Única",
        projectId: input.projectId ?? "",
        project: project?.title ?? "Fondo general",
        methodId: method.id,
        method: method.label,
        status: "pendiente",
        reference: `HSR-${docRef.id.slice(-8).toUpperCase()}`,
        createdAt: serverTimestamp(),
      });
      return receiptFor(await getDoc(docRef));
    }),
  confirm: (id, note) =>
    friendly(async () => {
      await updateDoc(ref("donations", id), {
        status: "por-verificar",
        donorNote: (note ?? "").slice(0, 300),
        declaredAt: serverTimestamp(),
      });
      return receiptFor(await getDoc(ref("donations", id)));
    }),
};

export const paymentAdminService = {
  methods: () => friendly(paymentMethods),
  saveMethods: (methods: PaymentMethodConfig[]) =>
    friendly(async () => {
      await setDoc(ref("settings", "payments"), { methods, updatedAt: serverTimestamp() });
      return methods;
    }),
  donations: (status?: string) =>
    friendly(async () => {
      const rows = (await getDocs(query(col("donations"), orderBy("createdAt", "desc"), limit(300)))).docs;
      const items = await Promise.all(rows.map(async (d) => {
        const x = d.data();
        const donor = await one("users", x.donorId, (u) => toUser(u));
        return {
          id: d.id, donorId: x.donorId, amount: x.amount, currency: x.currency,
          frequency: x.recurring ? "Mensual" : "Única", projectId: x.projectId ?? "",
          createdAt: iso(x.createdAt), method: x.method, status: x.status, reference: x.reference,
          project: x.project, donorNote: x.donorNote, confirmedAt: x.confirmedAt ? iso(x.confirmedAt) : undefined,
          donor: donor ? { name: donor.name, email: "" } : null,
        } as AdminDonation;
      }));
      return status ? items.filter((i) => i.status === status) : items;
    }),
  settle: (id: ID, status: string) =>
    friendly(async () => {
      await updateDoc(ref("donations", id), {
        status,
        confirmedAt: status === "completada" ? serverTimestamp() : null,
      });
      const d = await getDoc(ref("donations", id));
      const x = d.data()!;
      if (status === "completada") {
        await notifyUser(x.donorId, {
          category: "sistema",
          title: "Recibimos tu ofrenda",
          body: `Gracias por tu ofrenda de ${x.amount} ${x.currency} (${x.reference}).`,
          href: "/foundation",
        });
      }
      return (await paymentAdminService.donations()).find((i) => i.id === id)!;
    }),
};

/* ================================== avisos, búsqueda, biblioteca, portada */

export interface NotificationService {
  list(): Promise<NotificationItem[]>;
  unreadCount(): Promise<number>;
  markRead(id: ID): Promise<{ ok: boolean }>;
  markAllRead(): Promise<{ ok: boolean }>;
}
export function toNotification(d: DocumentSnapshot<DocumentData>): NotificationItem | null {
  const x = d.data();
  if (!x || !x.title) return null;
  return {
    id: d.id, category: x.category ?? "sistema", title: x.title, body: x.body ?? "",
    createdAt: iso(x.createdAt), read: Boolean(x.read), href: x.href || undefined,
  };
}
export const notificationService: NotificationService = {
  list: () =>
    friendly(async () => {
      const uid = myIdOrNull();
      if (!uid) return [];
      return list(query(col(`users/${uid}/notifications`), orderBy("createdAt", "desc"), limit(60)), toNotification);
    }),
  unreadCount: async () => (await notificationService.list()).filter((n) => !n.read).length,
  markRead: (id) =>
    friendly(async () => {
      await updateDoc(ref(`users/${me()}/notifications`, id), { read: true });
      return { ok: true };
    }),
  markAllRead: () =>
    friendly(async () => {
      const uid = me();
      const unread = await getDocs(query(col(`users/${uid}/notifications`), where("read", "==", false)));
      const batch = writeBatch(db);
      unread.docs.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
      return { ok: true };
    }),
};

export interface PublicStats {
  churches: number;
  users: number;
  content: number;
  prayers: number;
}
export const publicService = {
  /** Cifras reales de la portada; lo que exige sesión queda en cero sin ella. */
  stats: (): Promise<PublicStats> =>
    friendly(async () => {
      const count = async (q: ReturnType<typeof query>) =>
        (await getCountFromServer(q).catch(() => null))?.data().count ?? 0;
      const [churches, plans, devotionals, episodes] = await Promise.all([
        count(query(col("churches"))),
        count(query(col("plans"))),
        count(query(col("devotionals"))),
        count(query(col("podcastEpisodes"))),
      ]);
      return { churches, users: 0, content: plans + devotionals + episodes, prayers: 0 };
    }),
};

export interface SearchResult {
  id: ID;
  title: string;
  subtitle: string;
  type: string;
  href: string;
  color: string;
}
export interface SearchService {
  global(q: string): Promise<SearchResult[]>;
  suggestions(): Promise<string[]>;
}
export const searchService: SearchService = {
  global: (q) =>
    friendly(async () => {
      const needle = fold(q.trim());
      if (needle.length < 2) return [];
      const hit = (text: string) => fold(text).includes(needle);
      const [churches, courses, devotionals, plans, feeds, songs, videos, sermons, verses] = await Promise.all([
        churchService.list().catch(() => []),
        courseService.list().catch(() => []),
        devotionalService.list().catch(() => []),
        planService.list().catch(() => []),
        podcastFeedService.list().catch(() => []),
        musicService.songs().catch(() => []),
        videoService.list().catch(() => []),
        sermonService.list().catch(() => []),
        needle.length >= 3 ? bible.search(q, 8).catch(() => []) : Promise.resolve([]),
      ]);
      const out: SearchResult[] = [
        ...churches.filter((c) => hit(`${c.name} ${c.city}`)).slice(0, 6).map((c) => ({
          id: c.id, title: c.name, subtitle: `${c.denomination} · ${c.city}`, type: "Iglesia", href: `/churches/${c.id}`, color: c.color })),
        ...courses.filter((c) => hit(c.title)).map((c) => ({
          id: c.id, title: c.title, subtitle: c.category, type: "Curso", href: `/courses/${c.id}`, color: c.color })),
        ...devotionals.filter((d) => hit(`${d.title} ${d.verse.ref}`)).map((d) => ({
          id: d.id, title: d.title, subtitle: d.verse.ref, type: "Devocional", href: `/devotionals/${d.id}`, color: d.color })),
        ...plans.filter((p) => hit(p.title)).map((p) => ({
          id: p.id, title: p.title, subtitle: `${p.days.length} días`, type: "Plan", href: `/plans/${p.id}`, color: p.color })),
        ...feeds.filter((f) => hit(`${f.title} ${f.author}`)).map((f) => ({
          id: f.id, title: f.title, subtitle: f.author, type: "Podcast", href: `/podcasts/feed/${f.id}`, color: f.color })),
        ...songs.filter((s) => hit(s.title)).map((s) => ({
          id: s.id, title: s.title, subtitle: s.genre, type: "Canción", href: `/content/${s.id}`, color: s.color })),
        ...videos.filter((v) => hit(v.title)).map((v) => ({
          id: v.id, title: v.title, subtitle: v.category, type: "Video", href: `/content/${v.id}`, color: v.color })),
        ...sermons.filter((s) => hit(s.title)).map((s) => ({
          id: s.id, title: s.title, subtitle: s.passage, type: "Sermón", href: `/content/${s.id}`, color: s.color })),
        ...verses.map((v, i) => ({
          id: `v${i}`, title: v.ref, subtitle: v.text.slice(0, 90), type: "Versículo",
          href: `/bible`, color: colorFor(v.ref) })),
      ];
      return out.slice(0, 40);
    }),
  suggestions: async () => ["Salmos", "Juan 3:16", "Oración", "Gracia", "Fe", "Esperanza", "Iglesias cerca"],
};

export interface HistoryEntry {
  id: ID;
  title: string;
  type: string;
  kind: string;
  at: string;
  progress: number;
  color: string;
}
export interface DownloadEntry {
  id: ID;
  title: string;
  type: string;
  sizeMb: number;
  color: string;
}
export interface LibraryService {
  savedIds(): Promise<Record<string, string[]>>;
  songs(): Promise<Song[]>;
  playlists(): Promise<Playlist[]>;
  sermons(): Promise<Sermon[]>;
  courses(): Promise<Course[]>;
  movies(): Promise<Movie[]>;
  videos(): Promise<Video[]>;
  verses(): Promise<{ ref: string; text: string }[]>;
  history(): Promise<HistoryEntry[]>;
  downloads(): Promise<DownloadEntry[]>;
  toggleSave(id: ID, type: string): Promise<{ saved: boolean }>;
  isSaved(id: ID, type: string): Promise<boolean>;
  download(id: ID, type: string, sizeMb: number): Promise<{ ok: boolean }>;
  removeDownload(id: ID, type: string): Promise<{ ok: boolean }>;
  recordProgress(kind: string, id: ID, positionSec: number, progress: number): Promise<void>;
}

const KIND_LABEL: Record<string, string> = {
  song: "Canción", sermon: "Sermón", video: "Video", movie: "Película", course: "Curso",
  devotional: "Devocional", plan: "Plan", podcast: "Podcast", content: "Contenido", archivo: "Archivo",
};

async function savedOf(kind: string): Promise<string[]> {
  const uid = myIdOrNull();
  if (!uid) return [];
  const snap = await getDocs(query(col(`users/${uid}/library`), where("kind", "==", kind)));
  return snap.docs.map((d) => d.data().itemId as string);
}

export const libraryService: LibraryService = {
  savedIds: () =>
    friendly(async () => {
      const uid = myIdOrNull();
      if (!uid) return {};
      const out: Record<string, string[]> = {};
      for (const d of (await getDocs(col(`users/${uid}/library`))).docs) {
        const { kind, itemId } = d.data();
        (out[kind] ??= []).push(itemId);
      }
      return out;
    }),
  songs: async () => {
    const ids = new Set(await savedOf("song"));
    return (await musicService.songs()).filter((s) => ids.has(s.id));
  },
  playlists: async () => [],
  sermons: async () => {
    const ids = new Set(await savedOf("sermon"));
    return (await sermonService.list()).filter((s) => ids.has(s.id));
  },
  courses: () => courseService.myCourses(),
  movies: async () => {
    const ids = new Set(await savedOf("movie"));
    return (await movieService.list()).filter((m) => ids.has(m.id));
  },
  videos: async () => {
    const ids = new Set(await savedOf("video"));
    return (await videoService.list()).filter((v) => ids.has(v.id));
  },
  verses: async () => (await bibleService.savedVerses()).map(({ ref: r, text }) => ({ ref: r, text })),
  history: () =>
    friendly(async () => {
      const uid = myIdOrNull();
      if (!uid) return [];
      return list(query(col(`users/${uid}/history`), orderBy("at", "desc"), limit(50)), (d) => {
        const x = d.data();
        return x ? {
          id: x.itemId, title: x.title ?? KIND_LABEL[x.kind] ?? "", type: KIND_LABEL[x.kind] ?? x.kind,
          kind: x.kind, at: iso(x.at), progress: x.progress ?? 0, color: x.color ?? colorFor(x.itemId),
        } : null;
      });
    }),
  downloads: () =>
    friendly(async () => {
      const uid = myIdOrNull();
      if (!uid) return [];
      return list(col(`users/${uid}/downloads`), (d) => {
        const x = d.data();
        return x ? { id: x.itemId, title: x.title ?? "", type: KIND_LABEL[x.kind] ?? x.kind, sizeMb: x.sizeMb ?? 0, color: colorFor(x.itemId) } : null;
      });
    }),
  toggleSave: (id, type) =>
    friendly(async () => {
      const saveRef = ref(`users/${me()}/library`, `${type}_${id}`);
      const saved = (await getDoc(saveRef)).exists();
      if (saved) await deleteDoc(saveRef);
      else await setDoc(saveRef, { kind: type, itemId: id, at: serverTimestamp() });
      return { saved: !saved };
    }),
  isSaved: async (id, type) => {
    const uid = myIdOrNull();
    if (!uid) return false;
    return (await getDoc(ref(`users/${uid}/library`, `${type}_${id}`))).exists();
  },
  download: (id, type, sizeMb) =>
    friendly(async () => {
      // Lo de YouTube o Spotify no se guarda: no es nuestro para copiarlo.
      const content = (await getDoc(ref("content", id))).data();
      if (content && isExternal(content.source?.provider)) {
        throw new AppError("Este contenido se reproduce desde su plataforma de origen y no se puede guardar sin conexión.");
      }
      await setDoc(ref(`users/${me()}/downloads`, `${type}_${id}`), {
        kind: type, itemId: id, sizeMb, title: content?.title ?? "", at: serverTimestamp(),
      });
      return { ok: true };
    }),
  removeDownload: (id, type) =>
    friendly(async () => {
      await deleteDoc(ref(`users/${me()}/downloads`, `${type}_${id}`));
      return { ok: true };
    }),
  async recordProgress(kind, id, positionSec, progress) {
    const uid = myIdOrNull();
    if (!uid) return;
    await setDoc(ref(`users/${uid}/history`, `${kind}_${id}`), {
      kind, itemId: id, positionSec, progress, at: serverTimestamp(),
    }, { merge: true }).catch(() => undefined);
  },
};

/* ============================================== métricas y moderación */

export interface Kpi {
  label: string;
  value: string;
  delta: number;
}
export interface AnalyticsService {
  kpis(scope: string): Promise<Kpi[]>;
  series(scope: string): Promise<{ label: string; value: number; secondary?: number }[]>;
  breakdown(scope: string): Promise<{ label: string; value: number }[]>;
  overview(): Promise<Record<string, number>>;
  activity(scope?: string): Promise<{ id: string; text: string; at: string }[]>;
}

const count = async (q: ReturnType<typeof query>) =>
  (await getCountFromServer(q).catch(() => null))?.data().count ?? 0;

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const analyticsService: AnalyticsService = {
  kpis: () =>
    friendly(async () => {
      const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 86400000);
      const [users, newUsers, posts, prayers, churches, content] = await Promise.all([
        count(query(col("users"))),
        count(query(col("users"), where("joinedAt", ">=", weekAgo))),
        count(query(col("posts"))),
        count(query(col("prayers"), where("visibility", "==", "public"))),
        count(query(col("churches"))),
        count(query(col("content"), where("status", "==", "publicado"))),
      ]);
      return [
        { label: "Personas", value: String(users), delta: users ? Math.round((newUsers / users) * 100) : 0 },
        { label: "Publicaciones", value: String(posts), delta: 0 },
        { label: "Peticiones de oración", value: String(prayers), delta: 0 },
        { label: "Iglesias", value: String(churches), delta: 0 },
        { label: "Contenido publicado", value: String(content), delta: 0 },
      ];
    }),
  series: () =>
    friendly(async () => {
      // Cuentas nuevas por mes en el último semestre.
      const now = new Date();
      return Promise.all(Array.from({ length: 6 }, async (_, i) => {
        const from = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
        const value = await count(query(col("users"),
          where("joinedAt", ">=", Timestamp.fromDate(from)), where("joinedAt", "<", Timestamp.fromDate(to))));
        return { label: MONTHS[from.getMonth()], value };
      }));
    }),
  breakdown: () =>
    friendly(async () => {
      const roles: [Role, string][] = [["user", "Personas"], ["pastor", "Pastores"], ["teacher", "Maestros"],
        ["artist", "Artistas"], ["leader", "Líderes"], ["admin", "Administración"]];
      const counts = await Promise.all(roles.map(([r]) => count(query(col("users"), where("role", "==", r)))));
      return roles.map(([, label], i) => ({ label, value: counts[i] })).filter((x) => x.value > 0);
    }),
  overview: () =>
    friendly(async () => {
      const [users, posts, prayers, churches, courses, plans] = await Promise.all([
        count(query(col("users"))), count(query(col("posts"))),
        count(query(col("prayers"), where("visibility", "==", "public"))), count(query(col("churches"))),
        count(query(col("courses"))), count(query(col("plans"))),
      ]);
      return { users, posts, prayers, churches, courses, plans };
    }),
  activity: () =>
    friendly(async () => {
      const [users, posts] = await Promise.all([
        list(query(col("users"), orderBy("joinedAt", "desc"), limit(5)), (d) => {
          const x = d.data();
          return x ? { id: `u_${d.id}`, text: `${x.name} se unió a Heseria`, at: iso(x.joinedAt) } : null;
        }),
        list(query(col("posts"), orderBy("createdAt", "desc"), limit(5)), (d) => {
          const x = d.data();
          return x ? { id: `p_${d.id}`, text: `Nueva publicación: ${String(x.body).slice(0, 60)}`, at: iso(x.createdAt) } : null;
        }),
      ]);
      return [...users, ...posts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
    }),
};

export interface ModerationService {
  queue(status?: ModerationItem["status"]): Promise<ModerationItem[]>;
  resolve(id: ID, status: ModerationItem["status"], action?: string): Promise<{ ok: boolean }>;
}
export const moderationService: ModerationService = {
  queue: (status) =>
    friendly(async () => {
      const items = await list(col("reports"), (d) => {
        const x = d.data();
        return x ? {
          id: d.id, kind: x.kind ?? "contenido", reportedBy: x.reportedBy, targetId: x.targetId,
          reason: x.reason, status: x.status ?? "pendiente", createdAt: iso(x.createdAt),
          preview: x.preview ?? x.reason ?? "",
        } as unknown as ModerationItem : null;
      });
      return status ? items.filter((i) => i.status === status) : items;
    }),
  resolve: (id, status, action) =>
    friendly(async () => {
      await updateDoc(ref("reports", id), { status, action: action ?? "", resolvedAt: serverTimestamp() });
      return { ok: true };
    }),
};

/* ======================================================= recomendaciones */

export interface RecommendationRow {
  title: string;
  items: { id: ID; title: string; subtitle: string; href: string; color: string }[];
}
export interface RecommendationService {
  forYou(role?: Role): Promise<RecommendationRow[]>;
  continueWatching(): Promise<ContinueItem[]>;
  continueListening(): Promise<ContinueItem[]>;
  people(): Promise<User[]>;
}
export const recommendationService: RecommendationService = {
  forYou: () =>
    friendly(async () => {
      const [plans, courses, episodes, songs] = await Promise.all([
        planService.list().catch(() => []),
        courseService.list().catch(() => []),
        podcastFeedService.latest(10).catch(() => []),
        musicService.songs().catch(() => []),
      ]);
      const rows: RecommendationRow[] = [
        { title: "Planes de lectura", items: plans.slice(0, 10).map((p) => ({ id: p.id, title: p.title, subtitle: `${p.days.length} días`, href: `/plans/${p.id}`, color: p.color })) },
        { title: "Cursos para crecer", items: courses.slice(0, 10).map((c) => ({ id: c.id, title: c.title, subtitle: c.category, href: `/courses/${c.id}`, color: c.color })) },
        { title: "Podcasts recientes", items: episodes.map((e) => ({ id: e.id, title: e.title, subtitle: e.showTitle, href: `/podcasts/feed/${e.feedId}`, color: e.color })) },
        { title: "Música recomendada", items: songs.slice(0, 10).map((s) => ({ id: s.id, title: s.title, subtitle: s.genre, href: `/content/${s.id}`, color: s.color })) },
      ];
      return rows.filter((r) => r.items.length > 0);
    }),
  continueWatching: async () => continueOf(["video", "movie", "sermon", "course"]),
  continueListening: async () => continueOf(["song", "podcast"]),
  people: () => userService.suggested(),
};

async function continueOf(kinds: string[]): Promise<ContinueItem[]> {
  const history = await libraryService.history().catch(() => []);
  return history
    .filter((h) => kinds.includes(h.kind) && h.progress > 0 && h.progress < 1)
    .slice(0, 10)
    .map((h) => ({
      id: h.id, title: h.title, subtitle: h.type, progress: Math.round(h.progress * 100),
      href: h.kind === "course" ? `/courses/${h.id}/learn` : `/content/${h.id}`, color: h.color,
    } as unknown as ContinueItem));
}

/* ================================================================ contenido */

export interface ContentInput {
  kind: MediaKind;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  durationSec: number;
  source: MediaSource;
  ownerId?: ID;
  /** Archivo propio (hasta 10 MB). Para video, un enlace a su canal. */
  file?: File;
}
export interface ContentService {
  list(kind?: MediaKind): Promise<ContentItem[]>;
  get(id: ID): Promise<ContentItem | undefined>;
  create(input: ContentInput, onProgress?: (pct: number) => void): Promise<ContentItem>;
  update(id: ID, patch: Partial<ContentItem>): Promise<ContentItem | undefined>;
  publish(id: ID): Promise<{ ok: boolean }>;
  unpublish(id: ID): Promise<{ ok: boolean }>;
  remove(id: ID): Promise<{ ok: boolean }>;
  recordView(id: ID, kind?: string, seconds?: number): Promise<{ first: boolean }>;
}

export const contentService: ContentService = {
  list: (kind) =>
    friendly(async () => {
      const uid = myIdOrNull();
      const items = await list(query(col("content"), where("status", "==", "publicado")), toContent);
      // Lo propio sin publicar también se ve, para poder editarlo.
      const mine = uid ? await list(query(col("content"), where("ownerId", "==", uid)), toContent) : [];
      const all = [...new Map([...items, ...mine].map((c) => [c.id, c])).values()];
      return newest(kind ? all.filter((c) => c.kind === kind) : all);
    }),
  get: (id) => friendly(() => one("content", id, toContent)),
  create: (input, onProgress) =>
    friendly(async () => {
      const uid = me();
      let source = input.source;
      if (input.file) {
        const stored = await fileService.upload(input.file, { title: input.title, visibility: "public", onProgress });
        source = { ...source, kind: "file", url: `fs:${stored.id}`, sizeMb: Math.round((input.file.size / 1048576) * 10) / 10 };
      } else {
        onProgress?.(100);
      }
      const docRef = await addDoc(col("content"), {
        kind: input.kind,
        title: input.title.trim(),
        subtitle: input.subtitle ?? "",
        description: input.description ?? "",
        category: input.category ?? "",
        durationSec: input.durationSec ?? 0,
        source: JSON.parse(JSON.stringify(source)),
        color: colorFor(input.title),
        status: "publicado",
        ownerId: uid,
        views: 0,
        createdAt: serverTimestamp(),
      });
      return (await one("content", docRef.id, toContent))!;
    }),
  update: (id, patch) =>
    friendly(async () => {
      const allowed: Record<string, unknown> = {};
      for (const k of ["title", "subtitle", "description", "category", "durationSec", "status"] as const) {
        if (k in patch) allowed[k] = patch[k];
      }
      await updateDoc(ref("content", id), allowed);
      return one("content", id, toContent);
    }),
  publish: (id) => friendly(async () => (await updateDoc(ref("content", id), { status: "publicado" }), { ok: true })),
  unpublish: (id) => friendly(async () => (await updateDoc(ref("content", id), { status: "borrador" }), { ok: true })),
  remove: (id) => friendly(async () => (await deleteDoc(ref("content", id)), { ok: true })),
  recordView: (id, kind = "content") =>
    friendly(async () => {
      const uid = myIdOrNull();
      if (!uid) return { first: false };
      const seenRef = ref(`users/${uid}/history`, `${kind}_${id}`);
      const first = !(await getDoc(seenRef)).exists();
      if (first) {
        await setDoc(seenRef, { kind, itemId: id, progress: 0, at: serverTimestamp() }, { merge: true });
        await updateDoc(ref("content", id), { views: increment(1) }).catch(() => undefined);
      }
      return { first };
    }),
};

/* ============================================================ avisos masivos */

export interface CampaignInput {
  title: string;
  body: string;
  segment: SegmentId;
  href?: string;
  scheduledAt?: string;
  source?: CampaignSource;
  contentId?: ID;
}
export interface Segment {
  id: SegmentId;
  label: string;
  description: string;
  size: number;
}
export interface BroadcastService {
  segments(): Promise<Segment[]>;
  campaigns(): Promise<Campaign[]>;
  campaign(id: ID): Promise<Campaign | undefined>;
  send(input: CampaignInput): Promise<Campaign>;
  sendNow(id: ID): Promise<Campaign>;
  cancel(id: ID): Promise<{ ok: boolean }>;
  remove(id: ID): Promise<{ ok: boolean }>;
  rules(): Promise<AutoRule[]>;
  toggleRule(id: string, enabled: boolean): Promise<{ ok: boolean }>;
  updateRule(id: string, patch: Partial<AutoRule>): Promise<{ ok: boolean }>;
  trigger(event: AutoEvent, vars: { titulo: string; href?: string; contentId?: ID }): Promise<null>;
}

/** Quién recibe cada segmento. Se calcula en el momento de enviar. */
async function audienceOf(segment: SegmentId): Promise<string[]> {
  const users = (await getDocs(col("users"))).docs.map((d) => ({ id: d.id, ...d.data() }) as { id: string; role?: string; lastSeenAt?: Timestamp; status?: string });
  const activeSince = Date.now() - 30 * 86400000;
  return users.filter((u) => u.status !== "suspended").filter((u) => {
    switch (segment as string) {
      case "all": return true;
      case "active": return ms(u.lastSeenAt ?? 0) >= activeSince;
      case "inactive": return ms(u.lastSeenAt ?? 0) < activeSince;
      case "leaders": return ["pastor", "leader", "youth_leader", "church_admin", "teacher"].includes(u.role ?? "");
      default: return u.role === segment;
    }
  }).map((u) => u.id);
}

function toCampaign(d: DocumentSnapshot<DocumentData>): Campaign | null {
  const x = d.data();
  if (!x || !x.title) return null;
  return { id: d.id, ...x, createdAt: iso(x.createdAt), sentAt: x.sentAt ? iso(x.sentAt) : undefined } as unknown as Campaign;
}

/**
 * Sin servidor, el reparto lo hace el teléfono de la administración: escribe
 * el aviso en la campana de cada persona del segmento, por lotes.
 * ponytail: con decenas de miles de cuentas conviene una Cloud Function (Blaze).
 */
async function deliver(campaignId: string) {
  const c = (await getDoc(ref("campaigns", campaignId))).data();
  if (!c) throw new AppError("Esa campaña ya no existe.");
  const targets = await audienceOf(c.segment);
  const from = me();
  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    for (const userId of targets.slice(i, i + 400)) {
      batch.set(ref(`users/${userId}/notifications`, `c_${campaignId}`), {
        category: "sistema", title: c.title.slice(0, 140), body: c.body.slice(0, 400),
        href: c.href ?? "", createdAt: serverTimestamp(), read: false, from,
      });
    }
    await batch.commit();
  }
  await updateDoc(ref("campaigns", campaignId), { status: "enviada", sentAt: serverTimestamp(), delivered: targets.length });
  return toCampaign(await getDoc(ref("campaigns", campaignId)))!;
}

export const broadcastService: BroadcastService = {
  segments: () =>
    friendly(async () => {
      const defs: [SegmentId, string, string][] = [
        ["all" as SegmentId, "Todas las personas", "Cada cuenta activa"],
        ["active" as SegmentId, "Activas", "Abrieron la app en los últimos 30 días"],
        ["inactive" as SegmentId, "Inactivas", "No la abren hace más de 30 días"],
        ["leaders" as SegmentId, "Liderazgo", "Pastores, líderes y maestros"],
      ];
      return Promise.all(defs.map(async ([id, label, description]) => ({
        id, label, description, size: (await audienceOf(id)).length,
      })));
    }),
  campaigns: () =>
    friendly(async () => list(query(col("campaigns"), orderBy("createdAt", "desc"), limit(100)), toCampaign)),
  campaign: (id) => friendly(() => one("campaigns", id, toCampaign)),
  send: (input) =>
    friendly(async () => {
      const docRef = await addDoc(col("campaigns"), {
        ...JSON.parse(JSON.stringify(input)),
        status: input.scheduledAt ? "programada" : "enviando",
        createdBy: me(),
        createdAt: serverTimestamp(),
      });
      if (input.scheduledAt) return toCampaign(await getDoc(docRef))!;
      return deliver(docRef.id);
    }),
  sendNow: (id) => friendly(() => deliver(id)),
  cancel: (id) => friendly(async () => (await updateDoc(ref("campaigns", id), { status: "cancelada" }), { ok: true })),
  remove: (id) => friendly(async () => (await deleteDoc(ref("campaigns", id)), { ok: true })),
  rules: () => friendly(() => list(col("autoRules"), (d) => ({ id: d.id, ...d.data() }) as unknown as AutoRule)),
  toggleRule: (id, enabled) =>
    friendly(async () => (await setDoc(ref("autoRules", id), { enabled }, { merge: true }), { ok: true })),
  updateRule: (id, patch) =>
    friendly(async () => (await setDoc(ref("autoRules", id), JSON.parse(JSON.stringify(patch)), { merge: true }), { ok: true })),
  async trigger() {
    return null;
  },
};

/* ================================================== audiencia y admin */

export interface AudienceStats {
  daily: number;
  weekly: number;
  monthly: number;
  total: number;
  sessionsToday: number;
  newThisWeek: number;
}
export interface ContentEngagement {
  viewers: User[];
  nonViewers: User[];
  viewRate: number;
  totalViews: number;
  averageSeconds: number;
}
export interface AudienceService {
  active(): Promise<AudienceStats>;
  engagement(contentId: ID): Promise<ContentEngagement>;
  retention(): Promise<{ label: string; value: number; secondary?: number }[]>;
}

const since = (days: number) => Timestamp.fromMillis(Date.now() - days * 86400000);

export const audienceService: AudienceService = {
  active: () =>
    friendly(async () => {
      const [daily, weekly, monthly, total, newThisWeek] = await Promise.all([
        count(query(col("users"), where("lastSeenAt", ">=", since(1)))),
        count(query(col("users"), where("lastSeenAt", ">=", since(7)))),
        count(query(col("users"), where("lastSeenAt", ">=", since(30)))),
        count(query(col("users"))),
        count(query(col("users"), where("joinedAt", ">=", since(7)))),
      ]);
      return { daily, weekly, monthly, total, sessionsToday: daily, newThisWeek };
    }),
  engagement: (contentId) =>
    friendly(async () => {
      const [content, total] = await Promise.all([
        one("content", contentId, toContent),
        count(query(col("users"))),
      ]);
      const views = content?.views ?? 0;
      return { viewers: [], nonViewers: [], viewRate: total ? Math.round((views / total) * 100) : 0, totalViews: views, averageSeconds: 0 };
    }),
  retention: () =>
    friendly(async () =>
      Promise.all(Array.from({ length: 6 }, async (_, i) => {
        const weeks = 5 - i;
        const value = await count(query(col("users"), where("lastSeenAt", ">=", since(7 * (weeks + 1)))));
        return { label: weeks === 0 ? "Esta semana" : `Hace ${weeks} sem.`, value };
      })),
    ),
};

export interface AdminUser extends User {
  createdAt: string;
  lastSeenAt: string | null;
  status: string;
}
export interface AdminService {
  users(filters?: { q?: string; role?: string; status?: string }): Promise<AdminUser[]>;
  createUser(input: {
    firstName: string; lastName: string; email: string; password: string; role: Role;
  }): Promise<User>;
  updateUser(id: ID, patch: { role?: Role; status?: string; churchId?: ID }): Promise<User>;
  removeUser(id: ID): Promise<{ ok: boolean }>;
  catalog<T>(kind: string): Promise<T[]>;
  createEntry<T>(kind: string, data: Partial<T>): Promise<T>;
  updateEntry<T>(kind: string, id: ID, patch: Partial<T>): Promise<T>;
  removeEntry(kind: string, id: ID): Promise<{ ok: boolean }>;
  health(): Promise<{ ok: boolean; counts: Record<string, number>; uptimeSeconds: number }>;
}

/** Tipo de catálogo → colección de Firestore. */
const CATALOG: Record<string, string> = {
  church: "churches", course: "courses", devotional: "devotionals", plan: "plans",
  event: "events", ministry: "ministries", group: "groups", foundationCase: "foundationCases",
  volunteerOpportunity: "volunteer",
};
const catalogCollection = (kind: string) => {
  const name = CATALOG[kind];
  if (!name) throw new AppError(`No se administra «${kind}» desde aquí.`);
  return name;
};

export const adminService: AdminService = {
  users: (filters = {}) =>
    friendly(async () => {
      const rows = (await getDocs(col("users"))).docs;
      const items = rows.map((d) => {
        const u = toUser(d);
        if (!u) return null;
        const x = d.data();
        return { ...u, createdAt: iso(x.joinedAt), lastSeenAt: x.lastSeenAt ? iso(x.lastSeenAt) : null, status: x.status ?? "active" } as AdminUser;
      }).filter((u): u is AdminUser => Boolean(u));
      let out = items;
      if (filters.role) out = out.filter((u) => u.role === filters.role);
      if (filters.status) out = out.filter((u) => u.status === filters.status);
      if (filters.q) {
        const q = fold(filters.q);
        out = out.filter((u) => fold(`${u.name} ${u.handle}`).includes(q));
      }
      return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }),

  createUser: (input) =>
    friendly(async () => {
      // Crear una cuenta con el SDK del cliente inicia sesión con ella. Para no
      // sacar a la administración de su sesión se usa una instancia aparte.
      const secondary = initializeApp(auth.app.options, `alta-${Date.now()}`);
      try {
        const secondaryAuth = getAuth(secondary);
        const { user: account } = await createUserWithEmailAndPassword(secondaryAuth, input.email.trim(), input.password);
        await updateAuthProfile(account, { displayName: `${input.firstName} ${input.lastName}` });
        await secondaryAuth.signOut();
        // El perfil lo crea la persona al entrar por primera vez (las reglas no
        // dejan crear el perfil de otro). Su rol se asigna aquí después.
        return {
          id: account.uid, firstName: input.firstName, lastName: input.lastName,
          name: `${input.firstName} ${input.lastName}`, handle: handleFrom(input.firstName, input.lastName, account.uid),
          email: input.email, role: "user", bio: "", city: "", country: "", ministries: [], interests: [],
          followers: 0, following: 0, joinedAt: new Date().toISOString(), color: colorFor(account.uid),
        } as User;
      } finally {
        await deleteApp(secondary).catch(() => undefined);
      }
    }),

  updateUser: (id, patch) =>
    friendly(async () => {
      const update: Record<string, unknown> = {};
      if (patch.role) update.role = patch.role;
      if (patch.status) update.status = patch.status;
      if (patch.churchId !== undefined) update.churchId = patch.churchId;
      await updateDoc(ref("users", id), update);
      const changed = (await one("users", id, (d) => toUser(d)))!;
      if (patch.role) {
        await notifyUser(id, {
          category: "sistema",
          title: "Tu rol cambió",
          body: `Ahora tienes el rol: ${patch.role}.`,
          href: "/profile",
        });
      }
      return changed;
    }),

  removeUser: (id) =>
    friendly(async () => {
      // La cuenta de Google/correo solo la borra su dueña; aquí se suspende y se
      // retira el perfil público.
      await updateDoc(ref("users", id), { status: "suspended" });
      return { ok: true };
    }),

  catalog: <T,>(kind: string) =>
    friendly(async () =>
      (await getDocs(col(catalogCollection(kind)))).docs.map((d) => ({ id: d.id, ...d.data() }) as T),
    ),
  createEntry: <T,>(kind: string, data: Partial<T>) =>
    friendly(async () => {
      const clean = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      const docRef = await addDoc(col(catalogCollection(kind)), {
        ...clean,
        ownerId: me(),
        color: clean.color ?? colorFor(String(clean.title ?? clean.name ?? kind)),
        createdAt: serverTimestamp(),
      });
      return { id: docRef.id, ...(await getDoc(docRef)).data() } as T;
    }),
  updateEntry: <T,>(kind: string, id: ID, patch: Partial<T>) =>
    friendly(async () => {
      const name = catalogCollection(kind);
      await updateDoc(ref(name, id), JSON.parse(JSON.stringify(patch)));
      return { id, ...(await getDoc(ref(name, id))).data() } as T;
    }),
  removeEntry: (kind, id) =>
    friendly(async () => (await deleteDoc(ref(catalogCollection(kind), id)), { ok: true })),
  health: () =>
    friendly(async () => {
      const names = ["users", "churches", "courses", "plans", "devotionals", "podcastFeeds", "posts", "prayers"];
      const values = await Promise.all(names.map((n) => count(query(col(n)))));
      return { ok: true, counts: Object.fromEntries(names.map((n, i) => [n, values[i]])), uptimeSeconds: 0 };
    }),
};

/* ======================================================== datos propios */

/**
 * Todo lo que Heseria guarda de una persona, en un JSON que se lleva consigo.
 * Es su derecho saber qué se guarda y poder sacarlo.
 */
export async function exportMyData(): Promise<Blob> {
  const uid = me();
  const docs = async (path: string) =>
    (await getDocs(col(path))).docs.map((d) => ({ id: d.id, ...JSON.parse(JSON.stringify(d.data())) }));
  const data = {
    exportadoEl: new Date().toISOString(),
    perfil: JSON.parse(JSON.stringify((await getDoc(ref("users", uid))).data() ?? {})),
    privado: JSON.parse(JSON.stringify((await getDoc(ref(`users/${uid}/private`, "info"))).data() ?? {})),
    marcasBiblia: await docs(`users/${uid}/marks`),
    biblioteca: await docs(`users/${uid}/library`),
    historial: await docs(`users/${uid}/history`),
    cursos: await docs(`users/${uid}/enrollments`),
    planes: await docs(`users/${uid}/planProgress`),
    avisos: await docs(`users/${uid}/notifications`),
    publicaciones: (await getDocs(query(col("posts"), where("authorId", "==", uid)))).docs.map((d) => ({ id: d.id, ...d.data() })),
    oraciones: (await getDocs(query(col("prayers"), where("authorId", "==", uid)))).docs.map((d) => ({ id: d.id, ...d.data() })),
    ofrendas: (await getDocs(query(col("donations"), where("donorId", "==", uid)))).docs.map((d) => ({ id: d.id, ...d.data() })),
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

/** ¿La cuenta entra con contraseña? Las de Google no tienen una que cambiar. */
export function accountProviders(): { password: boolean; google: boolean; emailVerified: boolean } {
  const ids = auth.currentUser?.providerData.map((p) => p.providerId) ?? [];
  return {
    password: ids.includes("password"),
    google: ids.includes("google.com"),
    emailVerified: Boolean(auth.currentUser?.emailVerified),
  };
}

/* ============================================================ sugerencias */

export interface FeedbackItem {
  id: ID;
  type: "bug" | "idea";
  message: string;
  screen: string;
  userId: string | null;
  device: string;
  screenshot?: string;
  createdAt: string;
}

/** Datos del teléfono que ayudan a reproducir una falla. Nada personal. */
function deviceInfo() {
  const native = Capacitor.isNativePlatform();
  const installed = !native && matchMedia("(display-mode: standalone)").matches;
  return [
    native ? `app ${Capacitor.getPlatform()}` : installed ? "web instalada" : "web",
    `v${import.meta.env.VITE_APP_VERSION ?? "1.0.0"}`,
    `${screen.width}x${screen.height}`,
    navigator.language,
    navigator.onLine ? "en línea" : "sin conexión",
    navigator.userAgent,
  ].join(" · ").slice(0, 400);
}

/**
 * Sugerencias (con sesión) y reportes de fallas (también sin sesión, para que
 * un error al entrar pueda reportarse). La captura opcional se comprime en el
 * teléfono y viaja dentro del documento (plan Spark: sin Storage).
 */
export async function sendFeedback(input: {
  type: "bug" | "idea";
  message: string;
  screen?: string;
  screenshot?: Blob | null;
}) {
  const screenshot = input.screenshot ? await compressImage(input.screenshot, 1080, 0.6) : null;
  await addDoc(col("feedback"), {
    type: input.type,
    message: input.message.slice(0, 4000),
    screen: (input.screen ?? "").slice(0, 120),
    userId: myIdOrNull(),
    device: deviceInfo(),
    ...(screenshot ? { screenshot } : {}),
    createdAt: serverTimestamp(),
  });
}

/**
 * Versículo del día por push en la web/PWA (en el APK es un aviso local). Pide permiso, obtiene el
 * token de FCM con el service worker propio (public/sw.js muestra el aviso) y lo guarda en
 * pushTokens/{token}; el Worker de Cloudflare lo envía cada mañana. Devuelve un motivo si no se puede.
 */
export async function enableWebPush(ask = true): Promise<string | null> {
  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
  if (!(await isSupported()) || !("serviceWorker" in navigator)) {
    return /iphone|ipad/i.test(navigator.userAgent)
      ? "En iPhone primero instala Heseria: Compartir → «Agregar a pantalla de inicio», y ábrela desde el ícono."
      : "Este navegador no recibe avisos.";
  }
  const permission = ask ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return "Permite las notificaciones de Heseria en tu navegador.";
  const token = await getToken(getMessaging(auth.app), { serviceWorkerRegistration: await navigator.serviceWorker.ready });
  if (!token) return "No se pudo registrar este dispositivo.";
  await setDoc(ref("pushTokens", token), { uid: me(), platform: "web", updatedAt: serverTimestamp() });
  localStorage.setItem("heseria.pushToken", token);
  return null;
}

export async function disableWebPush(): Promise<void> {
  const token = localStorage.getItem("heseria.pushToken");
  localStorage.removeItem("heseria.pushToken");
  if (token) await deleteDoc(ref("pushTokens", token)).catch(() => undefined);
}

export const feedbackService = {
  list: () =>
    friendly(() =>
      list(query(col("feedback"), orderBy("createdAt", "desc"), limit(200)), (d): FeedbackItem | null => {
        const x = d.data();
        if (!x || (x.type !== "bug" && x.type !== "idea")) return null;
        return {
          id: d.id, type: x.type, message: x.message ?? "", screen: x.screen ?? "",
          userId: x.userId ?? null, device: x.device ?? x.userAgent ?? "",
          screenshot: x.screenshot || undefined, createdAt: iso(x.createdAt),
        };
      }),
    ),
  /** Atendido: se borra para no acumular capturas en Firestore. */
  remove: (id: ID) => friendly(() => deleteDoc(ref("feedback", id))),
};

export const services = {
  authService, userService, churchService, bibleService, devotionalService, planService,
  prayerService, musicService, podcastService, sermonService, videoService, movieService,
  seriesService, courseService, academyService, eventService, messageService, communityService,
  groupService, foundationService, donationService, notificationService, searchService,
  libraryService, analyticsService, moderationService, recommendationService, contentService,
  broadcastService, audienceService, adminService, ministryService, fileService,
  podcastFeedService, feedbackService,
};

