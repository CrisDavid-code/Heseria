// node tests/reference.test.mjs — búsqueda por referencia bíblica.
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseReference } from "../src/lib/reference.ts";

const books = JSON.parse(fs.readFileSync(new URL("../public/biblia/books.json", import.meta.url), "utf8"));
const r = (q) => { const x = parseReference(q, books); return x && `${x.book.id} ${x.chapter}${x.verse ? ":" + x.verse : ""}`; };
assert.equal(r("Juan 3:16"), "juan 3:16");
assert.equal(r("juan 3"), "juan 3");
assert.equal(r("1 cor 13"), "1-corintios 13");
assert.equal(r("1cor 13:4"), "1-corintios 13:4");
assert.equal(r("Génesis 1.1"), "genesis 1:1");
assert.equal(r("salmo 23"), "salmos 23");
assert.equal(r("apoc 21"), "apocalipsis 21");
assert.equal(r("1 juan 4:8"), "1-juan 4:8");
assert.equal(r("juan 99"), null, "capítulo que no existe");
assert.equal(r("amor"), null, "una palabra no es referencia");
assert.equal(r("xyz 3"), null, "libro que no existe");
console.log("reference: ok");
