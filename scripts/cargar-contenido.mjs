/**
 * HESERIA — Carga el contenido de `src/content/` a Firestore y actualiza los podcasts.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=<clave.json> node scripts/cargar-contenido.mjs
 *
 * Lo mismo que «Contenido inicial» del panel (src/services/seed.ts), pero desde CI con el
 * Admin SDK: corre en cada publicación, no duplica (ids fijos) y trae los episodios nuevos.
 * Los feeds se leen con el mismo parseFeed de la app (jsdom aporta el DOMParser).
 */
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

globalThis.DOMParser = new JSDOM("").window.DOMParser;
const { parseFeed } = await import("../src/services/rss.ts");

initializeApp({ projectId: process.env.FIREBASE_PROJECT || "heseria-app" });
const db = getFirestore(process.env.FIRESTORE_DATABASE || "(default)");
const read = (name) => JSON.parse(fs.readFileSync(new URL(`../src/content/${name}.json`, import.meta.url), "utf8"));

/** Mismo id que la app (services/index.ts → episodeId). */
function episodeId(feedId, guid) {
  let h = 2166136261;
  for (let i = 0; i < guid.length; i++) h = Math.imul(h ^ guid.charCodeAt(i), 16777619) >>> 0;
  return `${feedId}_${h.toString(36)}`;
}

async function put(path, items) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch();
    for (const { id, ...rest } of items.slice(i, i + 400)) {
      batch.set(db.collection(path).doc(id), { ...rest, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
  console.log(`${path}: ${items.length}`);
}

await put("churches", read("churches"));
await put("plans", read("plans"));
await put("devotionals", read("devotionals"));
await put("courses", read("courses"));

let failed = 0;
for (const url of read("podcasts")) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { show, episodes } = parseFeed(await res.text(), url);
    const found = await db.collection("podcastFeeds").where("feedUrl", "==", url).limit(1).get();
    const feedRef = found.empty ? db.collection("podcastFeeds").doc() : found.docs[0].ref;
    for (let i = 0; i < episodes.length; i += 400) {
      const batch = db.batch();
      for (const e of episodes.slice(i, i + 400)) {
        batch.set(db.collection("podcastEpisodes").doc(episodeId(feedRef.id, e.guid)), {
          ...e, feedId: feedRef.id, showTitle: show.title, showImage: show.image,
          publishedAt: Timestamp.fromDate(new Date(e.publishedAt)),
        });
      }
      await batch.commit();
    }
    await feedRef.set({
      ...show, episodes: episodes.length, syncError: null, lastSyncedAt: FieldValue.serverTimestamp(),
      ...(found.empty ? { addedBy: "heseria", createdAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    console.log(`podcast: ${show.title} (${episodes.length} episodios)`);
  } catch (err) {
    failed++;
    console.error(`podcast ${url}: ${err.message}`);
  }
}
if (failed) console.warn(`${failed} podcast(s) no se pudieron leer; los demás quedaron cargados.`);
