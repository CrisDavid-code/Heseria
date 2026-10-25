import { BookOpen, ChevronRight, Info, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GenerativeCover } from "@/components/media/covers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Chip, Input, Progress } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { bibleService } from "@/services";
import { preferencesStore, usePreferences } from "@/store";
import { useScreen } from "@/store/screen";
import { cn } from "@/lib/utils";
import type { BibleBook } from "@/types";

function BookGrid({ books, onPick }: { books: BibleBook[]; onPick: (b: BibleBook) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {books.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            onClick={() => onPick(b)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-3 text-left transition-colors active:bg-secondary"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{b.name}</span>
              <span className="text-xs text-muted-foreground">{b.chapters} capítulos</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function BibleIndex() {
  usePageMeta("Biblia", "Lee la Biblia con notas, resaltados y progreso.");
  useScreen({ title: "Biblia" });

  const navigate = useNavigate();
  const { bibleVersion } = usePreferences();
  const books = useAsync(() => bibleService.books(), []);
  const versions = useAsync(() => bibleService.versions(), []);
  const verse = useAsync(() => bibleService.verseOfTheDay(), []);

  const [query, setQuery] = useState("");
  const [chapterFor, setChapterFor] = useState<BibleBook | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);

  const activeVersion = versions.data?.find((v) => v.id === bibleVersion);

  const filtered = useMemo(() => {
    const list = books.data ?? [];
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((b) => b.name.toLowerCase().includes(q));
  }, [books.data, query]);

  const at = filtered.filter((b) => b.testament === "AT");
  const nt = filtered.filter((b) => b.testament === "NT");

  return (
    <div className="space-y-6">
      {/* Version selector + continue reading */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setVersionOpen(true)}
          className="flex flex-1 items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Versión
            </span>
            <span className="block truncate text-sm font-medium">
              {activeVersion?.abbr ?? "HSD"} · {activeVersion?.name ?? "Heseria Demo"}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </div>

      <Link
        to="/bible/juan/3"
        className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 transition-colors active:bg-secondary"
      >
        <GenerativeCover
          seed="continuar-lectura"
          gradient="from-cyan-500/70 to-blue-700/70"
          className="size-14 shrink-0"
          rounded="rounded-xl"
          icon={BookOpen}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
            Continuar leyendo
          </p>
          <p className="mt-0.5 truncate font-display text-base font-semibold">Juan 3</p>
          <Progress value={42} className="mt-2" label="Progreso de lectura: 42 %" />
        </div>
      </Link>

      {verse.data && (
        <div className="surface-card p-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
            Versículo del día
          </p>
          <blockquote className="mt-2 font-display text-base leading-snug" data-selectable>
            “{verse.data.text}”
          </blockquote>
          <p className="mt-2 text-sm text-muted-foreground">{verse.data.ref}</p>
        </div>
      )}

      {/* Book search + list */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar libro"
          aria-label="Buscar libro de la Biblia"
          className="h-11 rounded-full pl-10"
        />
      </div>

      <Tabs defaultValue="at">
        <TabsList>
          <TabsTrigger value="at">Antiguo Testamento</TabsTrigger>
          <TabsTrigger value="nt">Nuevo Testamento</TabsTrigger>
        </TabsList>
        <TabsContent value="at">
          <BookGrid books={at} onPick={setChapterFor} />
        </TabsContent>
        <TabsContent value="nt">
          <BookGrid books={nt} onPick={setChapterFor} />
        </TabsContent>
      </Tabs>

      {/* Chapter picker */}
      <BottomSheet open={Boolean(chapterFor)} onOpenChange={(v) => !v && setChapterFor(null)}>
        <BottomSheetContent
          title={chapterFor?.name ?? ""}
          description="Elige un capítulo"
        >
          <div className="grid grid-cols-6 gap-2 pb-2">
            {Array.from({ length: chapterFor?.chapters ?? 0 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  navigate(`/bible/${chapterFor!.id}/${n}`);
                  setChapterFor(null);
                }}
                className="tap-target grid place-items-center rounded-lg border border-border text-sm tabular-nums transition-colors active:bg-secondary"
              >
                {n}
              </button>
            ))}
          </div>
        </BottomSheetContent>
      </BottomSheet>

      {/* Version picker */}
      <BottomSheet open={versionOpen} onOpenChange={setVersionOpen}>
        <BottomSheetContent
          title="Versión de la Biblia"
          description="Elige la traducción con la que quieres leer."
        >
          <div className="mb-4 flex gap-2.5 rounded-xl border border-warning/30 bg-warning/8 p-3">
            <Info className="size-4 shrink-0 text-warning" />
            <p className="text-xs text-muted-foreground">
              Todas las versiones van dentro de la app y se leen sin conexión. Las versiones
              modernas pertenecen a sus editoriales; su aviso de derechos aparece al leer.
            </p>
          </div>
          <ul className="space-y-1.5">
            {versions.data?.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  disabled={!v.licensed}
                  onClick={() => {
                    preferencesStore.set({ bibleVersion: v.id });
                    setVersionOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors",
                    v.id === bibleVersion
                      ? "border-primary bg-primary/10"
                      : "border-border active:bg-secondary",
                    !v.licensed && "opacity-50",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{v.abbr}</span>
                    <span className="block truncate text-xs text-muted-foreground">{v.name}</span>
                  </span>
                  {v.licensed ? (
                    v.id === bibleVersion && <Badge variant="primary">Actual</Badge>
                  ) : (
                    <Badge variant="outline">Requiere licencia</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </BottomSheetContent>
      </BottomSheet>

      <div className="flex flex-wrap gap-2">
        <Chip onClick={() => navigate("/devotionals")}>Devocionales</Chip>
        <Chip onClick={() => navigate("/plans")}>Planes de lectura</Chip>
        <Chip onClick={() => navigate("/prayer")}>Oración</Chip>
      </div>
    </div>
  );
}
