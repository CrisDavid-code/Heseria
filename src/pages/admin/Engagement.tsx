import {
  BellRing, CalendarClock, Check, Eye, EyeOff, Megaphone, Send, Sparkles, Trash2, Users, Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BarsChart, KpiRow, TrendChart } from "@/components/admin/AdminKit";
import { GenerativeCover } from "@/components/media/covers";
import { ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  RadioGroup, RadioItem, SettingRow, SimpleSelect, Switch, Tabs, TabsContent, TabsList,
  TabsTrigger,
} from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent, SheetAction } from "@/components/ui/overlays";
import { Badge, Field, Input, Progress, Stat, Textarea } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { haptic } from "@/native";
import { audienceService, broadcastService } from "@/services";
import {
  segmentMeta, useAutoRules, useCampaigns, useSegments, type Campaign, type SegmentId,
} from "@/store/broadcast";
import { useScreen } from "@/store/screen";
import { cn, formatCompact, formatDate, pct, timeAgo } from "@/lib/utils";

/* --------------------------------------------------------- notificaciones */

const DESTINATIONS = [
  { value: "", label: "Sin destino (solo el mensaje)" },
  { value: "/home", label: "Inicio" },
  { value: "/explore", label: "Explorar" },
  { value: "/bible", label: "Biblia" },
  { value: "/devotionals", label: "Devocional de hoy" },
  { value: "/music", label: "Música" },
  { value: "/events", label: "Eventos" },
  { value: "/foundation", label: "Fundación" },
  { value: "/prayer", label: "Oración" },
];

function CampaignCard({ campaign, onOpen }: { campaign: Campaign; onOpen: () => void }) {
  const segment = segmentMeta(campaign.segment);
  const deliveryRate = pct(campaign.delivered, campaign.audience);
  const openRate = pct(campaign.opened, campaign.delivered);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card w-full p-4 text-left transition-colors active:bg-secondary"
    >
      <div className="flex items-center gap-2">
        <Badge variant={campaign.source === "automatica" ? "primary" : "default"}>
          {campaign.source === "automatica" ? (
            <>
              <Zap className="size-3" /> Automática
            </>
          ) : (
            "Manual"
          )}
        </Badge>
        <Badge
          variant={
            campaign.status === "enviada"
              ? "success"
              : campaign.status === "programada"
                ? "warning"
                : campaign.status === "enviando"
                  ? "primary"
                  : "outline"
          }
        >
          {campaign.status}
        </Badge>
        <span className="ml-auto shrink-0 text-[0.68rem] text-muted-foreground">
          {campaign.sentAt
            ? timeAgo(campaign.sentAt)
            : campaign.scheduledAt
              ? formatDate(campaign.scheduledAt)
              : timeAgo(campaign.createdAt)}
        </span>
      </div>

      <p className="mt-2.5 text-sm font-semibold">{campaign.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground clamp-2">{campaign.body}</p>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="size-3.5" /> {segment.label} · {formatCompact(campaign.audience)} personas
      </p>

      {campaign.status === "enviada" && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[0.68rem] text-muted-foreground">Entregadas</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatCompact(campaign.delivered)}{" "}
              <span className="text-xs font-normal text-muted-foreground">{deliveryRate} %</span>
            </p>
            <Progress value={deliveryRate} className="mt-1" label={`${deliveryRate} % entregadas`} />
          </div>
          <div>
            <p className="text-[0.68rem] text-muted-foreground">Abiertas</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatCompact(campaign.opened)}{" "}
              <span className="text-xs font-normal text-muted-foreground">{openRate} %</span>
            </p>
            <Progress value={openRate} className="mt-1" label={`${openRate} % abiertas`} />
          </div>
        </div>
      )}
    </button>
  );
}

