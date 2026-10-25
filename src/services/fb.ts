/**
 * HESERIA — Utilidades comunes para hablar con Firestore.
 *
 * Solo `src/services` importa Firebase. Las pantallas reciben tipos del
 * dominio y no saben de documentos ni de `Timestamp`.
 */
import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "@/services/firebase";

/* --------------------------------------------------------------- errores */

/** Error de negocio con el mensaje ya listo para mostrar. */
export class AppError extends Error {}

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/invalid-email": "El correo no es válido.",
  "auth/user-disabled": "Esta cuenta fue deshabilitada.",
  "auth/email-already-in-use": "Ya existe una cuenta con este correo.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
  "auth/requires-recent-login": "Por seguridad, vuelve a iniciar sesión y repite la acción.",
  "auth/account-exists-with-different-credential":
    "Ya tienes una cuenta con este correo. Entra con tu contraseña.",
  "auth/popup-blocked":
    "Tu navegador bloqueó la ventana de Google. Permite las ventanas emergentes de este sitio e inténtalo de nuevo.",
  "auth/operation-not-allowed": "Entrar con Google no está activado en Firebase (Authentication → Sign-in method).",
  "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).",
  "permission-denied": "No tienes permiso para hacer esto o ver esta información.",
  unavailable: "No hay conexión. Revisa tu internet.",
  "not-found": "No se encontró la información.",
  "deadline-exceeded": "El servidor tardó demasiado en responder.",
  "resource-exhausted": "Se alcanzó el límite diario del servicio. Inténtalo mañana.",
};

/** Mensaje en español para cualquier error de Firebase. */
export function errorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof FirebaseError) {
    return MESSAGES[err.code] ?? MESSAGES[err.code.replace(/^firestore\//, "")] ??
      "Ocurrió un error inesperado. Inténtalo de nuevo.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

/**
 * Envuelve una operación para que, si falla, el error que llega a la pantalla
 * ya traiga el mensaje en español. Las pantallas muestran `error.message`.
 */
export async function friendly<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw new AppError(errorMessage(err));
  }
}

/* ---------------------------------------------------------------- sesión */

/** Identificador de quien usa la app. Falla con un mensaje claro si no hay sesión. */
export function me(): string {
  const u = auth.currentUser;
  if (!u) throw new AppError("Inicia sesión para continuar.");
  return u.uid;
}

export const myIdOrNull = (): string | null => auth.currentUser?.uid ?? null;

/* ----------------------------------------------------------------- fechas */

/** Cualquier fecha de Firestore (o ya en texto) a ISO. */
export function iso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  // Una escritura pendiente trae la hora del servidor todavía nula.
  return new Date().toISOString();
}

export const ms = (value: unknown): number => new Date(iso(value)).getTime();

/* ------------------------------------------------------------- consultas */

export const col = (path: string) => collection(db, path);
export const ref = (path: string, id: string) => doc(db, path, id);

/** Ejecuta una consulta y convierte cada documento con `map`. */
export async function list<T>(
  q: Query<DocumentData>,
  map: (d: QueryDocumentSnapshot<DocumentData>) => T | null,
): Promise<T[]> {
  const snap = await getDocs(q);
  const out: T[] = [];
  for (const d of snap.docs) {
    // Un documento con forma inesperada se descarta en vez de pintarse con
    // datos inventados (skill: mappers defensivos).
    const item = map(d);
    if (item != null) out.push(item);
  }
  return out;
}

/** Lee un documento; `undefined` si no existe. */
export async function one<T>(
  path: string,
  id: string,
  map: (d: DocumentSnapshot<DocumentData>) => T | null,
): Promise<T | undefined> {
  if (!id) return undefined;
  const snap = await getDoc(ref(path, id));
  if (!snap.exists()) return undefined;
  return map(snap) ?? undefined;
}

/* ----------------------------------------------------------------- color */

const COLORS = [
  "from-cyan-500/70 to-blue-700/70",
  "from-violet-500/70 to-indigo-800/70",
  "from-amber-400/70 to-orange-700/70",
  "from-emerald-400/70 to-teal-800/70",
  "from-rose-400/70 to-purple-800/70",
  "from-sky-400/70 to-indigo-700/70",
  "from-lime-400/70 to-emerald-800/70",
  "from-fuchsia-400/70 to-violet-800/70",
];

/** El mismo identificador da siempre el mismo degradado. */
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/* ---------------------------------------------------------------- textos */

/** Quita tildes y mayúsculas para comparar. */
export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** `ana.maria` a partir del nombre, para la arroba del perfil. */
export function handleFrom(first: string, last: string, uid: string): string {
  const base = fold(`${first}.${last}`).replace(/[^a-z0-9.]/g, "").replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "") || "usuario";
  // Unos caracteres del uid evitan choques sin tener que consultar.
  return `${base}.${uid.slice(0, 4).toLowerCase()}`;
}

/* ---------------------------------------------------------------- imagen */

/**
 * Reduce una foto en el propio teléfono antes de guardarla.
 *
 * El plan gratuito no tiene Storage, así que la imagen vive dentro de un
 * documento (máximo 1 MB). Una foto de cámara pesa 3–5 MB; recortada y
 * comprimida aquí queda en decenas de KB y carga al instante.
 */
export async function compressImage(file: Blob, maxSide: number, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AppError("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
