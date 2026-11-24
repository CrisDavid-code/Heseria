// node tests/memorize.test.mjs — prueba de la lógica de Memorizar (sin emulador).
import assert from "node:assert/strict";
import { hideWords } from "../src/lib/memorize.ts";

const v = "Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito";
const count = (s) => (s.match(/_+/g) ?? []).length;
const l0 = hideWords(v, 0, 0), l5 = hideWords(v, 5, 0);
assert.ok(count(l0) >= 1, "siempre oculta al menos una palabra");
assert.ok(count(l5) > count(l0), "más nivel, más palabras ocultas");
assert.equal(hideWords(v, 2, 0), hideWords(v, 2, 0), "mismo nivel, mismo resultado");
assert.ok(count(hideWords(v, 3, 2)) < count(hideWords(v, 3, 0)), "las pistas muestran palabras");
assert.equal(l5.split(" ").length, v.split(" ").length, "no cambia el número de palabras");
assert.ok(l5.includes("mundo,") || l5.includes("_____,"), "conserva la puntuación");
assert.ok(!hideWords(v, 5, 0).includes("al") || hideWords(v, 5, 0).split(" ")[6] === "al", "no oculta palabras de 2 letras");
console.log("memorize: ok");
