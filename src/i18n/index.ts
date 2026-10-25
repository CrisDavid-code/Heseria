/**
 * HESERIA — Traducción de la interfaz.
 *
 * Sin librería: un diccionario por idioma y una función que busca la clave.
 * Lo que no esté traducido cae en español, que es el idioma de referencia, así
 * que añadir frases nuevas nunca deja la pantalla en blanco ni muestra claves
 * sueltas a nadie.
 *
 * El idioma sale de lo que la persona eligió; si no eligió nada, del idioma del
 * teléfono; y si ese no lo hablamos, español.
 */
import { useEffect, useMemo } from "react";
import { usePreferences } from "@/store";
import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  LOCALES,
  isLocale,
  tagOf,
  type Locale,
  type TKey,
} from "./locales";

export { LOCALES, DEFAULT_LOCALE, isLocale, deviceLocale, tagOf } from "./locales";
export type { Locale, LocaleInfo, TKey } from "./locales";

export type Vars = Record<string, string | number>;
export type Translate = (key: TKey, vars?: Vars) => string;

/** Rellena los huecos: `"Hola, {name}"` con `{ name: "Ana" }`. */
function interpolate(text: string, vars: Vars): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * La función de traducción de un idioma. Fuera de React también sirve: los
 * servicios y los toasts la pueden usar pasando el idioma a mano.
 */
export function translator(locale: Locale): Translate {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  const fallback = DICTIONARIES[DEFAULT_LOCALE];

  return (key, vars) => {
    const text = dict[key] ?? fallback[key];
    // Si ni siquiera está en español, mostrar la clave es mejor que un hueco:
    // se ve raro en pantalla y sale a la luz en la primera revisión.
    if (text == null) return key;
    return vars ? interpolate(text, vars) : text;
  };
}

/** El idioma activo, ya resuelto. */
export function useLocale(): Locale {
  const { language } = usePreferences();
  return isLocale(language) ? language : DEFAULT_LOCALE;
}

/** Traduce dentro de un componente. Se recalcula al cambiar de idioma. */
export function useT(): Translate {
  const locale = useLocale();
  return useMemo(() => translator(locale), [locale]);
}

/** Cambia el idioma y lo guarda. */
export function useSetLocale(): (locale: Locale) => void {
  const { set } = usePreferences();
  return (locale) => set({ language: locale });
}

/**
 * Mantiene `<html lang>` al día. Importa para los lectores de pantalla, para el
 * corrector del teclado y para que el navegador ofrezca traducir o no.
 */
export function useHtmlLang(): void {
  const locale = useLocale();
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = tagOf(locale);
  }, [locale]);
}

/** Formateadores de fecha y número en el idioma activo. */
export function useFormatters() {
  const locale = useLocale();
  const tag = tagOf(locale);
  return useMemo(
    () => ({
      date: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(tag, options ?? { day: "numeric", month: "short" }).format(
          new Date(value),
        ),
      number: (value: number, options?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat(tag, options).format(value),
    }),
    [tag],
  );
}

/** Cuántas frases tiene traducidas cada idioma. Útil para no engañarse. */
export function coverage(): Record<Locale, number> {
  const total = Object.keys(DICTIONARIES[DEFAULT_LOCALE]).length;
  const out = {} as Record<Locale, number>;
  for (const { code } of LOCALES) {
    out[code] = Math.round((Object.keys(DICTIONARIES[code]).length / total) * 100);
  }
  return out;
}
