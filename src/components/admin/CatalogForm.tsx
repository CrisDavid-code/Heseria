/**
 * HESERIA — Alta de elementos del catálogo.
 *
 * Una hoja inferior genérica descrita por sus campos. Lo que se guarda aquí va
 * al catálogo del servidor, así que aparece al instante en todos los
 * dispositivos: crear un evento o un grupo no exige publicar una versión nueva
 * de la aplicación.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { haptic } from "@/native";
import { adminService, userService } from "@/services";
import { useAsync } from "@/hooks/useAsync";

export interface CatalogField {
  name: string;
  label: string;
  type?: "text" | "textarea" | "date" | "time" | "number" | "select";
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}

export function CatalogFormSheet({
  open,
  onOpenChange,
  kind,
  title,
  description,
  fields,
  fixed,
  submitLabel = "Crear",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Tipo de catálogo: `event`, `group`, `ministry`… */
  kind: string;
  title: string;
  description?: string;
  fields: CatalogField[];
  /** Valores que no se piden pero se envían, como la iglesia actual. */
  fixed?: Record<string, unknown>;
  submitLabel?: string;
  onCreated?: (created: { id: string }) => void;
}) {
  const initial = () =>
    Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])) as Record<string, string>;

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));

  function reset() {
    setValues(initial());
    setErrors({});
    setSaving(false);
  }

  async function submit() {
    const found: Record<string, string> = {};
    for (const f of fields) {
      if (f.required !== false && !String(values[f.name] ?? "").trim()) {
        found[f.name] = "Este campo es obligatorio.";
      }
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...fixed };
      for (const f of fields) {
        const raw = values[f.name];
        payload[f.name] = f.type === "number" ? Number(raw) || 0 : raw.trim();
      }
      const created = await adminService.createEntry<{ id: string }>(kind, payload);
      haptic("success");
      toast.success("Creado. Ya lo ve todo el mundo.");
      onCreated?.(created);
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <BottomSheetContent title={title} description={description} fullScreen>
        <div className="mx-auto max-w-md space-y-4 pb-4">
          {fields.map((f) => (
            <Field
              key={f.name}
              label={f.label}
              htmlFor={`cf-${f.name}`}
              hint={f.hint}
              error={errors[f.name]}
              required={f.required !== false}
            >
              {f.type === "textarea" ? (
                <Textarea
                  id={`cf-${f.name}`}
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                  className="min-h-24"
                  aria-invalid={Boolean(errors[f.name])}
                />
              ) : f.type === "select" ? (
                <SimpleSelect
                  value={values[f.name] ?? ""}
                  onValueChange={(v) => set(f.name, v)}
                  options={f.options ?? []}
                  placeholder={f.placeholder ?? "Selecciona"}
                  ariaLabel={f.label}
                />
              ) : (
                <Input
                  id={`cf-${f.name}`}
                  type={f.type ?? "text"}
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                  aria-invalid={Boolean(errors[f.name])}
                />
              )}
            </Field>
          ))}

          <div className="flex gap-2.5 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="flex-[2]" size="lg" loading={saving} onClick={() => void submit()}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/* ------------------------------------------------------ campos por tipo */

export const EVENT_FIELDS: CatalogField[] = [
  { name: "title", label: "Título", placeholder: "Conferencia de jóvenes" },
  {
    name: "type",
    label: "Tipo",
    type: "select",
    defaultValue: "Conferencia",
    options: ["Conferencia", "Culto", "Retiro", "Taller", "Concierto", "Vigilia", "Servicio"].map(
      (v) => ({ value: v, label: v }),
    ),
  },
  {
    name: "modality",
    label: "Modalidad",
    type: "select",
    defaultValue: "Presencial",
    options: ["Presencial", "Online", "Híbrido"].map((v) => ({ value: v, label: v })),
  },
  { name: "date", label: "Fecha", type: "date" },
  { name: "time", label: "Hora", type: "time", defaultValue: "19:00" },
  { name: "city", label: "Ciudad", placeholder: "Santiago" },
  { name: "venue", label: "Lugar", placeholder: "Templo central" },
  { name: "capacity", label: "Aforo", type: "number", defaultValue: "100" },
  {
    name: "description",
    label: "Descripción",
    type: "textarea",
    required: false,
    placeholder: "¿De qué trata el evento?",
  },
];

export const GROUP_FIELDS: CatalogField[] = [
  { name: "name", label: "Nombre", placeholder: "Grupo Norte" },
  { name: "topic", label: "Tema", placeholder: "Estudio bíblico" },
  { name: "meeting", label: "Cuándo se reúne", placeholder: "Martes 20:00" },
  {
    name: "privacy",
    label: "Privacidad",
    type: "select",
    defaultValue: "Abierto",
    options: ["Abierto", "Cerrado"].map((v) => ({ value: v, label: v })),
  },
  {
    name: "description",
    label: "Descripción",
    type: "textarea",
    required: false,
    placeholder: "¿Qué hacen cuando se reúnen?",
  },
];

export const MINISTRY_FIELDS: CatalogField[] = [
  { name: "name", label: "Nombre", placeholder: "Ministerio de alabanza" },
  { name: "category", label: "Categoría", placeholder: "Alabanza" },
  {
    name: "description",
    label: "Descripción",
    type: "textarea",
    required: false,
    placeholder: "¿A qué se dedica?",
  },
];

/* --------------------------------------------------- selector de personas */

/**
 * Busca una cuenta y la asigna a la iglesia. Es lo que hay detrás de «Añadir
 * miembro»: no crea una cuenta ajena, la vincula, que es lo que de verdad
 * puede hacer quien administra una congregación.
 */
export function AddMemberSheet({
  open,
  onOpenChange,
  churchId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  churchId?: string;
  onAdded?: () => void;
}) {
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const results = useAsync(() => userService.list(), []);

  const term = q.trim().toLowerCase();
  const matches = (results.data ?? [])
    .filter((u) => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
    .filter((u) => u.churchId !== churchId)
    .slice(0, 20);

  async function add(userId: string) {
    if (!churchId) {
      toast.error("Esta cuenta no tiene una iglesia asignada.");
      return;
    }
    setPending(userId);
    try {
      await adminService.updateUser(userId, { churchId });
      haptic("success");
      toast.success("Se añadió a la iglesia.");
      onAdded?.();
      results.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo añadir.");
    } finally {
      setPending(null);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title="Añadir miembro"
        description="Busca una cuenta existente y vincúlala a tu iglesia."
        fullScreen
      >
        <div className="mx-auto max-w-md pb-4">
          <Field label="Buscar" htmlFor="member-q">
            <Input
              id="member-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre o correo"
              autoCapitalize="off"
            />
          </Field>

          <ul className="mt-4 divide-y divide-border">
            {matches.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                </span>
                <Button size="sm" loading={pending === u.id} onClick={() => void add(u.id)}>
                  Añadir
                </Button>
              </li>
            ))}
            {!results.loading && matches.length === 0 && (
              <li className="py-10 text-center text-sm text-muted-foreground">
                No hay cuentas que coincidan.
              </li>
            )}
          </ul>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
