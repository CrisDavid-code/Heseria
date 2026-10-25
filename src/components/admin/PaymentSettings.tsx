/**
 * HESERIA — Métodos de aporte y verificación.
 *
 * Aquí se decide **cómo** puede aportar la gente y se confirman los aportes que
 * llegan. No hay pasarela: el dinero se mueve por PayPal, transferencia o en
 * persona, y esta pantalla es donde se cierra el círculo.
 */
import { useState } from "react";
import { Banknote, Check, ExternalLink, Link2, Plus, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingRow, SimpleSelect, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import { ListSkeleton } from "@/components/states";
import { useAsync } from "@/hooks/useAsync";
import { paymentAdminService, type PaymentMethodConfig } from "@/services";
import { formatMoney, timeAgo } from "@/lib/utils";

const TYPE_OPTIONS = [
  { value: "paypal", label: "PayPal" },
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "transferencia", label: "Transferencia bancaria" },
  { value: "enlace", label: "Otro enlace de cobro" },
  { value: "efectivo", label: "En persona" },
];

/** Qué se le pide a cada tipo: unos necesitan cuenta, otros instrucciones. */
const HANDLE_HINT: Record<string, { label: string; hint: string; placeholder: string } | null> = {
  paypal: {
    label: "Usuario de PayPal.Me",
    hint: "Solo el nombre, sin la dirección. Si tu enlace es paypal.me/heseria, escribe «heseria».",
    placeholder: "heseria",
  },
  mercadopago: {
    label: "Enlace de cobro",
    hint: "Pega el enlace de tu link de pago de Mercado Pago.",
    placeholder: "https://mpago.la/…",
  },
  enlace: {
    label: "Enlace de cobro",
    hint: "Cualquier página donde se pueda completar el aporte.",
    placeholder: "https://…",
  },
  transferencia: null,
  efectivo: null,
};

