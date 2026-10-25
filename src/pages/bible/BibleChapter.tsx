import {
  BarChart3, Bookmark, ChevronLeft, ChevronRight, Columns2, Copy, Minus, NotebookPen, Plus,
  Share2, Sun, Type,
} from "lucide-react";
import { ReadingMusic } from "@/components/bible/ReadingMusic";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { DetailSkeleton, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent, SheetAction } from "@/components/ui/overlays";
import { Badge, Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { haptic, share, shareUrl } from "@/native";
import { bibleService, type VerseMark } from "@/services";
import { VerseShareSheet } from "@/components/bible/VerseShare";
import { AnalysisSheet, CompareSheet } from "@/components/bible/StudyTools";
import { preferencesStore, useLibrary, usePreferences } from "@/store";
import { useScreen } from "@/store/screen";
import { cn } from "@/lib/utils";
import { bibleBooks } from "@/store/directory";

const HIGHLIGHT_COLORS = [
  { id: "amarillo", label: "Amarillo", className: "bg-amber-400/30" },
  { id: "verde", label: "Verde", className: "bg-emerald-400/30" },
  { id: "azul", label: "Azul", className: "bg-cyan-400/30" },
  { id: "rosa", label: "Rosa", className: "bg-rose-400/30" },
];

export default function BibleChapter() {
  const { book = "juan", chapter = "1" } = useParams();
  const chapterNumber = Number(chapter) || 1;
  const navigate = useNavigate();
  const { bibleVersion, bibleFontScale, readingMode } = usePreferences();
  const library = useLibrary();

  const meta = bibleBooks.find((b) => b.id === book);
  const data = useAsync(
    () => bibleService.chapter(book, chapterNumber, bibleVersion),
    [book, chapterNumber, bibleVersion],
  );
  const versions = useAsync(() => bibleService.versions(), []);
  const version = versions.data?.find((v) => v.id === data.data?.version);

  const [selected, setSelected] = useState<number | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [shareFor, setShareFor] = useState<number | null>(null);
  const [compareFor, setCompareFor] = useState<number | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  /*
   * Los resaltados, las notas y los versículos guardados viven en la cuenta,
   * no en el teléfono: se ven igual desde cualquier dispositivo.
   */
  const marks = useAsync(
    () => bibleService.marks(book, chapterNumber),
    [book, chapterNumber],
  );
  const byVerse = useMemo(() => {
    const map: Record<number, VerseMark> = {};
    for (const m of marks.data ?? []) map[m.verse] = m;
    return map;
  }, [marks.data]);

  /** Aplica un cambio a la marca de un versículo y refresca. */
  async function updateMark(
    verse: number,
    patch: { color?: string | null; note?: string; saved?: boolean },
  ) {
    try {
      await bibleService.mark(book, chapterNumber, verse, patch);
      marks.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  usePageMeta(
    `${meta?.name ?? "Biblia"} ${chapterNumber}`,
    `Lee ${meta?.name ?? ""} ${chapterNumber} en Heseria.`,
  );

  useScreen(
    {
      title: `${meta?.name ?? "Biblia"} ${chapterNumber}`,
      back: true,
      hideSections: true,
      actions: (
        <button
          type="button"
          onClick={() => setTypeOpen(true)}
          aria-label="Opciones de lectura"
          className="tap-target grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
        >
          <Type className="size-5" />
        </button>
      ),
    },
    [book, chapterNumber],
  );

  const prev = chapterNumber > 1 ? chapterNumber - 1 : null;
  const next = meta && chapterNumber < meta.chapters ? chapterNumber + 1 : null;

  const selectedVerse = useMemo(
    () => data.data?.verses.find((v) => v.number === selected),
    [data.data, selected],
  );

  const reference = `${meta?.name ?? ""} ${chapterNumber}:${selected ?? ""}`;

  async function onShareVerse() {
    if (!selectedVerse) return;
    const how = await share({
      title: reference,
      text: `“${selectedVerse.text}” — ${reference}`,
      url: shareUrl(`/bible/${book}/${chapterNumber}`),
    });
    if (how === "clipboard") toast.success("Versículo copiado");
    setSelected(null);
  }

  if (data.loading) return <DetailSkeleton />;
  if (data.error || !data.data) {
    return <ErrorState onRetry={data.reload} />;
  }

  return (
    <div className={cn(readingMode && "mx-auto max-w-prose")}>
      <ReadingMusic />
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {data.data.bookName} {chapterNumber}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {version?.name ?? data.data.version.toUpperCase()} · {data.data.verses.length} versículos
          </p>
        </div>
        <Badge variant="outline">{meta?.testament === "AT" ? "Antiguo" : "Nuevo"}</Badge>
      </div>

      <article
        className="space-y-1"
        style={{ fontSize: `${bibleFontScale}rem`, lineHeight: 1.75 }}
        data-selectable
      >
        {/* Un versículo vacío va unido al anterior en el original (TLA). */}
        {data.data.verses.filter((v) => v.text).map((v) => (
          <p
            key={v.number}
            onClick={() => {
              haptic("light");
              setSelected(v.number);
            }}
            className={cn(
              "cursor-pointer rounded-lg px-1.5 py-1 transition-colors",
              byVerse[v.number]?.color &&
                HIGHLIGHT_COLORS.find((c) => c.id === byVerse[v.number].color)?.className,
              selected === v.number && "bg-primary/12 ring-1 ring-primary/30",
            )}
          >
            <sup className="mr-1.5 select-none text-[0.62em] font-semibold text-primary">
              {v.number}
            </sup>
            {v.text}
          </p>
        ))}
      </article>

      {version?.copyright && (
        <p className="mt-6 text-[0.7rem] text-muted-foreground">{version.copyright}</p>
      )}

      {/* Chapter navigation */}
      <nav className="mt-8 flex items-center justify-between gap-3">
        {prev ? (
          <Button asChild variant="outline" className="flex-1">
            <Link to={`/bible/${book}/${prev}`}>
              <ChevronLeft className="size-4" /> Capítulo {prev}
            </Link>
          </Button>
        ) : (
          <span className="flex-1" />
        )}
        {next ? (
          <Button asChild variant="outline" className="flex-1">
            <Link to={`/bible/${book}/${next}`}>
              Capítulo {next} <ChevronRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <span className="flex-1" />
        )}
      </nav>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/bible")}>
          Todos los libros
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate("/devotionals")}>
          Devocional de hoy
        </Button>
      </div>

      {/* Verse actions */}
      <BottomSheet open={selected !== null} onOpenChange={(v) => !v && setSelected(null)}>
        <BottomSheetContent title={reference} description={selectedVerse?.text}>
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resaltar
            </p>
            <div className="flex gap-2.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Resaltar en ${c.label}`}
                  onClick={() => {
                    if (selected === null) return;
                    // Volver a tocar el mismo color lo quita.
                    const actual = byVerse[selected]?.color;
                    void updateMark(selected, { color: actual === c.id ? null : c.id });
                    haptic("success");
                    setSelected(null);
                  }}
                  className={cn(
                    "tap-target flex-1 rounded-xl border border-border transition-transform active:scale-95",
                    c.className,
                  )}
                />
              ))}
            </div>
          </div>

          <div className="space-y-0.5">
            <SheetAction
              icon={NotebookPen}
              label="Añadir nota"
              onClick={() => {
                setNoteFor(selected);
                setSelected(null);
              }}
            />
            <SheetAction
              icon={Bookmark}
              label={
                selected !== null && byVerse[selected]?.saved
                  ? "Quitar de guardados"
                  : "Guardar versículo"
              }
              onClick={() => {
                if (selected === null) return;
                const guardado = Boolean(byVerse[selected]?.saved);
                void updateMark(selected, { saved: !guardado });
                toast.success(guardado ? "Quitado de guardados." : "Guardado en tu biblioteca.");
                setSelected(null);
              }}
            />
            <SheetAction
              icon={Columns2}
              label="Comparar versiones"
              description="El mismo versículo en otras traducciones"
              onClick={() => {
                setCompareFor(selected);
                setSelected(null);
              }}
            />
            <SheetAction
              icon={Copy}
              label="Copiar"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`“${selectedVerse?.text}” — ${reference}`);
                  toast.success("Copiado al portapapeles");
                } catch {
                  toast.error("No pudimos copiar");
                }
                setSelected(null);
              }}
            />
            <SheetAction
              icon={Share2}
              label="Compartir"
              description="Como texto o como imagen"
              onClick={() => {
                setShareFor(selected);
                setSelected(null);
              }}
            />
          </div>
        </BottomSheetContent>
      </BottomSheet>

      {/* Compartir: texto o imagen, al chat o a otras apps. */}
      {shareFor !== null && (
        <VerseShareSheet
          open={shareFor !== null}
          onOpenChange={(v) => !v && setShareFor(null)}
          text={data.data.verses.find((v) => v.number === shareFor)?.text ?? ""}
          reference={`${meta?.name ?? ""} ${chapterNumber}:${shareFor}`}
        />
      )}

      {/* Comparación entre versiones. */}
      {compareFor !== null && (
        <CompareSheet
          open={compareFor !== null}
          onOpenChange={(v) => !v && setCompareFor(null)}
          book={book}
          chapter={chapterNumber}
          verse={compareFor}
        />
      )}

      {/* Análisis del capítulo. */}
      <AnalysisSheet
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        book={book}
        chapter={chapterNumber}
        onGoToVerse={(v) => {
          setAnalysisOpen(false);
          setSelected(v);
        }}
      />

      {/* Note editor */}
      <BottomSheet open={noteFor !== null} onOpenChange={(v) => !v && setNoteFor(null)}>
        <BottomSheetContent
          title="Nueva nota"
          description={`${meta?.name} ${chapterNumber}:${noteFor ?? ""}`}
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="¿Qué te dice este versículo hoy?"
            className="min-h-32"
            autoFocus
          />
          <Button
            full
            size="lg"
            className="mt-4"
            disabled={!note.trim()}
            onClick={() => {
              if (noteFor !== null) void updateMark(noteFor, { note });
              toast.success("Nota guardada");
              setNote("");
              setNoteFor(null);
            }}
          >
            Guardar nota
          </Button>
        </BottomSheetContent>
      </BottomSheet>

      {/* Reading preferences */}
      <BottomSheet open={typeOpen} onOpenChange={setTypeOpen}>
        <BottomSheetContent title="Opciones de lectura">
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Tamaño del texto</p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(bibleFontScale * 100)} %
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Minus className="size-4 shrink-0 text-muted-foreground" />
              <Slider
                value={[bibleFontScale * 100]}
                min={80}
                max={160}
                step={5}
                onValueChange={([v]) => preferencesStore.set({ bibleFontScale: v / 100 })}
                aria-label="Tamaño del texto"
              />
              <Plus className="size-4 shrink-0 text-muted-foreground" />
            </div>
          </div>

          <SheetAction
            icon={Sun}
            label="Modo lectura"
            description="Ancho de línea cómodo y menos distracciones"
            onClick={() => {
              preferencesStore.set({ readingMode: !readingMode });
              toast.success(readingMode ? "Modo lectura desactivado" : "Modo lectura activado");
            }}
            trailing={
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
                  readingMode ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
                )}
              >
                {readingMode ? "Activo" : "Inactivo"}
              </span>
            }
          />
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
