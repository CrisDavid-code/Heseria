/**
 * HESERIA — Versículo del día. Lo usan la app (aviso local y pantalla) y el Worker de
 * Cloudflare que lo envía como push a la web (workers/push): así todos reciben el mismo.
 * Sin dependencias: el Worker lo empaqueta tal cual.
 */
/**
 * Pasajes escogidos para empezar el día. Se toma uno por día del año, así
 * toda la comunidad lee el mismo y se puede comentar.
 */
export const DAILY: [string, number, number][] = [
  ["juan", 3, 16], ["salmos", 23, 1], ["filipenses", 4, 13], ["isaias", 41, 10],
  ["romanos", 8, 28], ["jeremias", 29, 11], ["proverbios", 3, 5], ["mateo", 11, 28],
  ["josue", 1, 9], ["salmos", 46, 1], ["2-corintios", 5, 17], ["galatas", 2, 20],
  ["efesios", 2, 8], ["hebreos", 11, 1], ["1-juan", 4, 19], ["romanos", 12, 2],
  ["salmos", 119, 105], ["mateo", 6, 33], ["juan", 14, 6], ["1-corintios", 13, 4],
  ["isaias", 40, 31], ["lamentaciones", 3, 22], ["salmos", 37, 5], ["romanos", 5, 8],
  ["filipenses", 4, 6], ["juan", 15, 5], ["santiago", 1, 5], ["1-pedro", 5, 7],
  ["salmos", 91, 1], ["proverbios", 16, 3], ["miqueas", 6, 8], ["mateo", 5, 9],
  ["juan", 8, 32], ["colosenses", 3, 23], ["2-timoteo", 1, 7], ["salmos", 27, 1],
  ["nahum", 1, 7], ["sofonias", 3, 17], ["hebreos", 13, 8], ["apocalipsis", 21, 4],
];

/** [libro, capítulo, versículo] del día (fecha local; el Worker usa UTC a las 13:00 = 7:00 en Guatemala). */
export function dailyVerse(date = new Date()): [string, number, number] {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return DAILY[dayOfYear % DAILY.length];
}
