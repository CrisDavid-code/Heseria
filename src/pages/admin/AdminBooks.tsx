/**
 * HESERIA — Administración → Biblioteca. Libros del lector: solo de dominio público o con
 * licencia (se exige indicarla) y servidos por https desde un sitio que permita la descarga.
 */
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Field, Input } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { bookService, type CatalogBook } from "@/services";
import { useScreen } from "@/store/screen";

type Draft = Omit<CatalogBook, "id"> & { id?: string };
const EMPTY: Draft = { title: "", author: "", format: "epub", url: "", license: "Dominio público", source: "", status: "activo" };

export default function AdminBooks() {
  usePageMeta("Biblioteca", "Libros del lector.");
  useScreen({ title: "Biblioteca", back: true, hideSections: true });
  const rows = useAsync(() => bookService.all(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    if (!/^https:\/\/\S{4,}$/.test(draft.url.trim())) return void toast.error("La URL debe empezar por https://");
    setBusy(true);
    try {
      // Comprueba que el archivo se puede descargar desde la app (el sitio debe permitirlo).
      const res = await fetch(draft.url.trim(), { method: "HEAD" }).catch(() => null);
      if (!res?.ok) return void toast.error("La app no puede descargar ese archivo (no existe o el sitio no lo permite).");
      await bookService.save(draft);
      toast.success("Libro guardado");
      setDraft(null);
      rows.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  const field = (k: "title" | "author" | "url" | "license" | "source", label: string, placeholder = "") =>
    draft && (
      <Field label={label} htmlFor={`b-${k}`} required={k !== "author" && k !== "source"}>
        <Input id={`b-${k}`} value={draft[k]} placeholder={placeholder} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
      </Field>
    );

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
        Publica solo libros de dominio público o con permiso, y regístralos también en Licencias.
      </p>
      <Button full onClick={() => setDraft({ ...EMPTY })}><Plus className="size-4" /> Agregar libro</Button>
      {rows.loading ? <ListSkeleton count={3} /> : rows.error ? <ErrorState onRetry={rows.reload} /> : !rows.data?.length ? (
        <EmptyState icon={BookOpen} title="Biblioteca vacía" description="Agrega el primer libro." />
      ) : (
        <ul className="space-y-2">
          {rows.data.map((b) => (
            <li key={b.id} className="rounded-2xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-medium">{b.title}</p>
                <Badge variant={b.status === "activo" ? "success" : "danger"}>{b.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{b.author} · {b.format.toUpperCase()} · {b.license}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft({ ...b })}><Pencil className="size-3.5" /> Editar</Button>
                <Button size="sm" variant="ghost" onClick={async () => {
                  if (!confirm(`¿Eliminar «${b.title}»?`)) return;
                  await bookService.remove(b.id).catch(() => toast.error("No se pudo eliminar."));
                  rows.reload();
                }}><Trash2 className="size-3.5" /> Eliminar</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={Boolean(draft)} onOpenChange={(v) => !v && setDraft(null)}>
        <BottomSheetContent title={draft?.id ? "Editar libro" : "Nuevo libro"}>
          {draft && (
            <div className="space-y-3">
              {field("title", "Título")}
              {field("author", "Autor")}
              {field("url", "URL del archivo (https)", "https://…")}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Formato" htmlFor="b-format">
                  <SimpleSelect value={draft.format} onValueChange={(v) => setDraft({ ...draft, format: v as Draft["format"] })} options={[{ value: "epub", label: "EPUB" }, { value: "pdf", label: "PDF" }, { value: "txt", label: "TXT" }]} ariaLabel="Formato" />
                </Field>
                <Field label="Estado" htmlFor="b-status">
                  <SimpleSelect value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as Draft["status"] })} options={[{ value: "activo", label: "Activo" }, { value: "retirado", label: "Retirado" }]} ariaLabel="Estado" />
                </Field>
              </div>
              {field("license", "Licencia")}
              {field("source", "Página de origen", "https://…")}
              <Button full size="lg" loading={busy} disabled={!draft.title.trim() || !draft.license.trim()} onClick={() => void save()}>Guardar</Button>
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
