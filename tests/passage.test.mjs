// node tests/passage.test.mjs — pasajes de los planes de lectura.
import assert from "node:assert/strict";
import fs from "node:fs";
import { passageChapters } from "../src/lib/reference.ts";

const books = JSON.parse(fs.readFileSync(new URL("../public/biblia/books.json", import.meta.url), "utf8"));
const show = (t) => passageChapters(t, books).map((x) => `${x.book} ${x.chapter}`).join(", ");
assert.equal(show("Génesis 1-3"), "genesis 1, genesis 2, genesis 3");
assert.equal(show("1 Crónicas 28-29; 2 Crónicas 1"), "1-cronicas 28, 1-cronicas 29, 2-cronicas 1");
assert.equal(show("Juan 3:16-21"), "juan 3");
assert.equal(show("Salmos 23"), "salmos 23");
// Todos los pasajes de los planes se entienden.
const plans = JSON.parse(fs.readFileSync(new URL("../src/content/plans.json", import.meta.url), "utf8"));
const bad = plans.flatMap((p) => p.days.filter((d) => passageChapters(d.passage, books).length === 0).map((d) => d.passage));
assert.deepEqual(bad, [], `pasajes sin entender: ${bad.slice(0, 5).join(" | ")}`);
console.log("passage: ok");
