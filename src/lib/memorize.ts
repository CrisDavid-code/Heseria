/**
 * Oculta palabras de un versículo para practicar: más mientras más nivel (25 % + 12 % por nivel,
 * hasta 85 %), siempre las mismas para ese nivel, y cada pista vuelve a mostrar una.
 * Solo se ocultan palabras de más de 2 letras; la puntuación se conserva.
 */
export function hideWords(text: string, level: number, hints: number): string {
  const words = text.split(" ");
  const share = Math.min(0.85, 0.25 + level * 0.12);
  const candidates = words.map((_, i) => i).filter((i) => words[i].replace(/[^\p{L}]/gu, "").length > 2);
  const hidden = new Set(candidates.filter((_, k) => (k * 7919) % 100 < share * 100).slice(hints));
  if (!hidden.size && candidates.length > hints) hidden.add(candidates[hints]);
  return words.map((w, i) => (hidden.has(i) ? w.replace(/\p{L}/gu, "_") : w)).join(" ");
}