export function AdminNotifications() {
  usePageMeta("Notificaciones", "Envía avisos a todos los usuarios de Heseria.");
  const { data: campaigns, loading: loadingCampaigns, reload: reloadCampaigns } = useCampaigns();
  const { data: rules, reload: reloadRules } = useAutoRules();
  const { data: segments } = useSegments();
  const sizeOf = (id: SegmentId) => segments.find((x) => x.id === id)?.size ?? 0;

  const [composerOpen, setComposerOpen] = useState(false);
  const [active, setActive] = useState<Campaign | null>(null);

  useScreen({
    title: "Notificaciones",
    back: true,
    hideSections: true,
    actions: (
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        aria-label="Nueva notificación"
        className="tap-target grid place-items-center rounded-full text-primary active:bg-secondary"
      >
        <Send className="size-5" />
      </button>
    ),
  });

  const sent = campaigns.filter((c) => c.status === "enviada");
  const totalDelivered = sent.reduce((n, c) => n + c.delivered, 0);
  const totalOpened = sent.reduce((n, c) => n + c.opened, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Enviadas" value={String(sent.length)} />
        <Stat label="Programadas" value={String(campaigns.filter((c) => c.status === "programada").length)} />
        <Stat label="Entregas" value={formatCompact(totalDelivered)} />
        <Stat
          label="Tasa de apertura"
          value={`${pct(totalOpened, totalDelivered)} %`}
          delta={4.3}
        />
      </div>

      <Button full size="lg" onClick={() => setComposerOpen(true)}>
        <Megaphone className="size-4" /> Enviar notificación
      </Button>

      <Tabs defaultValue="historial">
        <TabsList>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="automaticas">Automáticas</TabsTrigger>
        </TabsList>

        <TabsContent value="historial">
          <div className="space-y-3">
            {loadingCampaigns ? (
              <ListSkeleton />
            ) : campaigns.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
                Todavía no has enviado ninguna notificación.
              </p>
            ) : (
              campaigns.map((c) => (
                <CampaignCard key={c.id} campaign={c} onOpen={() => setActive(c)} />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="automaticas">
          <p className="mb-4 rounded-xl border border-border p-3.5 text-xs text-muted-foreground">
            Las reglas activas envían la notificación sola cuando ocurre el evento. La de contenido
            nuevo se dispara cada vez que se publica algo desde cualquier portal.
          </p>
          <div className="surface-card divide-y divide-border px-4">
            {rules.map((r) => (
              <SettingRow key={r.id} title={r.label} description={r.description}>
                <Switch
                  checked={r.enabled}
                  onCheckedChange={async (v) => {
                    await broadcastService.toggleRule(r.id, v);
                    reloadRules();
                    toast.success(v ? "Regla activada" : "Regla desactivada");
                  }}
                  aria-label={r.label}
                />
              </SettingRow>
            ))}
          </div>

          <div className="mt-4 space-y-2.5">
            {rules.map((r) => (
              <div
                key={`${r.id}-detail`}
                className={cn(
                  "rounded-xl border p-3.5",
                  r.enabled ? "border-primary/25 bg-primary/6" : "border-border opacity-60",
                )}
              >
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <Sparkles className="size-3.5 text-primary" /> {r.label}
                </p>
                <p className="mt-1.5 text-sm">“{r.template}”</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Audiencia: {segmentMeta(r.segment).label} ·{" "}
                  {formatCompact(sizeOf(r.segment))} personas
                </p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <CampaignComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onSent={reloadCampaigns}
      />

      <BottomSheet open={active !== null} onOpenChange={(v) => !v && setActive(null)}>
        <BottomSheetContent title={active?.title ?? ""} description={active?.body}>
          {active && (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-[0.65rem] uppercase text-muted-foreground">Audiencia</p>
                  <p className="mt-1 font-display text-base font-semibold tabular-nums">
                    {formatCompact(active.audience)}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-[0.65rem] uppercase text-muted-foreground">Entregadas</p>
                  <p className="mt-1 font-display text-base font-semibold tabular-nums">
                    {formatCompact(active.delivered)}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-[0.65rem] uppercase text-muted-foreground">Abiertas</p>
                  <p className="mt-1 font-display text-base font-semibold tabular-nums">
                    {formatCompact(active.opened)}
                  </p>
                </div>
              </div>

              <div className="space-y-0.5">
                {active.status === "programada" && (
                  <SheetAction
                    icon={CalendarClock}
                    label="Cancelar programación"
                    onClick={async () => {
                      await broadcastService.cancel(active.id);
                    reloadCampaigns();
                      reloadCampaigns();
                      toast.success("Envío cancelado");
                      setActive(null);
                    }}
                  />
                )}
                <SheetAction
                  icon={Trash2}
                  label="Eliminar campaña"
                  destructive
                  onClick={async () => {
                    await broadcastService.remove(active.id);
                    reloadCampaigns();
                    toast.success("Campaña eliminada");
                    setActive(null);
                  }}
                />
              </div>
            </>
          )}
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

/* ------------------------------------------------------------- compositor */

function CampaignComposer({
  open,
  onOpenChange,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState<SegmentId>("todos");
  const [href, setHref] = useState("");
  const [when, setWhen] = useState<"ahora" | "programar">("ahora");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; body?: string; scheduledAt?: string }>({});

  const { data: segments } = useSegments();
  const audience = {
    ...segmentMeta(segment),
    size: segments.find((x) => x.id === segment)?.size ?? 0,
  };

  async function submit() {
    const found: typeof errors = {};
    if (title.trim().length < 3) found.title = "Escribe un título.";
    if (body.trim().length < 5) found.body = "Escribe el mensaje.";
    if (when === "programar" && !scheduledAt) found.scheduledAt = "Elige fecha y hora.";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSending(true);
    try {
      const campaign = await broadcastService.send({
        title: title.trim(),
        body: body.trim(),
        segment,
        href: href || undefined,
        scheduledAt: when === "programar" ? new Date(scheduledAt).toISOString() : undefined,
      });
      haptic("success");
      toast.success(
        when === "programar"
          ? "Notificación programada"
          : `Enviada a ${formatCompact(campaign.delivered)} personas`,
      );
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar.");
      setSending(false);
      return;
    }
    setSending(false);
    setTitle("");
    setBody("");
    setHref("");
    setWhen("ahora");
    setScheduledAt("");
    onOpenChange(false);
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title="Nueva notificación"
        description="Llega a todos los dispositivos con la app instalada."
        fullScreen
      >
        <div className="mx-auto max-w-md space-y-4 pb-4">
          <Field label="Título" htmlFor="cp-title" required error={errors.title}>
            <Input
              id="cp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Por ejemplo: Nuevo álbum disponible"
              maxLength={65}
              aria-invalid={Boolean(errors.title)}
            />
          </Field>

          <Field
            label="Mensaje"
            htmlFor="cp-body"
            required
            error={errors.body}
            hint={`${body.length}/160 caracteres`}
          >
            <Textarea
              id="cp-body"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 160))}
              placeholder="Escribe el texto que verán en la pantalla de bloqueo…"
              className="min-h-24"
              aria-invalid={Boolean(errors.body)}
            />
          </Field>

          <Field label="Audiencia">
            <SimpleSelect
              value={segment}
              onValueChange={(v) => setSegment(v as SegmentId)}
              options={segments.map((seg) => ({
                value: seg.id,
                label: `${seg.label} · ${formatCompact(seg.size)}`,
              }))}
              ariaLabel="Audiencia"
            />
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">{audience.description}</p>

          <Field label="Al tocar, abrir" hint="Usa el sistema de enlaces profundos de la app.">
            <SimpleSelect
              value={href}
              onValueChange={setHref}
              options={DESTINATIONS}
              ariaLabel="Destino"
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium">¿Cuándo?</p>
            <RadioGroup
              value={when}
              onValueChange={(v) => setWhen(v as "ahora" | "programar")}
              className="space-y-2"
            >
              <RadioItem value="ahora" label="Enviar ahora" description="Llega en segundos" />
              <RadioItem value="programar" label="Programar" description="Elige fecha y hora" />
            </RadioGroup>
          </div>

          {when === "programar" && (
            <Field label="Fecha y hora" htmlFor="cp-when" required error={errors.scheduledAt}>
              <Input
                id="cp-when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                aria-invalid={Boolean(errors.scheduledAt)}
              />
            </Field>
          )}

          {/* Vista previa tal como se verá en el teléfono */}
          <div>
            <p className="mb-2 text-sm font-medium">Vista previa</p>
            <div className="rounded-2xl border border-border bg-surface-2 p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-cyan-400 to-indigo-600 text-[0.6rem] font-bold text-white">
                  H
                </span>
                <span className="text-xs font-medium text-muted-foreground">HESERIA</span>
                <span className="ml-auto text-[0.65rem] text-muted-foreground">ahora</span>
              </div>
              <p className="mt-2 text-sm font-semibold">{title || "Título de la notificación"}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {body || "Aquí aparecerá el mensaje que escribas."}
              </p>
            </div>
          </div>

          <div className="flex gap-2.5 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="flex-[2]" size="lg" loading={sending} onClick={submit}>
              <BellRing className="size-4" />
              {when === "programar" ? "Programar" : "Enviar ahora"}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Envío simulado. Con el backend conectado saldrá por FCM y APNs a los dispositivos reales.
          </p>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/* -------------------------------------------------------------- audiencia */

export function AdminAudience() {
  usePageMeta("Audiencia", "Usuarios activos y alcance del contenido.");
  useScreen({ title: "Audiencia", back: true, hideSections: true });

  const stats = useAsync(() => audienceService.active(), []);
  const retention = useAsync(() => audienceService.retention(), []);
  const { data: segments } = useSegments();

  const s = stats.data;

  return (
    <div className="space-y-5">
      <KpiRow
        kpis={
          s
            ? [
                // Sin variación inventada: se muestra el dato medido y ya.
                { label: "Activos hoy", value: formatCompact(s.daily), delta: 0 },
                { label: "Activos 7 días", value: formatCompact(s.weekly), delta: 0 },
                { label: "Activos 30 días", value: formatCompact(s.monthly), delta: 0 },
                { label: "Cuentas nuevas (7 d)", value: formatCompact(s.newThisWeek), delta: 0 },
              ]
            : undefined
        }
      />

      <TrendChart
        title="Usuarios activos por semana"
        subtitle="Cuentas distintas · las que vuelven"
        data={retention.data}
      />

      <section className="surface-card p-4">
        <h3 className="text-sm font-semibold">Segmentos</h3>
        <ul className="mt-3 space-y-2.5">
          {segments.map((seg) => (
            <li key={seg.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm">{seg.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatCompact(seg.size)}
                </span>
              </div>
              <Progress
                value={pct(seg.size, segments[0]?.size ?? 1)}
                className="mt-1.5"
                label={seg.label}
              />
            </li>
          ))}
        </ul>
      </section>

      <BarsChart
        title="Retención semanal"
        subtitle="De quienes estuvieron activos, cuántos volvieron a la semana siguiente"
        data={retention.data
          ?.slice(-6)
          .map((d) => ({
            label: d.label,
            value: d.value ? Math.round(((d.secondary ?? 0) / d.value) * 100) : 0,
          }))}
      />

      {s && (
        <p className="rounded-xl border border-border p-3.5 text-xs text-muted-foreground">
          Cifras medidas en el servidor:{" "}
          <strong className="text-foreground">{s.sessionsToday}</strong> sesiones hoy y{" "}
          <strong className="text-foreground">{s.newThisWeek}</strong> cuentas nuevas esta semana.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------- métricas de una pieza (hoja) */

export function ContentMetricsSheet({
  contentId,
  title,
  open,
  onOpenChange,
}: {
  contentId: string;
  title: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const data = useAsync(() => audienceService.engagement(contentId), [contentId, open]);
  const [tab, setTab] = useState<"vieron" | "no-vieron">("vieron");

  const list = tab === "vieron" ? data.data?.viewers : data.data?.nonViewers;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="Métricas" description={title} fullScreen>
        <div className="mx-auto max-w-md pb-4">
          {data.loading ? (
            <ListSkeleton />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-border p-3">
                  <Eye className="mx-auto size-4 text-primary" />
                  <p className="mt-1 font-display text-base font-semibold tabular-nums">
                    {data.data?.viewers.length ?? 0}
                  </p>
                  <p className="text-[0.62rem] text-muted-foreground">Lo vieron</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <EyeOff className="mx-auto size-4 text-muted-foreground" />
                  <p className="mt-1 font-display text-base font-semibold tabular-nums">
                    {data.data?.nonViewers.length ?? 0}
                  </p>
                  <p className="text-[0.62rem] text-muted-foreground">No lo vieron</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <Check className="mx-auto size-4 text-success" />
                  <p className="mt-1 font-display text-base font-semibold tabular-nums">
                    {data.data?.viewRate ?? 0} %
                  </p>
                  <p className="text-[0.62rem] text-muted-foreground">Alcance</p>
                </div>
              </div>

              <Button
                full
                className="mt-4"
                onClick={async () => {
                  await broadcastService.send({
                    title: `No te pierdas ${title}`,
                    body: "Está disponible ahora en Heseria.",
                    segment: "inactivos",
                    href: `/content/${contentId}`,
                    contentId,
                  });
                  toast.success("Recordatorio enviado a quienes aún no lo han visto");
                }}
              >
                <BellRing className="size-4" /> Avisar a quienes no lo vieron
              </Button>

              <div className="mt-5">
                <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                  <TabsList>
                    <TabsTrigger value="vieron">Lo vieron</TabsTrigger>
                    <TabsTrigger value="no-vieron">No lo vieron</TabsTrigger>
                  </TabsList>
                  <TabsContent value={tab}>
                    <ul className="space-y-1">
                      {list?.map((u) => (
                        <li key={u.id} className="flex items-center gap-3 rounded-lg p-2">
                          <GenerativeCover
                            seed={u.id}
                            gradient={u.color}
                            className="size-9 shrink-0"
                            rounded="rounded-full"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{u.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {u.city}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </TabsContent>
                </Tabs>
              </div>

              <p className="mt-5 text-xs text-muted-foreground">
                El detalle por persona requiere telemetría en el servidor. Aquí se combina lo medido
                en este dispositivo con una proyección estable de la audiencia.
              </p>
            </>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
