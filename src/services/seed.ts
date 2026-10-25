/**
 * HESERIA — Carga del contenido inicial real.
 *
 * Lo ejecuta la administración desde la app (Panel global → Contenido
 * inicial). Corre con su sesión, así que las reglas de Firestore deciden: solo
 * una cuenta admin puede escribir esto. No hace falta ninguna clave de servidor.
 *
 * Todo es real y con licencia libre:
 *   · iglesias evangélicas de Guatemala de OpenStreetMap (ODbL, se cita),
 *   · planes de lectura sobre la Biblia incluida (dominio público),
 *   · devocionales y cursos originales del Equipo Heseria,
 *   · podcasts cristianos cuyos autores los publican por RSS.
 *
 * Se puede repetir sin duplicar: cada documento tiene un id fijo.
 */
import { doc, getDocs, query, serverTimestamp, where, writeBatch, collection } from "firebase/firestore";
import { db } from "@/services/firebase";
import { podcastFeedService } from "@/services";

export interface SeedStep {
  label: string;
  done: number;
  total: number;
}

/** Escribe en lotes de 400 (Firestore admite 500 por lote). */
async function put(path: string, items: { id: string }[], extra: Record<string, unknown> = {}) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    for (const { id, ...rest } of items.slice(i, i + 400)) {
      batch.set(doc(db, path, id), { ...rest, ...extra, updatedAt: serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
}

export async function seedRealContent(onStep: (s: SeedStep) => void): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  // Los datos se cargan solo aquí: no pesan en la app de quien no administra.
  const [churches, plans, devotionals, courses, feeds] = await Promise.all([
    import("@/content/churches.json").then((m) => m.default as { id: string }[]),
    import("@/content/plans.json").then((m) => m.default as { id: string }[]),
    import("@/content/devotionals.json").then((m) => m.default as { id: string }[]),
    import("@/content/courses.json").then((m) => m.default as { id: string }[]),
    import("@/content/podcasts.json").then((m) => m.default as string[]),
  ]);

  onStep({ label: "Iglesias evangélicas de Guatemala", done: 0, total: churches.length });
  await put("churches", churches);
  onStep({ label: "Iglesias evangélicas de Guatemala", done: churches.length, total: churches.length });

  onStep({ label: "Planes de lectura", done: 0, total: plans.length });
  await put("plans", plans);
  onStep({ label: "Planes de lectura", done: plans.length, total: plans.length });

  onStep({ label: "Devocionales", done: 0, total: devotionals.length });
  await put("devotionals", devotionals);
  onStep({ label: "Devocionales", done: devotionals.length, total: devotionals.length });

  onStep({ label: "Cursos", done: 0, total: courses.length });
  await put("courses", courses);
  onStep({ label: "Cursos", done: courses.length, total: courses.length });

  // Podcasts: se leen sus feeds de verdad. Los que ya estén, se saltan.
  let done = 0;
  onStep({ label: "Podcasts", done, total: feeds.length });
  for (const url of feeds) {
    try {
      const existing = await getDocs(query(collection(db, "podcastFeeds"), where("feedUrl", "==", url)));
      if (existing.empty) await podcastFeedService.subscribe(url);
    } catch (err) {
      errors.push(`${url}: ${(err as Error).message}`);
    }
    onStep({ label: "Podcasts", done: ++done, total: feeds.length });
  }

  return { errors };
}
