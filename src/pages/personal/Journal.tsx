/**
 * HESERIA — Mi diario: diario espiritual y diario de oración.
 *
 * Privado de verdad: vive en users/{uid}/journal y las reglas solo dejan leerlo a su dueño
 * (ni la administración). Nada de esto se publica, se manda a analítica ni a la IA.
 */
import { BookHeart, CheckCircle2, HandHeart, Lock, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { journalService, type JournalEntry } from "@/services";
import { useScreen } from "@/store/screen";
import { cn, formatDate } from "@/lib/utils";

type Kind = JournalEntry["kind"];
const COPY: Record<Kind, { title: string; empty: string; placeholder: string; new: string }> = {
  espiritual: {
    title: "Diario espiritual",
    empty: "Escribe lo que Dios te habló hoy, lo que aprendiste o lo que quieres recordar.",
    placeholder: "¿Qué te habló Dios hoy?",
    new: "Nueva anotación",
  },
  oracion: {
    title: "Diario de oración",
    empty: "Registra tus peticiones y marca cuando Dios las responda. Solo tú las ves.",
    placeholder: "¿Por qué quieres orar?",
    new: "Nueva petición",
  },
};

interface Draft {
  id?: string;
  title: string;
  body: string;
  refs: string;
  tags: string;
  favorite?: boolean;
}
const EMPTY: Draft = { title: "", body: "", refs: "", tags: "" };
const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function Journal() {
  usePageMeta("Mi diario", "Tu diario espiritual y de oración, privado.");
  useScreen({ title: "Mi diario" });

  const [kind, setKind] = useState<Kind>("espiritual");
  const [q, setQ] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const entries = useAsync(() => journalService.list(kind), [kind]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (entries.data ?? []).filter(
      (e) =>
        (!onlyFav || e.favorite) &&
        (!needle || `${e.title} ${e.body} ${e.refs.join(" ")} ${e.tags.join(" ")}`.toLowerCase().includes(needle)),
    );
  }, [entries.data, q, onlyFav]);

  async function save() {
    if (!draft || draft.body.trim().length < 1) return;
    setBusy(true);
    try {
      await journalService.save({
        id: draft.id, kind, title: draft.title, body: draft.body, refs: split(draft.refs), tags: split(draft.tags),
        favorite: draft.favorite,
      });
      toast.success("Guardado en tu diario");
      setDraft(null);
      entries.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function act(work: () => Promise<unknown>, ok?: string) {
    try {
      await work();
      if (ok) toast.success(ok);
      entries.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar.");
    }
  }

  const copy = COPY[kind];
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" aria-hidden /> Privado: solo tú puedes leer tu diario.
      </p>

      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
        <TabsList>
          <TabsTrigger value="espiritual">Espiritual</TabsTrigger>
          <TabsTrigger value="oracion">Oración</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar en el diario" className="pl-9" />
        </div>
        <button
          type="button"
          onClick={() => setOnlyFav((v) => !v)}
          aria-pressed={onlyFav}
          aria-label="Solo favoritos"
          className={cn("tap-target grid place-items-center rounded-full border border-border", onlyFav && "border-primary text-primary")}
        >
          <Star className={cn("size-4", onlyFav && "fill-current")} />
        </button>
      </div>

      <Button full onClick={() => setDraft({ ...EMPTY })}>
        <Plus className="size-4" /> {copy.new}
      </Button>

      {entries.loading ? (
        <ListSkeleton count={4} />
      ) : entries.error ? (
        <ErrorState onRetry={entries.reload} />
      ) : shown.length === 0 ? (
        <EmptyState icon={kind === "oracion" ? HandHeart : BookHeart} title={copy.title} description={q || onlyFav ? "Nada coincide con tu búsqueda." : copy.empty} />
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => (
            <li key={e.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {e.title && <p className="font-semibold">{e.title}</p>}
                  <p className="text-xs text-muted-foreground">{formatDate(e.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => act(() => journalService.setFavorite(e.id, !e.favorite))}
                  aria-label={e.favorite ? "Quitar de favoritos" : "Marcar como favorito"}
                  className="tap-target grid place-items-center rounded-full text-muted-foreground"
                >
                  <Star className={cn("size-4", e.favorite && "fill-amber-400 text-amber-400")} />
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{e.body}</p>
              {(e.refs.length > 0 || e.tags.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.refs.map((r) => <Badge key={r} variant="primary">{r}</Badge>)}
                  {e.tags.map((t) => <Badge key={t} variant="outline">#{t}</Badge>)}
                </div>
              )}
              {kind === "oracion" && e.answered && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4" /> Respondida{e.answeredAt ? ` el ${formatDate(e.answeredAt)}` : ""}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {kind === "oracion" && (
                  <Button size="sm" variant={e.answered ? "outline" : "primary"} onClick={() => act(() => journalService.setAnswered(e.id, !e.answered), e.answered ? undefined : "¡Gloria a Dios! Petición respondida.")}>
                    <CheckCircle2 className="size-3.5" /> {e.answered ? "Marcar pendiente" : "Dios respondió"}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setDraft({ id: e.id, title: e.title, body: e.body, refs: e.refs.join(", "), tags: e.tags.join(", "), favorite: e.favorite })}>
                  <Pencil className="size-3.5" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("¿Borrar esta anotación? No se puede recuperar.")) void act(() => journalService.remove(e.id), "Borrada");
                  }}
                >
                  <Trash2 className="size-3.5" /> Borrar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet open={Boolean(draft)} onOpenChange={(v) => !v && setDraft(null)}>
        <BottomSheetContent title={draft?.id ? "Editar" : copy.new}>
          {draft && (
            <div className="space-y-3">
              <Field label="Título (opcional)" htmlFor="j-title">
                <Input id="j-title" value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Field label={kind === "oracion" ? "Petición" : "Anotación"} htmlFor="j-body" required>
                <Textarea id="j-body" rows={6} value={draft.body} maxLength={10000} placeholder={copy.placeholder} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              </Field>
              <Field label="Referencias bíblicas (separadas por coma)" htmlFor="j-refs">
                <Input id="j-refs" value={draft.refs} placeholder="Juan 3:16, Salmos 23" onChange={(e) => setDraft({ ...draft, refs: e.target.value })} />
              </Field>
              <Field label="Etiquetas (separadas por coma)" htmlFor="j-tags">
                <Input id="j-tags" value={draft.tags} placeholder="familia, gratitud" onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
              </Field>
              <Button full size="lg" loading={busy} disabled={!draft.body.trim()} onClick={() => void save()}>
                Guardar
              </Button>
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
