/**
 * HESERIA — Administración → Licencias. Registro de qué contenido usa la app, de quién es, qué
 * permiso hay (y para qué usos: texto, sin conexión, voz, IA…) y dónde está la evidencia.
 * Nada se marca «concedida» automáticamente: lo decide una persona con el documento a la vista.
 */
import { FileCheck2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Checkbox, SimpleSelect } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { bibleService, licenseService, type LicenseEntry, type LicenseStatus } from "@/services";
import { useScreen } from "@/store/screen";
import { formatDate } from "@/lib/utils";

const KINDS = ["biblia", "musica", "podcast", "radio", "video", "libro", "imagen", "otro"];
const STATUS: { value: LicenseStatus; label: string; badge: "success" | "warning" | "danger" | "default" }[] = [
  { value: "pendiente", label: "Pendiente", badge: "warning" },
  { value: "solicitada", label: "Solicitada", badge: "warning" },
  { value: "concedida", label: "Concedida", badge: "success" },
  { value: "denegada", label: "Denegada", badge: "danger" },
  { value: "dominio-publico", label: "Dominio público", badge: "success" },
  { value: "propia", label: "Obra propia", badge: "success" },
];
const SCOPES = ["texto", "sin conexión", "voz", "IA", "descarga", "compartir"];

type Draft = Omit<LicenseEntry, "id" | "reviewedAt"> & { id?: string };
const EMPTY: Draft = { item: "", kind: "biblia", holder: "", license: "", status: "pendiente", scopes: [], evidence: "", notes: "" };

export default function AdminLicenses() {
  usePageMeta("Licencias", "Registro de licencias y atribuciones.");
  useScreen({ title: "Licencias", back: true, hideSections: true });
  const rows = useAsync(() => licenseService.all(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    if (draft.status === "concedida" && !draft.evidence.trim()) return void toast.error("Para marcarla concedida, indica dónde está el permiso (evidencia).");
    setBusy(true);
    try {
      await licenseService.save(draft);
      toast.success("Registro guardado");
      setDraft(null);
      rows.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function importBibles() {
    try {
      const n = await licenseService.importBibles(await bibleService.versions());
      toast.success(n ? `${n} versiones agregadas como pendientes` : "Todas las versiones ya estaban registradas");
      rows.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo importar.");
    }
  }

  const pending = rows.data?.filter((r) => r.status === "pendiente" || r.status === "solicitada").length ?? 0;
  const text = (k: "item" | "holder" | "license" | "evidence", label: string, placeholder = "") =>
    draft && (
      <Field label={label} htmlFor={`l-${k}`} required={k === "item"}>
        <Input id={`l-${k}`} value={draft[k]} placeholder={placeholder} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
      </Field>
    );

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
        Registra cada obra que usa Heseria y el permiso que la respalda. {pending > 0 && <strong>{pending} sin permiso confirmado.</strong>}
      </p>
      <div className="flex gap-2">
        <Button full onClick={() => setDraft({ ...EMPTY })}><Plus className="size-4" /> Agregar</Button>
        <Button full variant="outline" onClick={() => void importBibles()}>Importar versiones bíblicas</Button>
      </div>

      {rows.loading ? (
        <ListSkeleton count={4} />
      ) : rows.error ? (
        <ErrorState onRetry={rows.reload} />
      ) : !rows.data?.length ? (
        <EmptyState icon={FileCheck2} title="Registro vacío" description="Empieza importando las versiones bíblicas." />
      ) : (
        <ul className="space-y-2">
          {rows.data.map((r) => {
            const st = STATUS.find((s) => s.value === r.status);
            return (
              <li key={r.id} className="rounded-2xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{r.item}</p>
                  <Badge variant={st?.badge ?? "default"}>{st?.label ?? r.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.kind}{r.holder && ` · ${r.holder}`}</p>
                {r.scopes.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Usos: {r.scopes.join(", ")}</p>}
                {r.reviewedAt && <p className="mt-1 text-xs text-muted-foreground">Revisado {formatDate(r.reviewedAt)}</p>}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDraft({ ...r })}><Pencil className="size-3.5" /> Editar</Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!confirm(`¿Eliminar «${r.item}» del registro?`)) return;
                    await licenseService.remove(r.id).catch(() => toast.error("No se pudo eliminar."));
                    rows.reload();
                  }}>
                    <Trash2 className="size-3.5" /> Eliminar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BottomSheet open={Boolean(draft)} onOpenChange={(v) => !v && setDraft(null)}>
        <BottomSheetContent title={draft?.id ? "Editar registro" : "Nuevo registro"}>
          {draft && (
            <div className="space-y-3">
              {text("item", "Obra o contenido")}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tipo" htmlFor="l-kind">
                  <SimpleSelect value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v })} options={KINDS.map((k) => ({ value: k, label: k }))} ariaLabel="Tipo" />
                </Field>
                <Field label="Estado" htmlFor="l-status">
                  <SimpleSelect value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as LicenseStatus })} options={STATUS} ariaLabel="Estado" />
                </Field>
              </div>
              {text("holder", "Titular de los derechos")}
              {text("license", "Licencia o condiciones", "p. ej. permiso escrito, CC BY 4.0")}
              {text("evidence", "Evidencia (enlace o ubicación del documento)", "https://…")}
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">Usos permitidos</legend>
                <div className="grid grid-cols-2 gap-1">
                  {SCOPES.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.scopes.includes(s)}
                        onCheckedChange={(v) => setDraft({ ...draft, scopes: v ? [...draft.scopes, s] : draft.scopes.filter((x) => x !== s) })}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Notas" htmlFor="l-notes">
                <Textarea id="l-notes" value={draft.notes} maxLength={2000} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </Field>
              <Button full size="lg" loading={busy} disabled={!draft.item.trim()} onClick={() => void save()}>Guardar</Button>
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
