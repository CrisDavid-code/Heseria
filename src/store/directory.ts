/**
 * HESERIA — Directorio de referencia.
 *
 * Muchas pantallas necesitan resolver un identificador a un nombre: el autor de
 * un sermón, la iglesia de un evento, el artista de una canción. Pedir cada uno
 * por separado sería una tormenta de peticiones, así que estas tablas pequeñas
 * se descargan una vez al arrancar y quedan disponibles para todo el árbol.
 *
 * Antes vivían en `src/mocks`. Ahora vienen del servidor: mismo uso, datos
 * reales. Los exports son enlaces vivos de ES modules, así que al recargar el
 * directorio quien los importó ve los valores nuevos.
 */
import { useSyncExternalStore } from "react";
import {
  bibleService, churchService, courseService, foundationService,
  musicService, sermonService, userService,
} from "@/services";
import type {
  Artist, BibleBook, Church, Course, FoundationCase, ID, Sermon, Song, User,
} from "@/types";

export let users: User[] = [];
export let churches: Church[] = [];
export let artists: Artist[] = [];
export let songs: Song[] = [];
export let courses: Course[] = [];
export let sermons: Sermon[] = [];
export let foundationCases: FoundationCase[] = [];
export let bibleBooks: BibleBook[] = [];

let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Instantánea que cambia de identidad en cada carga, para `useSyncExternalStore`. */
let snapshot = { loaded: false, at: 0 };

export const directoryStore = {
  get: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** ¿Ya está el directorio en memoria? */
export const isDirectoryLoaded = () => loaded;

/**
 * Descarga el directorio. Si alguna tabla falla, las demás siguen: una lista de
 * nombres incompleta es mejor que una pantalla en blanco.
 */
export async function loadDirectory(): Promise<void> {
  const settle = async <T,>(promise: Promise<T[]>): Promise<T[]> => {
    try {
      return await promise;
    } catch {
      return [];
    }
  };

  const [u, c, a, s, co, sm, fc, bb] = await Promise.all([
    settle(userService.list()),
    settle(churchService.list()),
    settle(musicService.artists()),
    settle(musicService.songs()),
    settle(courseService.list()),
    settle(sermonService.list()),
    settle(foundationService.cases()),
    settle(bibleService.books()),
  ]);

  users = u;
  churches = c;
  artists = a;
  songs = s;
  courses = co;
  sermons = sm;
  foundationCases = fc;
  bibleBooks = bb;

  loaded = true;
  snapshot = { loaded: true, at: Date.now() };
  emit();
}

/** Vuelve a leer el directorio: tras iniciar sesión o cambiar de servidor. */
export async function refreshDirectory(): Promise<void> {
  await loadDirectory();
}

export function clearDirectory(): void {
  users = [];
  churches = [];
  artists = [];
  songs = [];
  courses = [];
  sermons = [];
  foundationCases = [];
  bibleBooks = [];
  loaded = false;
  snapshot = { loaded: false, at: Date.now() };
  emit();
}

/** Suscribe un componente a las recargas del directorio. */
export function useDirectory() {
  useSyncExternalStore(directoryStore.subscribe, directoryStore.get, directoryStore.get);
  return { users, churches, artists, songs, courses, sermons, foundationCases, bibleBooks };
}

/* --------------------------------------------------------------- búsquedas */

const find = <T extends { id: ID }>(list: T[], id: ID | undefined) =>
  id ? list.find((item) => item.id === id) : undefined;

export const userById = (id?: ID) => find(users, id);
export const churchById = (id?: ID) => find(churches, id);
export const artistById = (id?: ID) => find(artists, id);
export const songById = (id?: ID) => find(songs, id);
export const courseById = (id?: ID) => find(courses, id);
export const bibleBookById = (id?: ID) => find(bibleBooks, id);

/** Nombre de una persona, o un guion si aún no está en el directorio. */
export const userName = (id?: ID) => userById(id)?.name ?? "—";
export const churchName = (id?: ID) => churchById(id)?.name ?? "—";
export const artistName = (id?: ID) => artistById(id)?.name ?? "—";
