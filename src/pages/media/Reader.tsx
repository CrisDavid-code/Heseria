/**
 * Lector de libros: EPUB, PDF y TXT. Los archivos que la persona abre se quedan en su teléfono
 * (src/lib/shelf.ts) con la posición y los marcadores; la «Biblioteca» muestra los libros de
 * dominio público o con licencia que publica la administración.
 */
import { Bookmark as BookmarkIcon, BookOpen, ChevronLeft, ChevronRight, FileUp, Library, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { formatOf, shelf, type ShelfBook } from "@/lib/shelf";
import { bookService, type CatalogBook } from "@/services";
import { useScreen } from "@/store/screen";

export default function Reader() {
  usePageMeta("Lector", "Libros cristianos para leer en tu teléfono.");
  const [book, setBook] = useState<ShelfBook | null>(null);
  useScreen({ title: book ? book.title : "Lector", back: true, hideSections: Boolean(book) });
  return book ? <Viewer book={book} onClose={() => setBook(null)} /> : <Shelf onOpen={setBook} />;
}

/* ---------------------------------------------------------------- estante */

function Shelf({ onOpen }: { onOpen: (b: ShelfBook) => void }) {
  const mine = useAsync(() => shelf.all(), []);
  const catalog = useAsync(() => bookService.list(), []);
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function add(data: Blob, title: string, format: ShelfBook["format"], id: string = crypto.randomUUID()) {
    const b: ShelfBook = { id, title, format, data, position: "", bookmarks: [], openedAt: Date.now() };
    await shelf.put(b).catch(() => toast.error("No hay espacio para guardarlo en este teléfono."));
    onOpen(b);
  }

  async function fromFile(f: File) {
    const format = formatOf(f.name, f.type);
    if (!format) return void toast.error("Formato no compatible. Usa EPUB, PDF o TXT.");
    await add(f, f.name.replace(/\.(epub|pdf|txt)$/i, ""), format);
  }

  async function fromCatalog(c: CatalogBook) {
    const saved = await shelf.get(`cat-${c.id}`);
    if (saved) return onOpen({ ...saved, openedAt: Date.now() });
    setLoading(c.id);
    try {
      const res = await fetch(c.url);
      if (!res.ok) throw new Error();
      await add(await res.blob(), c.title, c.format, `cat-${c.id}`);
    } catch {
      toast.error("No se pudo descargar el libro. Revisa tu conexión.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      <input ref={input} type="file" accept=".epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void fromFile(f); }} />
      <Button full onClick={() => input.current?.click()}><FileUp className="size-4" /> Abrir un libro de mi teléfono</Button>

      <section className="space-y-2">
        <h3 className="font-medium">Mis libros</h3>
        {mine.loading ? <ListSkeleton count={2} /> : !mine.data?.length ? (
          <p className="text-sm text-muted-foreground">Los libros que abras se guardan solo en este teléfono, con tu avance y marcadores.</p>
        ) : (
          <ul className="space-y-2">
            {mine.data.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-2xl border border-border p-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen({ ...b, openedAt: Date.now() })}>
                  <p className="truncate font-medium">{b.title}</p>
                  <p className="text-xs uppercase text-muted-foreground">{b.format}{b.bookmarks.length > 0 && ` · ${b.bookmarks.length} marcadores`}</p>
                </button>
                <button type="button" aria-label="Quitar del teléfono" onClick={() => confirm(`¿Quitar «${b.title}» de este teléfono?`) && void shelf.remove(b.id).then(mine.reload)}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-medium"><Library className="size-4" /> Biblioteca</h3>
        {catalog.loading ? <ListSkeleton count={2} /> : !catalog.data?.length ? (
          <EmptyState icon={BookOpen} title="Biblioteca en preparación" description="Pronto habrá libros cristianos de dominio público. Mientras tanto, abre los tuyos." />
        ) : (
          <ul className="space-y-2">
            {catalog.data.map((c) => (
              <li key={c.id}>
                <button type="button" disabled={loading === c.id} onClick={() => void fromCatalog(c)} className="w-full rounded-2xl border border-border p-3 text-left">
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.author} · {c.format.toUpperCase()} · {c.license}</p>
                  {loading === c.id && <p className="text-xs text-primary">Descargando…</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- visor */

interface Engine { next(): void; prev(): void; go(at: string): void; label: string; zoom(delta: number): void; destroy(): void }

function Viewer({ book, onClose }: { book: ShelfBook; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [state, setState] = useState({ at: book.position, label: "" });
  const [marks, setMarks] = useState(book.bookmarks);
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState(false);

  // Guarda la posición en cada cambio.
  useEffect(() => {
    void shelf.put({ ...book, position: state.at, bookmarks: marks, openedAt: Date.now() }).catch(() => undefined);
  }, [book, state.at, marks]);

  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    const onMove = (at: string, label: string) => alive && setState({ at, label });
    const start = book.format === "pdf" ? pdfEngine : book.format === "epub" ? epubEngine : txtEngine;
    start(host.current, book.data, book.position, onMove).then(
      (e) => { if (alive) engine.current = e; else e.destroy(); },
      () => alive && setError(true),
    );
    return () => { alive = false; engine.current?.destroy(); engine.current = null; };
  }, [book]);

  if (error) return <EmptyState icon={BookOpen} title="No se pudo abrir el libro" description="El archivo puede estar dañado o protegido (DRM)." actionLabel="Volver" onAction={onClose} />;

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-2">
      <div ref={host} className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-white text-black" />
      <div className="flex items-center gap-1">
        <Button size="icon" variant="outline" aria-label="Anterior" onClick={() => engine.current?.prev()}><ChevronLeft className="size-4" /></Button>
        <p className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">{state.label}</p>
        <Button size="icon" variant="ghost" aria-label="Letra más pequeña" onClick={() => engine.current?.zoom(-1)}><Minus className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Letra más grande" onClick={() => engine.current?.zoom(1)}><Plus className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Marcadores" onClick={() => setSheet(true)}><BookmarkIcon className="size-4" /></Button>
        <Button size="icon" variant="outline" aria-label="Siguiente" onClick={() => engine.current?.next()}><ChevronRight className="size-4" /></Button>
      </div>

      <BottomSheet open={sheet} onOpenChange={setSheet}>
        <BottomSheetContent title="Marcadores">
          <div className="space-y-2">
            <Button full onClick={() => { setMarks([...marks, { at: state.at, label: state.label || "Marcador", createdAt: Date.now() }]); toast.success("Marcador guardado"); }}>
              <BookmarkIcon className="size-4" /> Marcar aquí
            </Button>
            {marks.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay marcadores.</p> : marks.map((m) => (
              <div key={m.createdAt} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 text-sm">
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => { engine.current?.go(m.at); setSheet(false); }}>{m.label}</button>
                <button type="button" aria-label="Borrar marcador" onClick={() => setMarks(marks.filter((x) => x !== m))}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

type Move = (at: string, label: string) => void;

async function pdfEngine(host: HTMLElement, data: Blob, at: string, onMove: Move): Promise<Engine> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await data.arrayBuffer()) }).promise;
  const canvas = document.createElement("canvas");
  canvas.className = "mx-auto";
  host.replaceChildren(canvas);
  let page = Math.min(Math.max(Number(at) || 1, 1), doc.numPages);
  let zoom = 1;
  let task: { cancel(): void } | null = null;
  let gone = false;
  const render = () => draw().catch(() => undefined); // al cerrar a media página, pdf.js rechaza: no es una falla
  const draw = async () => {
    task?.cancel();
    const p = await doc.getPage(page);
    if (gone) return;
    const base = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({ scale: ((host.clientWidth - 8) / base.width) * zoom * devicePixelRatio });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / devicePixelRatio}px`;
    const r = p.render({ canvasContext: canvas.getContext("2d")!, viewport });
    task = r;
    await r.promise.catch(() => undefined);
    if (gone) return;
    host.scrollTop = 0;
    onMove(String(page), `Página ${page} de ${doc.numPages}`);
  };
  void render();
  const go = (n: number) => { page = Math.min(Math.max(n, 1), doc.numPages); void render(); };
  return {
    label: "", next: () => go(page + 1), prev: () => go(page - 1), go: (a) => go(Number(a)),
    zoom: (d) => { zoom = Math.min(Math.max(zoom + d * 0.25, 0.5), 3); void render(); },
    destroy: () => { gone = true; task?.cancel(); void doc.destroy(); },
  };
}

async function epubEngine(host: HTMLElement, data: Blob, at: string, onMove: Move): Promise<Engine> {
  const { default: ePub } = await import("epubjs");
  const book = ePub(await data.arrayBuffer());
  const rendition = book.renderTo(host, { width: "100%", height: "100%", flow: "paginated", spread: "none" });
  let size = 100;
  rendition.on("relocated", (loc: { start: { cfi: string; displayed: { page: number; total: number } } }) =>
    onMove(loc.start.cfi, `Página ${loc.start.displayed.page} de ${loc.start.displayed.total} (capítulo)`));
  await rendition.display(at || undefined);
  return {
    label: "", next: () => void rendition.next(), prev: () => void rendition.prev(), go: (a) => void rendition.display(a),
    zoom: (d) => { size = Math.min(Math.max(size + d * 10, 70), 200); rendition.themes.fontSize(`${size}%`); },
    destroy: () => book.destroy(),
  };
}

async function txtEngine(host: HTMLElement, data: Blob, at: string, onMove: Move): Promise<Engine> {
  const pre = document.createElement("div");
  pre.className = "whitespace-pre-wrap p-4 font-serif leading-relaxed";
  pre.textContent = await data.text();
  host.replaceChildren(pre);
  let size = 16;
  pre.style.fontSize = `${size}px`;
  const report = () => {
    const pct = Math.round((host.scrollTop / Math.max(1, host.scrollHeight - host.clientHeight)) * 100);
    onMove(String(host.scrollTop), `${pct}%`);
  };
  host.scrollTop = Number(at) || 0;
  host.addEventListener("scroll", report, { passive: true });
  report();
  const step = () => host.clientHeight * 0.9;
  return {
    label: "", next: () => host.scrollBy({ top: step(), behavior: "smooth" }), prev: () => host.scrollBy({ top: -step(), behavior: "smooth" }),
    go: (a) => { host.scrollTop = Number(a) || 0; },
    zoom: (d) => { size = Math.min(Math.max(size + d * 2, 12), 32); pre.style.fontSize = `${size}px`; },
    destroy: () => host.removeEventListener("scroll", report),
  };
}
