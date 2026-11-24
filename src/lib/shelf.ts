/**
 * Estante local del lector: los libros que la persona abre desde su teléfono se guardan solo en
 * este dispositivo (IndexedDB), con la posición de lectura y los marcadores. No se suben a ningún lado.
 */
export type BookFormat = "epub" | "pdf" | "txt";
export interface Bookmark { at: string; label: string; createdAt: number }
export interface ShelfBook {
  id: string;
  title: string;
  format: BookFormat;
  data: Blob;
  position: string; // página (PDF), CFI (EPUB) o desplazamiento (TXT)
  bookmarks: Bookmark[];
  openedAt: number;
}

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("heseria-lector", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("books", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function tx<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = work(db.transaction("books", mode).objectStore("books"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const shelf = {
  all: async () => ((await tx("readonly", (s) => s.getAll())) as ShelfBook[]).sort((a, b) => b.openedAt - a.openedAt),
  get: (id: string) => tx("readonly", (s) => s.get(id)) as Promise<ShelfBook | undefined>,
  put: (b: ShelfBook) => tx("readwrite", (s) => s.put(b)),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
};

export function formatOf(name: string, type = ""): BookFormat | null {
  const n = name.toLowerCase();
  if (n.endsWith(".epub") || type === "application/epub+zip") return "epub";
  if (n.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (n.endsWith(".txt") || type.startsWith("text/plain")) return "txt";
  return null;
}
