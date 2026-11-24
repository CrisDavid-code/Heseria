/**
 * Página pública de un versículo compartido: /v/juan.3.16. Quien recibe el enlace lo lee aunque
 * no tenga cuenta, y puede abrir Heseria o instalarla.
 */
import { BookOpen } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { InstallInvite } from "@/components/InstallInvite";
import { HeseriaMark } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { bookName, verseText } from "@/services/bible";

export default function VersePublic() {
  const { id = "" } = useParams();
  const [book, ch, v] = id.split(".");
  const chapter = Number(ch), verse = Number(v);
  const data = useAsync(async () => {
    if (!book || !chapter || !verse) return null;
    const [text, name] = await Promise.all([verseText(book, chapter, verse), bookName(book)]);
    return text ? { text, ref: `${name} ${chapter}:${verse}` } : null;
  }, [id]);
  usePageMeta(data.data?.ref ?? "Versículo", data.data?.text ?? "Lee la Biblia cada día con Heseria.");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 bg-background px-6 py-10 text-center">
      <HeseriaMark className="size-14" />
      {data.loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : data.data ? (
        <figure>
          <blockquote className="font-display text-2xl leading-snug" data-selectable>“{data.data.text}”</blockquote>
          <figcaption className="mt-3 font-medium text-primary">{data.data.ref} · RVR1960</figcaption>
        </figure>
      ) : (
        <p className="text-muted-foreground">No encontramos ese versículo.</p>
      )}
      <div className="flex w-full flex-col gap-2">
        <Button asChild size="lg" full>
          <Link to={book && chapter ? `/bible/${book}/${chapter}` : "/bible"}><BookOpen className="size-4" /> Leer el capítulo en Heseria</Link>
        </Button>
        <InstallInvite />
      </div>
    </main>
  );
}
