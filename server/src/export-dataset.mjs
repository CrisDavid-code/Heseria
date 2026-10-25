/**
 * Exporta el dataset de `src/mocks/data.ts` a `server/data/dataset.json`.
 *
 * El backend se siembra con exactamente los mismos datos que ya mostraba la
 * app, de modo que al encender el servidor nada desaparece: el catálogo pasa
 * de vivir en el bundle a vivir en la base de datos.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.resolve(here, "../data/.dataset.mjs");

await build({
  entryPoints: [path.join(root, "src/mocks/data.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "error",
  alias: { "@": path.join(root, "src") },
});

const db = await import(pathToFileURL(out).href + `?t=${Date.now()}`);

/** Genera los capítulos bíblicos de demostración para todos los libros. */
function bibleChapters() {
  const chapters = [];
  for (const book of db.bibleBooks) {
    for (let c = 1; c <= book.chapters; c++) {
      chapters.push(db.getChapter(book.id, c, "hsd"));
    }
  }
  return chapters;
}

const dataset = {
  users: db.users,
  demoPersonas: db.demoPersonas,
  churches: db.churches,
  ministries: db.ministries,
  artists: db.artists,
  songs: db.songs,
  albums: db.albums,
  playlists: db.playlists,
  podcasts: db.podcasts,
  sermons: db.sermons,
  videos: db.videos,
  movies: db.movies,
  series: db.series,
  courses: db.courses,
  devotionals: db.devotionals,
  plans: db.plans,
  prayers: db.prayers,
  events: db.events,
  groups: db.groups,
  posts: db.posts,
  conversations: db.conversations,
  messages: db.messages,
  foundationCases: db.foundationCases,
  volunteerOpportunities: db.volunteerOpportunities,
  donations: db.donations,
  notifications: db.notifications,
  moderationQueue: db.moderationQueue,
  bibleVersions: db.bibleVersions,
  bibleBooks: db.bibleBooks,
  bibleChapters: bibleChapters(),
  verseOfTheDay: db.verseOfTheDay,
};

const target = path.resolve(here, "../data/dataset.json");
fs.writeFileSync(target, JSON.stringify(dataset));
fs.rmSync(out, { force: true });

const sizes = Object.entries(dataset)
  .map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : 1}`)
  .join(" ");
console.log(`dataset.json escrito (${(fs.statSync(target).size / 1024) | 0} KB)`);
console.log(sizes);
