/**
 * Versículo del día con todo lo necesario para vivirlo y compartirlo: escucharlo, guardarlo,
 * leer el capítulo, copiarlo y compartirlo como imagen, texto o mensaje (WhatsApp, Facebook…).
 */
import { Bookmark, BookOpen, Copy, Heart, Image as ImageIcon, Pause, Share2, Volume2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { VerseShareSheet } from "@/components/bible/VerseShare";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/hooks/useAsync";
import { speechSupported, useSpeech } from "@/hooks/useSpeech";
import { bibleService, dailyVerseService } from "@/services";
import { haptic } from "@/native";
import { cn } from "@/lib/utils";

export function DailyVerseCard({ className }: { className?: string }) {
  const verse = useAsync(() => bibleService.verseOfTheDay(), []);
  const v = verse.data;
  const saved = useAsync(async () => (v ? (await bibleService.marks(v.book, v.chapter)).some((m) => m.verse === v.verse && m.saved) : false), [v?.ref]);
  const [isSaved, setSaved] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<null | "imagen" | "texto">(null);
  const parts = useMemo(() => (v ? [`${v.text}. ${v.ref}.`] : []), [v]);
  const speech = useSpeech(parts);
  const on = isSaved ?? saved.data ?? false;
  const stats = useAsync(() => dailyVerseService.stats(), []);
  const [react, setReact] = useState<{ likes: number; shares: number; liked: boolean } | null>(null);
  const r = react ?? stats.data ?? { likes: 0, shares: 0, liked: false };

  async function amen() {
    const next = { ...r, liked: !r.liked, likes: Math.max(0, r.likes + (r.liked ? -1 : 1)) };
    setReact(next);
    haptic(r.liked ? "light" : "success");
    try {
      await dailyVerseService.toggleLike(r.liked);
    } catch {
      setReact(r);
      toast.error("No se pudo registrar tu reacción.");
    }
  }
  function onShared() {
    setReact({ ...r, shares: r.shares + 1 });
    void dailyVerseService.shared().catch(() => undefined);
  }

  if (verse.loading || !v) {
    return (
      <div className={cn("surface-card space-y-2 p-5", className)}>
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  async function toggleSave() {
    try {
      await bibleService.mark(v!.book, v!.chapter, v!.verse, { saved: !on });
      setSaved(!on);
      toast.success(on ? "Quitado de tus versículos guardados" : "Guardado en tus versículos");
    } catch {
      toast.error("No se pudo guardar.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`“${v!.text}”\n— ${v!.ref}`);
      toast.success("Versículo copiado");
    } catch {
      toast.error("No se pudo copiar.");
    }
  }

  return (
    <div className={cn("surface-card flex flex-col p-5", className)}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">Versículo del día</p>
      <blockquote className="mt-3 font-display text-lg leading-snug" data-selectable>“{v.text}”</blockquote>
      <p className="mt-2.5 text-sm font-medium text-muted-foreground">{v.ref}</p>

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => void amen()}
          aria-pressed={r.liked}
          aria-label={r.liked ? "Quitar mi amén" : "Amén"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition-colors",
            r.liked ? "border-rose-500/40 bg-rose-500/10 text-rose-500" : "border-border active:bg-secondary",
          )}
        >
          <Heart className={cn("size-4", r.liked && "fill-rose-500 text-rose-500")} /> Amén · <span className="tabular-nums">{r.likes}</span>
        </button>
        <span className="inline-flex items-center gap-1"><Share2 className="size-3.5" /> <span className="tabular-nums">{r.shares}</span> {r.shares === 1 ? "vez compartido" : "veces compartido"}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => setSheet("imagen")}><ImageIcon className="size-4" /> Crear imagen</Button>
        <Button size="sm" variant="outline" onClick={() => setSheet("texto")}><Share2 className="size-4" /> Compartir</Button>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <Button asChild size="sm" variant="subtle" className="flex-1">
          <Link to={`/bible/${v.book}/${v.chapter}`}><BookOpen className="size-4" /> Leer el capítulo</Link>
        </Button>
        {speechSupported() && (
          <Button size="icon" variant="ghost" aria-label={speech.state === "playing" ? "Pausar" : "Escuchar"} onClick={() => (speech.state === "playing" ? speech.pause() : speech.play())}>
            {speech.state === "playing" ? <Pause className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
        )}
        <Button size="icon" variant="ghost" aria-label="Copiar versículo" onClick={() => void copy()}><Copy className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={on ? "Quitar de guardados" : "Guardar versículo"} aria-pressed={on} onClick={() => void toggleSave()}>
          <Bookmark className={cn("size-4", on && "fill-current text-primary")} />
        </Button>
      </div>

      <VerseShareSheet
        open={sheet !== null}
        onOpenChange={(o) => !o && setSheet(null)}
        text={v.text}
        reference={v.ref}
        link={`/v/${v.book}.${v.chapter}.${v.verse}`}
        tab={sheet ?? "imagen"}
        onShared={onShared}
      />
    </div>
  );
}
