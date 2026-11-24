/**
 * HESERIA — Administración → Radios.
 *
 * Solo se publica una emisora («activa») cuando una persona probó la transmisión en la app y
 * confirmó la fuente oficial y el permiso de reproducirla. Las reglas solo dejan escribir a
 * la administración y exigen URL https; el servicio evita duplicados por URL.
 */
import { Pencil, Play, Plus, Radio as RadioIcon, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Checkbox, SimpleSelect } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { playRadio, stopRadio, useRadio } from "@/lib/radio";
import { radioService, type RadioStation } from "@/services";
import { useScreen } from "@/store/screen";
import { formatDate } from "@/lib/utils";

type Draft = Omit<RadioStation, "id" | "verifiedAt" | "categories"> & { id?: string; categories: string; verified: boolean };
const EMPTY: Draft = {
  name: "", description: "", logo: "", country: "Guatemala", region: "", language: "Español", categories: "",
  site: "", source: "", streamUrl: "", status: "pausada", rights: "", verified: false,
};

export default function AdminRadios() {
  usePageMeta("Radios", "Catálogo de radio en vivo.");
  useScreen({ title: "Radios", back: true, hideSections: true });
  const radios = useAsync(() => radioService.all(), []);
  const radio = useRadio();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const testing = draft && radio.station?.streamUrl === draft.streamUrl && radio.status !== "detenida";

  async function save() {
    if (!draft) return;
    if (!/^https:\/\/\S{4,}$/.test(draft.streamUrl.trim())) return void toast.error("La URL de transmisión debe empezar por https://");
    if (draft.status === "activa" && !draft.verified) return void toast.error("Para publicarla, confirma que la probaste y que hay permiso.");
    setBusy(true);
    try {
      const { categories, ...rest } = draft;
      await radioService.save({ ...rest, categories: categories.split(",").map((c) => c.trim()) });
      toast.success("Emisora guardada");
      stopRadio();
      setDraft(null);
      radios.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof Draft, label: string, opts: { placeholder?: string; required?: boolean } = {}) =>
    draft && (
      <Field label={label} htmlFor={`r-${k}`} required={opts.required}>
        <Input id={`r-${k}`} value={String(draft[k] ?? "")} placeholder={opts.placeholder} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
      </Field>
    );

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
        Publica solo transmisiones de la fuente oficial y con permiso de reproducción. Heseria no aloja ni
        retransmite el audio. Pruébala con «Probar» antes de activarla.
      </p>
      <Button full onClick={() => setDraft({ ...EMPTY })}>
        <Plus className="size-4" /> Agregar emisora
      </Button>

      {radios.loading ? (
        <ListSkeleton count={4} />
      ) : radios.error ? (
        <ErrorState onRetry={radios.reload} />
      ) : !radios.data?.length ? (
        <EmptyState icon={RadioIcon} title="Sin emisoras" description="Agrega la primera emisora verificada." />
      ) : (
        <ul className="space-y-2">
          {radios.data.map((s) => (
            <li key={s.id} className="rounded-2xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-medium">{s.name}</p>
                <Badge variant={s.status === "activa" ? "success" : s.status === "pausada" ? "warning" : "danger"}>{s.status}</Badge>
              </div>
              <p className="mt-1 break-all text-xs text-muted-foreground">{s.streamUrl}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.country} · {s.verifiedAt ? `verificada ${formatDate(s.verifiedAt)}` : "sin verificar"}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft({ ...s, categories: s.categories.join(", "), verified: false })}>
                  <Pencil className="size-3.5" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`¿Eliminar «${s.name}» del catálogo?`)) return;
                    await radioService.remove(s.id).catch(() => toast.error("No se pudo eliminar."));
                    radios.reload();
                  }}
                >
                  <Trash2 className="size-3.5" /> Eliminar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet open={Boolean(draft)} onOpenChange={(v) => { if (!v) { stopRadio(); setDraft(null); } }}>
        <BottomSheetContent title={draft?.id ? "Editar emisora" : "Nueva emisora"}>
          {draft && (
            <div className="space-y-3">
              {field("name", "Nombre", { required: true })}
              <Field label="Descripción" htmlFor="r-desc">
                <Textarea id="r-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
              {field("streamUrl", "URL de transmisión (https)", { placeholder: "https://…", required: true })}
              <Button
                variant="outline"
                full
                disabled={!draft.streamUrl.startsWith("https://")}
                onClick={() => (testing ? stopRadio() : playRadio({ ...draft, id: draft.id ?? "prueba", categories: [], verifiedAt: null }))}
              >
                {testing ? <><Square className="size-4" /> Detener prueba ({radio.status})</> : <><Play className="size-4" /> Probar transmisión</>}
              </Button>
              {field("source", "Página de origen (oficial)", { placeholder: "https://…" })}
              {field("site", "Sitio oficial", { placeholder: "https://…" })}
              {field("logo", "Logotipo (URL https)")}
              <div className="grid grid-cols-2 gap-2">
                {field("country", "País")}
                {field("region", "Región")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {field("language", "Idioma")}
                {field("categories", "Categorías (coma)")}
              </div>
              {field("rights", "Derechos / condiciones de uso", { placeholder: "p. ej. permiso escrito de la emisora" })}
              <Field label="Estado" htmlFor="r-status">
                <SimpleSelect
                  value={draft.status}
                  onValueChange={(v) => setDraft({ ...draft, status: v as Draft["status"] })}
                  options={[
                    { value: "activa", label: "Activa (pública)" },
                    { value: "pausada", label: "Pausada" },
                    { value: "retirada", label: "Retirada" },
                  ]}
                  ariaLabel="Estado"
                />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={draft.verified} onCheckedChange={(v) => setDraft({ ...draft, verified: Boolean(v) })} />
                La probé, es la fuente oficial y hay permiso para reproducirla en Heseria.
              </label>
              <Button full size="lg" loading={busy} disabled={!draft.name.trim()} onClick={() => void save()}>
                Guardar
              </Button>
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
