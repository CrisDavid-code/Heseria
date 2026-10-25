/**
 * HESERIA — Herramientas de estudio.
 *
 * Dos cosas que pide cualquiera que lee en serio: ver el mismo versículo en
 * otras traducciones, y hacerse una idea del capítulo antes de entrar.
 */
import { BarChart3, BookOpen, Clock, Quote, Users } from "lucide-react";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge } from "@/components/ui/primitives";
import { ListSkeleton } from "@/components/states";
import { useAsync } from "@/hooks/useAsync";
import { bibleService } from "@/services";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------- comparación */

export function CompareSheet({
  open,
  onOpenChange,
  book,
  chapter,
  verse,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  book: string;
  chapter: number;
  verse: number;
}) {
  const data = useAsync(() => bibleService.compare(book, chapter, verse), [book, chapter, verse]);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title="Comparar versiones"
        description={data.data?.ref ?? `Versículo ${verse}`}
        fullScreen
      >
        <div className="mx-auto max-w-md pb-4">
          {data.loading ? (
            <ListSkeleton />
          ) : (
            <>
              <ul className="space-y-3">
                {data.data?.versions.map((version) => (
                  <li key={version.id} className="surface-card p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-display text-sm font-semibold">
                        {version.abbreviation}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {version.name}
                      </span>
                      {!version.licensed && <Badge variant="outline">Sin licencia</Badge>}
                    </div>
                    <p className="text-sm leading-relaxed" data-selectable>
                      {version.text}
                    </p>
                  </li>
                ))}
              </ul>

              {/*
                Decirlo claro evita que alguien concluya que las traducciones
                coinciden palabra por palabra, que no es el caso en la realidad.
              */}
              <p className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-3.5 text-xs leading-relaxed text-muted-foreground">
                Ahora mismo todas muestran el mismo texto de demostración, así que la comparación
                enseña cómo funciona pero no diferencias reales. En cuanto se conecte una API con
                licencia, cada versión traerá su propia traducción.
              </p>
            </>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/* ---------------------------------------------------------- análisis */

export function AnalysisSheet({
  open,
  onOpenChange,
  book,
  chapter,
  onGoToVerse,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  book: string;
  chapter: number;
  onGoToVerse?: (verse: number) => void;
}) {
  const data = useAsync(() => bibleService.analysis(book, chapter), [book, chapter]);
  const a = data.data;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title="Análisis del capítulo"
        description={a ? `${a.bookName} ${a.chapter}` : undefined}
        fullScreen
      >
        <div className="mx-auto max-w-md pb-4">
          {data.loading || !a ? (
            <ListSkeleton />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat icon={BookOpen} label="Versículos" value={String(a.verses)} />
                <Stat icon={Quote} label="Palabras" value={a.words.toLocaleString("es")} />
                <Stat
                  icon={Clock}
                  label="Lectura"
                  value={`${a.readingMinutes} min`}
                />
                <Stat icon={BarChart3} label="Más largo" value={`v. ${a.longestVerse}`} />
              </div>

              {a.frequent.length > 0 && (
                <section className="mt-5">
                  <h3 className="text-sm font-semibold">Palabras que más se repiten</h3>
                  <ul className="mt-2 space-y-1.5">
                    {a.frequent.map((w) => {
                      const max = a.frequent[0].count || 1;
                      return (
                        <li key={w.word} className="flex items-center gap-2.5">
                          <span className="w-28 shrink-0 truncate text-sm">{w.word}</span>
                          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${(w.count / max) * 100}%` }}
                            />
                          </span>
                          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {w.count}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section className="mt-5">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Users className="size-3.5 text-primary" /> Lo que más marca la comunidad
                </h3>
                {a.popular.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Todavía nadie ha resaltado nada en este capítulo. Sé la primera persona.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {a.popular.map((p) => (
                      <li key={p.verse}>
                        <button
                          type="button"
                          onClick={() => onGoToVerse?.(p.verse)}
                          className={cn(
                            "w-full rounded-xl border border-border p-3 text-left transition-colors",
                            onGoToVerse && "active:bg-secondary",
                          )}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-semibold text-primary">
                              Versículo {p.verse}
                            </span>
                            <span className="text-[0.68rem] text-muted-foreground">
                              {p.marks} {p.marks === 1 ? "marca" : "marcas"}
                            </span>
                          </span>
                          <span className="mt-1 block text-sm leading-snug clamp-2">{p.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                Son datos del texto, no interpretación. Para entender un pasaje no hay atajo:
                leerlo entero, ver su contexto y contrastarlo.
              </p>
            </>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="surface-card p-3.5">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 font-display text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
