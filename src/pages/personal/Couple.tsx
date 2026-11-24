/**
 * HESERIA Parejas: vinculación por código privado, lectura sincronizada, notas compartidas y
 * videollamada (la misma WebRTC de Mensajes: el navegador pide permiso de cámara y micrófono
 * y nada se graba). Las notas privadas siguen en «Mi diario».
 */
import { BookOpen, Copy, HeartHandshake, Link2Off, Lock, Phone, Send, Trash2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { SimpleSelect, Switch } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { coupleSync, setCoupleSync } from "@/lib/couple-sync";
import { coupleService, messageService, type Couple as CoupleT } from "@/services";
import { books } from "@/services/bible";
import { startCall } from "@/store/call";
import { useSession } from "@/store";
import { useScreen } from "@/store/screen";
import { timeAgo } from "@/lib/utils";

export default function Couple() {
  usePageMeta("Pareja", "Crezcan juntos en la Palabra.");
  useScreen({ title: "Pareja", back: true });
  const mine = useAsync(() => coupleService.mine(), []);
  const [live, setLive] = useState<CoupleT | null>(null);

  useEffect(() => {
    if (!mine.data) return setLive(null);
    return coupleService.watch(mine.data.id, setLive);
  }, [mine.data]);

  if (mine.loading) return <ListSkeleton count={3} />;
  if (mine.error) return <ErrorState onRetry={mine.reload} />;
  const couple = live ?? mine.data;
  return couple ? <Together couple={couple} onUnlinked={mine.reload} /> : <Link_ onLinked={mine.reload} />;
}

/* ---------------------------------------------------------- sin pareja */

function Link_({ onLinked }: { onLinked: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      setCode(await coupleService.invite());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el código.");
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    setBusy(true);
    try {
      await coupleService.accept(input);
      toast.success("¡Quedaron vinculados!");
      onLinked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo usar el código.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface-2 p-4 text-center">
        <HeartHandshake className="mx-auto size-10 text-primary" />
        <h2 className="mt-2 font-display text-lg font-semibold">Lean la Biblia en pareja</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          «Cordón de tres dobleces no se rompe pronto» (Eclesiastés 4:12). Vincúlense con un código privado:
          solo ustedes dos verán lo que compartan.
        </p>
      </div>

      <section className="space-y-2 rounded-2xl border border-border p-4">
        <h3 className="font-medium">1. Invita a tu pareja</h3>
        {code ? (
          <>
            <p className="text-center font-mono text-2xl tracking-widest">{code}</p>
            <p className="text-center text-xs text-muted-foreground">Vence en 7 días y sirve una sola vez.</p>
            <div className="flex gap-2">
              <Button full variant="outline" onClick={() => void navigator.clipboard.writeText(code).then(() => toast.success("Código copiado"))}>
                <Copy className="size-4" /> Copiar
              </Button>
              <Button full variant="ghost" onClick={() => void coupleService.revoke(code).then(() => { setCode(null); toast.success("Código anulado"); })}>
                Anular
              </Button>
            </div>
          </>
        ) : (
          <Button full loading={busy} onClick={() => void create()}>Crear código</Button>
        )}
      </section>

      <section className="space-y-2 rounded-2xl border border-border p-4">
        <h3 className="font-medium">2. ¿Te enviaron un código?</h3>
        <Field label="Código de tu pareja" htmlFor="c-code">
          <Input id="c-code" value={input} maxLength={8} autoCapitalize="characters" onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="ABCD2345" />
        </Field>
        <Button full variant="outline" loading={busy} disabled={input.trim().length !== 8} onClick={() => void accept()}>
          Aceptar invitación
        </Button>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ en pareja */

function Together({ couple, onUnlinked }: { couple: CoupleT; onUnlinked: () => void }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const partnerId = couple.members.find((m) => m !== user.id) ?? "";
  const partner = couple.names[partnerId] || "Tu pareja";
  const bookList = useAsync(() => books(), []);
  const notes = useAsync(() => coupleService.notes(couple), [couple.id]);
  const [sync, setSync] = useState(coupleSync() === couple.id);
  const [book, setBook] = useState("juan");
  const [chapter, setChapter] = useState("1");
  const [note, setNote] = useState("");
  const bookName = (id: string) => bookList.data?.find((b) => b.id === id)?.name ?? id;

  async function call(kind: "audio" | "video") {
    try {
      const chat = await messageService.openWith(partnerId);
      const prepared = await messageService.startCall(chat.id, kind);
      if (!prepared.online) return void toast.info(`${partner} no tiene la app abierta. Le avisamos de tu llamada.`);
      await startCall(prepared.peer, kind);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar la llamada.");
    }
  }

  async function readTogether() {
    const n = Number(chapter) || 1;
    await coupleService.setPassage(couple.id, book, n).catch(() => toast.error("No se pudo compartir el pasaje."));
    navigate(`/bible/${book}/${n}`);
  }

  async function addNote() {
    if (!note.trim()) return;
    await coupleService.addNote(couple, note).then(() => { setNote(""); notes.reload(); }, () => toast.error("No se pudo guardar."));
  }

  const p = couple.passage;
  const max = bookList.data?.find((b) => b.id === book)?.chapters ?? 150;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
        <HeartHandshake className="size-8 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">Con {partner}</p>
          <p className="text-xs text-muted-foreground">Desde {new Date(couple.createdAt).toLocaleDateString("es")}</p>
        </div>
        <Button size="icon" variant="outline" aria-label="Llamar" onClick={() => void call("audio")}><Phone className="size-4" /></Button>
        <Button size="icon" variant="outline" aria-label="Videollamada" onClick={() => void call("video")}><Video className="size-4" /></Button>
      </div>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h3 className="flex items-center gap-2 font-medium"><BookOpen className="size-4" /> Leer juntos</h3>
        {p && (
          <Link to={`/bible/${p.book}/${p.chapter}`} className="block rounded-xl bg-primary/10 p-3 text-sm">
            {p.by === user.id ? "Compartiste" : `${partner} está leyendo`} <strong>{bookName(p.book)} {p.chapter}</strong> · Abrir
          </Link>
        )}
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <SimpleSelect
            value={book}
            onValueChange={setBook}
            options={(bookList.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
            ariaLabel="Libro"
          />
          <Input type="number" min={1} max={max} value={chapter} onChange={(e) => setChapter(e.target.value)} aria-label="Capítulo" />
        </div>
        <Button full onClick={() => void readTogether()}>Compartir y abrir</Button>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Seguir a {partner} mientras leo (y compartir mi capítulo)</span>
          <Switch checked={sync} onCheckedChange={(v) => { setSync(v); setCoupleSync(v ? couple.id : null); }} />
        </label>
      </section>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h3 className="font-medium">Notas compartidas</h3>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" /> Solo ustedes dos las ven. Lo que es solo tuyo, escríbelo en <Link to="/diario" className="underline">Mi diario</Link>.
        </p>
        <Textarea value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder="Una oración, un versículo, algo que aprendieron…" />
        <Button full variant="outline" disabled={!note.trim()} onClick={() => void addNote()}><Send className="size-4" /> Compartir nota</Button>
        {notes.loading ? (
          <ListSkeleton count={2} />
        ) : !notes.data?.length ? (
          <EmptyState icon={HeartHandshake} title="Aún no hay notas" description="Escriban juntos lo que Dios les va hablando." />
        ) : (
          <ul className="space-y-2">
            {notes.data.map((n) => (
              <li key={n.id} className="rounded-xl bg-surface-2 p-3 text-sm">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{n.authorId === user.id ? "Tú" : partner} · {timeAgo(n.createdAt)}</span>
                  {n.authorId === user.id && (
                    <button type="button" aria-label="Borrar nota" onClick={() => void coupleService.removeNote(couple, n.id).then(notes.reload)}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button
        full
        variant="ghost"
        onClick={async () => {
          if (!confirm(`¿Desvincularte de ${partner}? Se borran las notas compartidas.`)) return;
          await coupleService.unlink(couple).catch(() => toast.error("No se pudo desvincular."));
          setCoupleSync(null);
          onUnlinked();
        }}
      >
        <Link2Off className="size-4" /> Desvincular
      </Button>
    </div>
  );
}
