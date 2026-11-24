/**
 * Lectura compartida dentro de la videollamada de pareja: el mismo capítulo para los dos
 * (couples/{id}.passage, en vivo), cambiar de capítulo o de libro, y escribir una nota
 * compartida sin colgar.
 */
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SimpleSelect } from "@/components/ui/controls";
import { useAsync } from "@/hooks/useAsync";
import { bibleService, coupleService, type Couple } from "@/services";
import { books } from "@/services/bible";

/** La pareja si la llamada es con ella; si no, null (no se muestran las herramientas). */
export function useCallCouple(peerId: string | undefined) {
  const [couple, setCouple] = useState<Couple | null>(null);
  useEffect(() => {
    if (!peerId) return;
    let stop: (() => void) | undefined;
    void coupleService.mine().then((c) => {
      if (!c || !c.members.includes(peerId)) return;
      stop = coupleService.watch(c.id, setCouple);
    }, () => undefined);
    return () => stop?.();
  }, [peerId]);
  return couple;
}

export function CallReading({ couple }: { couple: Couple }) {
  const list = useAsync(() => books(), []);
  const book = couple.passage?.book ?? "juan";
  const chapter = couple.passage?.chapter ?? 1;
  const data = useAsync(() => bibleService.chapter(book, chapter), [book, chapter]);
  const max = list.data?.find((b) => b.id === book)?.chapters ?? 1;
  const [note, setNote] = useState("");

  const go = (b: string, c: number) => void coupleService.setPassage(couple.id, b, Math.min(Math.max(c, 1), list.data?.find((x) => x.id === b)?.chapters ?? 150)).catch(() => toast.error("No se pudo cambiar el pasaje."));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button type="button" aria-label="Capítulo anterior" disabled={chapter <= 1} onClick={() => go(book, chapter - 1)} className="tap-target grid place-items-center disabled:opacity-30">
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <SimpleSelect value={book} onValueChange={(b) => go(b, 1)} options={(list.data ?? []).map((b) => ({ value: b.id, label: b.name }))} ariaLabel="Libro" />
        </div>
        <span className="text-sm tabular-nums">{chapter}</span>
        <button type="button" aria-label="Capítulo siguiente" disabled={chapter >= max} onClick={() => go(book, chapter + 1)} className="tap-target grid place-items-center disabled:opacity-30">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[0.95rem] leading-relaxed" data-selectable>
        {data.loading ? <p className="text-muted-foreground">Cargando…</p> : data.data?.verses.filter((v) => v.text).map((v) => (
          <p key={v.number} className="mb-1"><sup className="mr-1 text-[0.65em] font-semibold text-primary">{v.number}</sup>{v.text}</p>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          void coupleService.addNote(couple, note, `${data.data?.bookName ?? book} ${chapter}`).then(() => { setNote(""); toast.success("Nota compartida"); }, () => toast.error("No se pudo guardar."));
        }}
      >
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota para los dos…" className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3 text-sm" maxLength={4000} />
        <button type="submit" aria-label="Guardar nota" className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"><Send className="size-4" /></button>
      </form>
    </div>
  );
}
