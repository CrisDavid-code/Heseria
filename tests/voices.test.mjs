// node tests/voices.test.mjs — la voz natural va primero.
import assert from "node:assert/strict";
import { quality } from "../src/lib/voices.ts";

const voices = [
  ["Microsoft Sabina - Spanish (Mexico)", "es-MX", true],
  ["Microsoft Dalia Online (Natural) - Spanish (Mexico)", "es-MX", false],
  ["Google español de Estados Unidos", "es-US", false],
  ["es-us-x-esd-network", "es-US", false],
  ["es-us-x-esd-local", "es-US", true],
  ["eSpeak Spanish", "es", true],
];
const rank = (v) => quality(v[0], v[1], v[2]);
const sorted = [...voices].sort((a, b) => rank(b) - rank(a)).map((v) => v[0]);
assert.equal(sorted[0], "Microsoft Dalia Online (Natural) - Spanish (Mexico)");
assert.ok(sorted.indexOf("es-us-x-esd-network") < sorted.indexOf("es-us-x-esd-local"), "la voz en red supera a la local");
assert.equal(sorted.at(-1), "eSpeak Spanish");
console.log("voices: ok");
