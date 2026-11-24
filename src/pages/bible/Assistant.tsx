/**
 * Asistente bíblico con IA. La respuesta se marca siempre como generada por IA y sus referencias
 * se convierten en enlaces al texto real de la Biblia en la app, para leerlo y comprobarlo.
 * Sin clave configurada en el servidor, la pantalla lo dice en vez de fingir respuestas.
 */
import { BookOpen, Send, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { parseReference, type BookLite } from "@/lib/reference";
import { aiService } from "@/services";
import { books } from "@/services/bible";
import { useScreen } from "@/store/screen";

interface Turn { q: string; a: string }

/** Busca «Libro 3:16» o «1 Juan 4» en la respuesta y lo vuelve enlace. */
const REF = /((?:[1-3]\s)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s(\d{1,3})(?::(\d{1,3})(?:[-–]\d{1,3})?)?/g;

function Answer({ text, bookList }: { text: string; bookList: BookLite[] }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(REF)) {
    const ref = parseReference(`${m[1]} ${m[2]}${m[3] ? `:${m[3]}` : ""}`, bookList);
    if (!ref) continue;
    out.push(text.slice(last, m.index));
    out.push(
      <Link key={m.index} to={`/bible/${ref.book.id}/${ref.chapter}`} className="font-medium text-primary underline">
        {m[0]}
      </Link>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return <p className="whitespace-pre-wrap text-sm">{out}</p>;
}

export default function Assistant() {
  usePageMeta("Asistente bíblico", "Preguntas sobre la Biblia.");
  useScreen({ title: "Asistente bíblico", back: true });
  const [params] = useSearchParams();
  const context = params.get("leyendo") ?? "";
  const bookList = useAsync(() => books(), []);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState<number | null>(null);

  if (!aiService.configured()) {
    return <EmptyState icon={Sparkles} title="Asistente no configurado" description="La administración todavía no activa el asistente bíblico. Mientras tanto, usa la búsqueda y las herramientas de estudio de la Biblia." />;
  }

  async function ask() {
    const question = q.trim();
    if (!question) return;
    setBusy(true);
    setError("");
    try {
      const r = await aiService.ask(question, context);
      setTurns((t) => [...t, { q: question, a: r.answer }]);
      setLeft(r.left);
      setQ("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo obtener respuesta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
        Las respuestas las genera una inteligencia artificial y pueden equivocarse. La Palabra es la autoridad:
        abre cada referencia y compruébala. No escribas datos personales; tus preguntas no se guardan.
      </p>
      {context && <p className="flex items-center gap-1 text-xs text-muted-foreground"><BookOpen className="size-3" /> Leyendo {context}</p>}

      {turns.map((t, i) => (
        <div key={i} className="space-y-2">
          <p className="ml-8 rounded-2xl bg-primary/10 p-3 text-sm">{t.q}</p>
          <div className="mr-4 rounded-2xl border border-border p-3">
            <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3" /> Respuesta generada por IA
            </p>
            <Answer text={t.a} bookList={bookList.data ?? []} />
          </div>
        </div>
      ))}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Textarea value={q} maxLength={1000} onChange={(e) => setQ(e.target.value)} placeholder="Ej.: ¿Qué enseña la Biblia sobre el perdón?" />
      <Button full loading={busy} disabled={!q.trim()} onClick={() => void ask()}>
        <Send className="size-4" /> Preguntar
      </Button>
      {left !== null && <p className="text-center text-xs text-muted-foreground">Te quedan {left} preguntas hoy.</p>}
    </div>
  );
}
