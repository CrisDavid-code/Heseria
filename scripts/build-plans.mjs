/**
 * HESERIA — Planes de lectura reales.
 *
 *   node scripts/build-plans.mjs
 *
 * Un plan de lectura es un reparto de capítulos por días: no hay texto ajeno
 * que licenciar. Se genera a partir del índice de la Biblia que va en la app
 * (`public/biblia/books.json`), así que cada pasaje existe de verdad.
 */
import fs from "node:fs";

const books = JSON.parse(fs.readFileSync("public/biblia/books.json", "utf8"));
const byId = new Map(books.map((b) => [b.id, b]));

/** Todos los capítulos de los libros indicados, en orden. */
function chapters(ids) {
  return ids.flatMap((id) => {
    const b = byId.get(id);
    if (!b) throw new Error(`Libro desconocido: ${id}`);
    return Array.from({ length: b.chapters }, (_, i) => ({ book: id, name: b.name, chapter: i + 1 }));
  });
}

/** «Génesis 1-3» o «Génesis 50; Éxodo 1-2»: legible, sin perder ninguno. */
function label(list) {
  const groups = [];
  for (const c of list) {
    const last = groups.at(-1);
    if (last && last.book === c.book && last.to === c.chapter - 1) last.to = c.chapter;
    else groups.push({ book: c.book, name: c.name, from: c.chapter, to: c.chapter });
  }
  return groups.map((g) => (g.from === g.to ? `${g.name} ${g.from}` : `${g.name} ${g.from}-${g.to}`)).join("; ");
}

/** Reparte los capítulos en `days` días lo más parejo posible. */
function spread(list, days) {
  const out = [];
  for (let d = 0; d < days; d++) {
    const from = Math.round((d * list.length) / days);
    const to = Math.round(((d + 1) * list.length) / days);
    out.push(list.slice(from, to));
  }
  return out;
}

const TASKS = [
  "Anota el versículo que más te habló y por qué.",
  "¿Qué dice este pasaje sobre quién es Dios?",
  "¿Hay algo que obedecer, agradecer o confesar hoy?",
  "Convierte lo que leíste en una oración breve.",
  "Comparte con alguien una idea de la lectura de hoy.",
];

function plan({ id, title, category, description, list, days, color }) {
  return {
    id,
    title,
    category,
    description,
    color,
    participants: 0,
    days: spread(list, days).map((day, i) => ({
      day: i + 1,
      title: `Día ${i + 1}`,
      passage: label(day),
      task: TASKS[i % TASKS.length],
      done: false,
    })),
  };
}

const AT = books.filter((b) => b.testament === "AT").map((b) => b.id);
const NT = books.filter((b) => b.testament === "NT").map((b) => b.id);
const GOSPELS = ["mateo", "marcos", "lucas", "juan"];

/** Un salmo y un proverbio: el día 31 tiene los dos que quedan. */
function psalmsAndProverbs() {
  const ps = chapters(["salmos"]);
  const pr = chapters(["proverbios"]);
  const days = spread(ps, 31).map((p, i) => [...p, pr[i]]);
  return days;
}

const plans = [
  plan({
    id: "biblia-en-un-ano",
    title: "La Biblia en un año",
    category: "Toda la Biblia",
    description: "De Génesis a Apocalipsis en 365 días, unos tres capítulos y medio por día.",
    list: chapters([...AT, ...NT]),
    days: 365,
    color: "from-cyan-500/70 to-blue-700/70",
  }),
  plan({
    id: "nuevo-testamento-90",
    title: "El Nuevo Testamento en 90 días",
    category: "Nuevo Testamento",
    description: "La vida de Jesús, la iglesia primitiva y las cartas, en tres meses.",
    list: chapters(NT),
    days: 90,
    color: "from-violet-500/70 to-indigo-800/70",
  }),
  plan({
    id: "evangelios-30",
    title: "Los cuatro Evangelios en 30 días",
    category: "Jesús",
    description: "Mateo, Marcos, Lucas y Juan: conocer a Jesús en un mes.",
    list: chapters(GOSPELS),
    days: 30,
    color: "from-amber-400/70 to-orange-700/70",
  }),
  plan({
    id: "salmos-30",
    title: "Los Salmos en 30 días",
    category: "Oración",
    description: "Cinco salmos por día para aprender a orar con la Biblia.",
    list: chapters(["salmos"]),
    days: 30,
    color: "from-emerald-400/70 to-teal-800/70",
  }),
  plan({
    id: "proverbios-31",
    title: "Proverbios en 31 días",
    category: "Sabiduría",
    description: "Un capítulo de Proverbios por cada día del mes.",
    list: chapters(["proverbios"]),
    days: 31,
    color: "from-sky-400/70 to-indigo-700/70",
  }),
  plan({
    id: "romanos-16",
    title: "Romanos en 16 días",
    category: "Doctrina",
    description: "La carta que explica el evangelio de la gracia, un capítulo por día.",
    list: chapters(["romanos"]),
    days: 16,
    color: "from-rose-400/70 to-purple-800/70",
  }),
  plan({
    id: "hechos-28",
    title: "Hechos de los Apóstoles en 28 días",
    category: "Iglesia",
    description: "Cómo nació y creció la iglesia, capítulo a capítulo.",
    list: chapters(["hechos"]),
    days: 28,
    color: "from-lime-400/70 to-emerald-800/70",
  }),
];

// Salmos y Proverbios juntos se arma aparte: dos libros en paralelo.
const pp = psalmsAndProverbs();
plans.push({
  id: "salmos-proverbios-31",
  title: "Un salmo y un proverbio cada día",
  category: "Sabiduría",
  description: "Durante un mes: cinco salmos para orar y un proverbio para vivir.",
  color: "from-fuchsia-400/70 to-violet-800/70",
  participants: 0,
  days: pp.map((day, i) => ({
    day: i + 1,
    title: `Día ${i + 1}`,
    passage: label(day),
    task: TASKS[i % TASKS.length],
    done: false,
  })),
});

fs.mkdirSync("src/content", { recursive: true });
fs.writeFileSync("src/content/plans.json", JSON.stringify(plans));
for (const p of plans) console.log(`${p.days.length} días · ${p.title} · día 1: ${p.days[0].passage} · último: ${p.days.at(-1).passage}`);
const total = plans[0].days.reduce((n, d) => n + d.passage.split(";").length, 0);
console.log("comprobación Biblia en un año: grupos", total);