export function PaymentSettings() {
  const remote = useAsync(() => paymentAdminService.methods(), []);
  const [methods, setMethods] = useState<PaymentMethodConfig[] | null>(null);
  const [saving, setSaving] = useState(false);

  const list = methods ?? remote.data ?? [];

  const update = (id: string, patch: Partial<PaymentMethodConfig>) =>
    setMethods(list.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  function addMethod() {
    const id = `m${Date.now().toString(36)}`;
    setMethods([
      ...list,
      {
        id,
        type: "paypal",
        label: "PayPal",
        description: "",
        handle: "",
        instructions: "",
        enabled: false,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await paymentAdminService.saveMethods(list);
      setMethods(saved);
      toast.success("Métodos actualizados. Ya están disponibles en la app.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (remote.loading) return <ListSkeleton />;

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
        Heseria <strong className="text-foreground">no cobra ni procesa dinero</strong> ni pide datos
        de tarjeta. Configura aquí a dónde enviar a quien quiera donar; la app registra la
        donación, entrega un comprobante y te avisa para que la confirmes.
      </p>

      {list.map((m) => {
        const handleField = HANDLE_HINT[m.type];
        return (
          <div key={m.id} className="surface-card space-y-3 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                {m.type === "transferencia" ? (
                  <Banknote className="size-4" />
                ) : m.type === "efectivo" ? (
                  <Wallet className="size-4" />
                ) : (
                  <Link2 className="size-4" />
                )}
              </span>
              <Input
                value={m.label}
                onChange={(e) => update(m.id, { label: e.target.value })}
                aria-label="Nombre del método"
                className="flex-1"
              />
              <Switch
                checked={m.enabled}
                onCheckedChange={(v) => update(m.id, { enabled: v })}
                aria-label={`Activar ${m.label}`}
              />
              <button
                type="button"
                onClick={() => setMethods(list.filter((x) => x.id !== m.id))}
                aria-label={`Eliminar ${m.label}`}
                className="tap-target grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <Field label="Tipo">
              <SimpleSelect
                value={m.type}
                onValueChange={(v) => update(m.id, { type: v as PaymentMethodConfig["type"] })}
                options={TYPE_OPTIONS}
                ariaLabel="Tipo de método"
              />
            </Field>

            {handleField && (
              <Field label={handleField.label} hint={handleField.hint}>
                <Input
                  value={m.handle}
                  onChange={(e) => update(m.id, { handle: e.target.value })}
                  placeholder={handleField.placeholder}
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </Field>
            )}

            <Field
              label="Instrucciones"
              hint={
                handleField
                  ? "Opcional. Se muestra junto al botón de donar."
                  : "Obligatorio. Escribe los datos de la cuenta o dónde entregar el aporte."
              }
            >
              <Textarea
                value={m.instructions}
                onChange={(e) => update(m.id, { instructions: e.target.value })}
                placeholder={
                  m.type === "transferencia"
                    ? "Banco, titular, número de cuenta, RUT…"
                    : "Lo que la persona necesita saber para completar su donación."
                }
                className="min-h-20"
              />
            </Field>

            <Field label="Descripción corta" hint="Se ve bajo el nombre al elegir el método.">
              <Input
                value={m.description}
                onChange={(e) => update(m.id, { description: e.target.value })}
                placeholder="Dona con tu cuenta de PayPal."
              />
            </Field>
          </div>
        );
      })}

      <div className="flex gap-2.5">
        <Button variant="outline" className="flex-1" onClick={addMethod}>
          <Plus className="size-4" /> Añadir método
        </Button>
        <Button className="flex-[2]" loading={saving} onClick={() => void save()}>
          Guardar
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ aportes recibidos */

const STATUS_TONE: Record<string, "success" | "warning" | "default" | "danger"> = {
  completada: "success",
  "por-verificar": "warning",
  pendiente: "default",
  cancelada: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  completada: "Confirmada",
  "por-verificar": "Por verificar",
  pendiente: "Pendiente de envío",
  cancelada: "Cancelada",
};

export function DonationInbox() {
  const donations = useAsync(() => paymentAdminService.donations(), []);
  const [busy, setBusy] = useState<string | null>(null);

  async function settle(id: string, status: string) {
    setBusy(id);
    try {
      await paymentAdminService.settle(id, status);
      donations.reload();
      toast.success(status === "completada" ? "Aporte confirmado." : "Aporte actualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setBusy(null);
    }
  }

  if (donations.loading) return <ListSkeleton />;

  // Lo que espera verificación va primero: es lo único que exige una acción.
  const items = [...(donations.data ?? [])].sort((a, b) => {
    const rank = (s: string) => (s === "por-verificar" ? 0 : s === "pendiente" ? 1 : 2);
    return rank(a.status) - rank(b.status);
  });

  if (!items.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
        Todavía no hay aportes registrados.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((d) => (
        <div key={d.id} className="surface-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{d.donor?.name ?? "Anónimo"}</p>
              <p className="truncate text-xs text-muted-foreground">{d.project}</p>
            </div>
            <Badge variant={STATUS_TONE[d.status] === "success" ? "success" : STATUS_TONE[d.status] === "warning" ? "warning" : "outline"}>
              {STATUS_LABEL[d.status] ?? d.status}
            </Badge>
          </div>

          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="font-display text-lg font-semibold tabular-nums">
              {formatMoney(d.amount)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{d.reference}</span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {d.method} · {timeAgo(d.createdAt)}
          </p>

          {d.donorNote && (
            <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
              Operación declarada:{" "}
              <span className="font-mono text-foreground" data-selectable>
                {d.donorNote}
              </span>
            </p>
          )}

          {d.status !== "completada" && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                loading={busy === d.id}
                onClick={() => void settle(d.id, "completada")}
              >
                <Check className="size-3.5" /> Confirmar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void settle(d.id, "cancelada")}
                aria-label="Cancelar aporte"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Las dos mitades juntas: configurar y verificar. */
export function PaymentsPanel() {
  return (
    <Tabs defaultValue="aportes">
      <TabsList>
        <TabsTrigger value="aportes">Aportes recibidos</TabsTrigger>
        <TabsTrigger value="metodos">Métodos</TabsTrigger>
      </TabsList>
      <TabsContent value="aportes">
        <DonationInbox />
      </TabsContent>
      <TabsContent value="metodos">
        <PaymentSettings />
      </TabsContent>
    </Tabs>
  );
}

void SettingRow;
void ExternalLink;
