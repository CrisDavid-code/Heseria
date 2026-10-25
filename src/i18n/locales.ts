/**
 * HESERIA — Los idiomas de la interfaz.
 *
 * El español es el idioma de referencia: es el que está completo y el que se
 * usa cuando a otro le falta una frase. Añadir un idioma es añadir un archivo
 * aquí y su entrada en `LOCALES`; lo que no esté traducido se verá en español
 * en lugar de verse roto o en blanco.
 *
 * Esto traduce la **interfaz**, no el contenido. Un sermón predicado en español
 * sigue estando en español aunque la app esté en inglés, igual que en cualquier
 * plataforma de audio: traducirlo automáticamente sería poner en boca de
 * alguien palabras que no dijo.
 */
import { en } from "./en";
import { es } from "./es";
import { pt } from "./pt";

export type Locale = "es" | "en" | "pt";

/**
 * El idioma de referencia: sus claves definen qué se puede traducir.
 * El valor es `string` a secas y no la frase literal del español, porque si no
 * TypeScript exigiría que la traducción inglesa dijera «Inicio».
 */
export type TKey = keyof typeof es;
export type Dictionary = Record<TKey, string>;

export const DICTIONARIES: Record<Locale, Partial<Dictionary>> = { es, en, pt };

export interface LocaleInfo {
  code: Locale;
  /** Cómo se llama el idioma en ese mismo idioma. */
  name: string;
  /** Etiqueta BCP-47 para fechas, números y el atributo `lang`. */
  tag: string;
}

export const LOCALES: LocaleInfo[] = [
  { code: "es", name: "Español", tag: "es" },
  { code: "en", name: "English", tag: "en" },
  { code: "pt", name: "Português", tag: "pt" },
];

export const DEFAULT_LOCALE: Locale = "es";

/** ¿Es uno de los idiomas que la app habla? */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((l) => l.code === value);
}

/**
 * El idioma del teléfono, si lo hablamos. `navigator.language` puede venir como
 * "es-GT" o "pt-BR": solo interesa la parte de delante.
 */
export function deviceLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const base = candidate?.split("-")[0]?.toLowerCase();
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** La etiqueta BCP-47 de un idioma, para `Intl` y para `<html lang>`. */
export function tagOf(locale: Locale): string {
  return LOCALES.find((l) => l.code === locale)?.tag ?? "es";
}
