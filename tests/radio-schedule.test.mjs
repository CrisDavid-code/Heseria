// node tests/radio-schedule.test.mjs — programación de radio.
import assert from "node:assert/strict";
import { onDay, parseSchedule, today } from "../src/lib/radio-schedule.ts";

const s = parseSchedule("L-V 06:00-09:00 Amanecer con Dios\nS 10:00-12:00 Alabanza\nDiario 21:00-23:00 Oración de la noche\nesto no es válido");
assert.equal(s.length, 3);
assert.ok(onDay("L-V", 3) && !onDay("L-V", 0) && onDay("S", 6) && onDay("L,X,V", 5));
const wed7 = new Date(2026, 10, 25, 7, 30); // miércoles 7:30
const t = today(s, wed7);
assert.deepEqual(t.map((x) => x.title), ["Amanecer con Dios", "Oración de la noche"]);
assert.equal(t[0].live, true);
console.log("radio-schedule: ok");
