import {
  BarChart3, Bookmark, Brain, ChevronLeft, ChevronRight, Columns2, Copy, Minus, NotebookPen, Plus,
  Pause, Play, Share2, Sun, Type, Volume2, X,
} from "lucide-react";
import { SpeechBar } from "@/components/bible/SpeechBar";
import { speechSupported, useSpeech } from "@/hooks/useSpeech";
import { ReadingMusic } from "@/components/bible/ReadingMusic";
import { PlanBar } from "@/components/bible/PlanBar";
import { useEffect, useMemo, useState } from "react";
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
import { bibleService, memoryService, readingStateService, type VerseMark } from "@/services";
import { VerseShareSheet } from "@/components/bible/VerseShare";
import { AnalysisSheet, CompareSheet } from "@/components/bible/StudyTools";
import { preferencesStore, useLibrary, usePreferences } from "@/store";
import { useScreen } from "@/store/screen";
import { cn } from "@/lib/utils";
import { bibleBooks } from "@/store/directory";
import { useCoupleSync } from "@/lib/couple-sync";

const bookName = (id: string) => bibleBooks.find((b) => b.id === id)?.name ?? id;

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

  const [sel, setSel] = useState<number[]>([]);
  const [typeOpen, setTypeOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<number[] | null>(null);
  const [note, setNote] = useState("");
  const [shareFor, setShareFor] = useState<{ text: string; reference: string; link: string } | null>(null);
  const [compareFor, setCompareFor] = useState<number | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // Lectura en voz alta, versículo por versículo (el que suena se resalta).
  const spoken = useMemo(() => (data.data?.verses ?? []).filter((v) => v.text), [data.data]);
  const speechParts = useMemo(() => spoken.map((v) => v.text), [spoken]);
  const speech = useSpeech(speechParts);
  const speakingVerse = speech.state === "playing" ? spoken[speech.index]?.number : null;

  useCoupleSync(book, chapterNumber, bookName);

  // «Continuar leyendo»: se guarda dónde se quedó, en el teléfono y en la cuenta.
  useEffect(() => {
    if (data.data) readingStateService.save({ book, chapter: chapterNumber, verse: 1, version: data.data.version });
  }, [book, chapterNumber, data.data]);

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

  /** «Juan 3:16-18» o «Juan 3:16, 18, 20». */
  const refOf = (nums: number[]) => {
    const n = [...nums].sort((x, y) => x - y);
    const runs: string[] = [];
    for (let i = 0; i < n.length; i++) {
      let j = i;
      while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
      runs.push(i === j ? `${n[i]}` : `${n[i]}-${n[j]}`);
      i = j;
    }
    return `${meta?.name ?? ""} ${chapterNumber}:${runs.join(", ")}`;
  };
  const selSorted = [...sel].sort((x, y) => x - y);
  const selText = selSorted.map((n) => data.data?.verses.find((v) => v.number === n)?.text ?? "").join(" ");
  const reference = refOf(sel);
  const clear = () => setSel([]);
  const allSaved = sel.length > 0 && sel.every((n) => byVerse[n]?.saved);

  async function markAll(patch: { color?: string | null; saved?: boolean; note?: string }) {
    try {
      for (const n of selSorted) await bibleService.mark(book, chapterNumber, n, patch);
      marks.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  if (data.loading) return <DetailSkeleton />;
  if (data.error || !data.data) {
    return <ErrorState onRetry={data.reload} />;
  }

  return (
    <div className={cn(readingMode && "mx-auto max-w-prose")}>
      <PlanBar book={book} chapter={chapterNumber} />
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

      <SpeechBar speech={speech} label="Escuchar capítulo" />

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
              setSel((cur) => (cur.includes(v.number) ? cur.filter((x) => x !== v.number) : [...cur, v.number]));
            }}
            className={cn(
              "cursor-pointer rounded-lg px-1.5 py-1 transition-colors",
              byVerse[v.number]?.color &&
                HIGHLIGHT_COLORS.find((c) => c.id === byVerse[v.number].color)?.className,
              sel.includes(v.number) && "bg-primary/12 ring-1 ring-primary/30",
              speakingVerse === v.number && "bg-primary/15",
            )}
            aria-current={speakingVerse === v.number ? "true" : undefined}
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
            <Link replace to={`/bible/${book}/${prev}`}>
              <ChevronLeft className="size-4" /> Capítulo {prev}
            </Link>
          </Button>
        ) : (
          <span className="flex-1" />
        )}
        {next ? (
          <Button asChild variant="outline" className="flex-1">
            <Link replace to={`/bible/${book}/${next}`}>
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

      {/* Barra fija de lectura: escuchar y pasar de capítulo sin subir ni bajar. */}
      {sel.length === 0 && (
        <div className="sticky bottom-2 z-20 mt-4 flex items-center gap-2 rounded-full border border-border bg-surface/95 p-1.5 shadow-lg backdrop-blur">
          {speechSupported() && (
            <button
              type="button"
              onClick={() => (speech.state === "playing" ? speech.pause() : speech.play())}
              aria-label={speech.state === "playing" ? "Pausar lectura" : "Escuchar capítulo"}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
            >
              {speech.state === "playing" ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center rounded-full bg-surface-2">
            <button type="button" disabled={!prev} onClick={() => prev && navigate(`/bible/${book}/${prev}`, { replace: true })} aria-label="Capítulo anterior" className="tap-target grid place-items-center disabled:opacity-30">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => navigate("/bible")} className="min-w-0 flex-1 truncate text-center text-sm font-medium">
              {meta?.name} {chapterNumber}
            </button>
            <button type="button" disabled={!next} onClick={() => next && navigate(`/bible/${book}/${next}`, { replace: true })} aria-label="Capítulo siguiente" className="tap-target grid place-items-center disabled:opacity-30">
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      )}

      {/* Acciones sobre los versículos marcados: barra compacta, no tapa la lectura. */}
      {sel.length > 0 && (
        <div className="sticky bottom-2 z-20 mt-4 rounded-2xl border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{reference}</p>
            <div className="flex gap-1.5" role="group" aria-label="Resaltar">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Resaltar en ${c.label}`}
                  onClick={() => {
                    const off = sel.every((n) => byVerse[n]?.color === c.id);
                    void markAll({ color: off ? null : c.id });
                    haptic("success");
                    clear();
                  }}
                  className={cn("size-7 rounded-full border border-border", c.className)}
                />
              ))}
            </div>
            <button type="button" aria-label="Quitar selección" onClick={clear} className="tap-target grid place-items-center rounded-full text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>
          <div className="scroll-x flex gap-1">
            {[
              { icon: Bookmark, label: allSaved ? "Quitar" : "Guardar", run: () => { void markAll({ saved: !allSaved }); toast.success(allSaved ? "Quitado de guardados" : "Guardado en tu biblioteca"); clear(); } },
              { icon: NotebookPen, label: "Nota", run: () => { setNoteFor(selSorted); clear(); } },
              { icon: Share2, label: "Compartir", run: () => { setShareFor({ text: selText, reference, link: `/v/${book}.${chapterNumber}.${selSorted[0]}` }); clear(); } },
              { icon: Copy, label: "Copiar", run: async () => {
                try { await navigator.clipboard.writeText(`“${selText}” — ${reference}`); toast.success("Copiado"); } catch { toast.error("No pudimos copiar"); }
                clear();
              } },
              { icon: Volume2, label: "Escuchar", run: () => { const i = spoken.findIndex((v) => v.number === selSorted[0]); clear(); if (i >= 0) speech.playAt(i); } },
              { icon: Brain, label: "Memorizar", run: async () => {
                try {
                  for (const n of selSorted) {
                    const t = data.data!.verses.find((v) => v.number === n)?.text ?? "";
                    await memoryService.add({ ref: refOf([n]), book, chapter: chapterNumber, verse: n, version: data.data!.version, text: t });
                  }
                  toast.success(sel.length > 1 ? "Versículos agregados a Memorizar" : "Agregado a Memorizar");
                } catch (err) { toast.error(err instanceof Error ? err.message : "No se pudo guardar."); }
                clear();
              } },
              ...(sel.length === 1 ? [{ icon: Columns2, label: "Comparar", run: () => { setCompareFor(sel[0]); clear(); } }] : []),
            ].map((a) => (
              <button key={a.label} type="button" onClick={() => void a.run()} className="flex min-w-16 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.7rem] text-muted-foreground active:bg-secondary">
                <a.icon className="size-4 text-foreground" /> {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Compartir: texto o imagen, al chat o a otras apps. */}
      {shareFor !== null && (
        <VerseShareSheet
          open={shareFor !== null}
          onOpenChange={(v) => !v && setShareFor(null)}
          text={shareFor.text}
          reference={shareFor.reference}
          link={shareFor.link}
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
          setSel([v]);
        }}
      />

      {/* Note editor */}
      <BottomSheet open={noteFor !== null} onOpenChange={(v) => !v && setNoteFor(null)}>
        <BottomSheetContent
          title="Nueva nota"
          description={noteFor ? refOf(noteFor) : ""}
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
              if (noteFor) void Promise.all(noteFor.map((n) => bibleService.mark(book, chapterNumber, n, { note }))).then(() => marks.reload());
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
