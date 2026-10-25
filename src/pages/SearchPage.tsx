import { Clock, Search, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { GenerativeCover } from "@/components/media/covers";
import { EmptyState, ListSkeleton } from "@/components/states";
import { Chip, Input } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { searchService } from "@/services";
import { useScreen } from "@/store/screen";

const RECENT_KEY = "heseria.recentSearches";

function readRecent(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* storage unavailable */
  }
}

const FILTERS = [
  "Todo", "Canción", "Artista", "Álbum", "Playlist", "Persona", "Iglesia", "Sermón",
  "Podcast", "Video", "Curso", "Grupo", "Evento", "Ministerio", "Biblia",
];

export default function SearchPage() {
  usePageMeta("Buscar", "Busca en toda la plataforma Heseria.");
  useScreen({ title: "Buscar", hideSections: true });

  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const [filter, setFilter] = useState("Todo");
  const [recent, setRecent] = useState<string[]>(readRecent);

  const suggestions = useAsync(() => searchService.suggestions(), []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 220);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    setParams(debounced ? { q: debounced } : {}, { replace: true });
    if (debounced.trim().length > 2) {
      setRecent((prev) => {
        const next = [debounced, ...prev.filter((t) => t !== debounced)];
        writeRecent(next);
        return next.slice(0, 10);
      });
    }
    // setParams identity is stable enough for this effect's purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const results = useAsync(() => searchService.global(debounced), [debounced]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    results.data?.forEach((r) => map.set(r.type, (map.get(r.type) ?? 0) + 1));
    return map;
  }, [results.data]);

  const visible = useMemo(
    () => (filter === "Todo" ? results.data : results.data?.filter((r) => r.type === filter)),
    [results.data, filter],
  );

  const activeFilters = FILTERS.filter((f) => f === "Todo" || counts.has(f));

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca en todo Heseria"
          aria-label="Buscar"
          autoFocus
          enterKeyHint="search"
          className="h-12 rounded-full pl-10 pr-10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground active:bg-secondary"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!debounced.trim() ? (
        <div className="space-y-7">
          {recent.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="size-4 text-muted-foreground" /> Búsquedas recientes
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setRecent([]);
                    writeRecent([]);
                  }}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Borrar
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <Chip key={r} onClick={() => setQuery(r)}>
                    {r}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-muted-foreground" /> Sugerencias
            </h2>
            <div className="flex flex-wrap gap-2">
              {suggestions.data?.map((s) => (
                <Chip key={s} onClick={() => setQuery(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <>
          <div className="scroll-x -mx-4 flex gap-2 px-4">
            {activeFilters.map((f) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f}
                {f !== "Todo" && counts.get(f) ? ` · ${counts.get(f)}` : ""}
              </Chip>
            ))}
          </div>

          {results.loading ? (
            <ListSkeleton />
          ) : !visible?.length ? (
            <EmptyState
              icon={Search}
              title={`Sin resultados para “${debounced}”`}
              description="Revisa la ortografía o prueba con un término más corto. También puedes explorar por categorías."
              actionLabel="Explorar categorías"
              actionHref="/explore"
            />
          ) : (
            <ul className="space-y-1">
              {visible.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <Link
                    to={r.href}
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors active:bg-secondary"
                  >
                    <GenerativeCover
                      seed={r.id}
                      gradient={r.color}
                      className="size-12 shrink-0"
                      rounded="rounded-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.subtitle}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.65rem] text-muted-foreground">
                      {r.type}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
