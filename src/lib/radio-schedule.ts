/**
 * Programación de una emisora en texto simple, una línea por programa:
 *   «L-V 06:00-09:00 Amanecer con Dios»   «S 10:00-12:00 Alabanza»   «D 08:00-10:00 Culto»
 * Días: L M X J V S D, sueltos («L,X,V») o en rango («L-V»); «Diario» = todos.
 */
export interface ScheduleItem { days: string; start: string; end: string; title: string }

const DAYS = ["D", "L", "M", "X", "J", "V", "S"]; // índice = Date.getDay()

export function parseSchedule(text: string): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(diario|[LMXJVSD](?:\s*[-,]\s*[LMXJVSD])*)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(.{2,80}?)\s*$/i.exec(line);
    if (m) out.push({ days: m[1].toUpperCase().replace(/\s/g, ""), start: m[2].padStart(5, "0"), end: m[3].padStart(5, "0"), title: m[4] });
  }
  return out.slice(0, 60);
}

export const scheduleText = (items: ScheduleItem[] = []) => items.map((i) => `${i.days} ${i.start}-${i.end} ${i.title}`).join("\n");

/** ¿El programa se emite el día `day` (0 = domingo)? */
export function onDay(days: string, day: number): boolean {
  if (days === "DIARIO") return true;
  const want = DAYS[day];
  return days.split(",").some((part) => {
    const [a, b] = part.split("-");
    if (!b) return a === want;
    const order = ["L", "M", "X", "J", "V", "S", "D"];
    const i = order.indexOf(a), j = order.indexOf(b), k = order.indexOf(want);
    return i <= j ? k >= i && k <= j : k >= i || k <= j;
  });
}

/** Programas de hoy, en orden, marcando el que está al aire. */
export function today(items: ScheduleItem[] = [], now = new Date()) {
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return items
    .filter((i) => onDay(i.days, now.getDay()))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((i) => ({ ...i, live: i.start <= hm && (i.end > hm || i.end < i.start) }));
}
