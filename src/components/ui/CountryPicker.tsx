/**
 * HESERIA — Selector de país.
 *
 * Se puede elegir de la lista o escribir para filtrar. En un teléfono, escribir
 * tres letras siempre gana a desplazar doscientas entradas, así que el campo de
 * búsqueda recibe el foco al abrir.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Input } from "@/components/ui/primitives";
import { COUNTRIES, findCountry, searchCountries, type Country } from "@/lib/countries";
import { cn } from "@/lib/utils";

export function CountryPicker({
  value,
  onChange,
  id,
  placeholder = "Selecciona tu país",
  invalid,
}: {
  /** Código ISO, o el nombre si viene de datos antiguos. */
  value: string;
  onChange: (code: string) => void;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = findCountry(value);
  const results = useMemo(() => searchCountries(query), [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    // El teclado aparece solo: se entra a escribir, no a desplazar.
    const id = window.setTimeout(() => searchRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, [open]);

  function choose(country: Country) {
    onChange(country.code);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-invalid={invalid}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-lg border bg-input px-3 text-left text-sm transition-colors",
          invalid ? "border-destructive" : "border-border",
          selected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {selected ? (
          <>
            <span aria-hidden className="text-base leading-none">
              {selected.flag}
            </span>
            <span className="min-w-0 flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate">{placeholder}</span>
        )}
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </button>

      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent title="País" fullScreen>
          <div className="mx-auto flex h-full max-w-md flex-col">
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Escribe para buscar"
                aria-label="Buscar país"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="pl-9 pr-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Borrar búsqueda"
                  className="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-muted-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <p className="mt-2 shrink-0 px-1 text-xs text-muted-foreground">
              {results.length === COUNTRIES.length
                ? `${COUNTRIES.length} países`
                : `${results.length} ${results.length === 1 ? "resultado" : "resultados"}`}
            </p>

            <ul className="mt-1 min-h-0 flex-1 overflow-y-auto pb-4">
              {results.map((country) => {
                const active = selected?.code === country.code;
                return (
                  <li key={country.code}>
                    <button
                      type="button"
                      onClick={() => choose(country)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left text-sm transition-colors active:bg-secondary",
                        active && "bg-primary/10 text-primary",
                      )}
                    >
                      <span aria-hidden className="text-lg leading-none">
                        {country.flag}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{country.name}</span>
                      {active && <Check className="size-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}

              {results.length === 0 && (
                <li className="px-2 py-10 text-center text-sm text-muted-foreground">
                  No encontramos «{query}». Prueba con otro nombre.
                </li>
              )}
            </ul>
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}
