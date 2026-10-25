import {
  ArrowRight, Calendar, Check, ExternalLink, HandHeart, Heart, MapPin, Share2, ShieldCheck, Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FoundationCaseCard, Rail, VolunteerCard } from "@/components/cards";
import { GenerativeCover, HeroMedia } from "@/components/media/covers";
import { PlaceLink } from "@/components/media/GeoMap";
import { AsyncBoundary, DetailSkeleton, GridSkeleton, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioItem, SimpleSelect } from "@/components/ui/controls";
import { Badge, Chip, Field, Input, Progress } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { haptic, openExternal, share, shareUrl } from "@/native";
import { donationService, foundationService, type DonationReceipt } from "@/services";
import { useScreen } from "@/store/screen";
import { cn, formatDate, formatMoney, pct } from "@/lib/utils";
import type { Donation } from "@/types";

/* ------------------------------------------------------------------ index */

export function FoundationIndex() {
  usePageMeta("Fundación", "Casos verificados, donaciones y voluntariado.");
  useScreen({ title: "Fundación", back: true, hideSections: true });

  const featured = useAsync(() => foundationService.featured(), []);
  const cases = useAsync(() => foundationService.cases(), []);
  const opportunities = useAsync(() => foundationService.volunteerOpportunities(), []);

  const totalRaised = cases.data?.reduce((n, c) => n + c.raised, 0) ?? 0;
  const totalGoal = cases.data?.reduce((n, c) => n + c.goal, 0) ?? 0;

  return (
    <div className="space-y-8">
      <HeroMedia
        seed="fundacion"
        kind="foundationCase"
        gradient="from-rose-400/70 to-purple-800/70"
        className="flex min-h-52 items-end p-5"
      >
        <div className="relative z-10">
          <Badge variant="primary" size="md" className="mb-2.5 border border-white/20 bg-white/15 text-white">
            Fundación Heseria
          </Badge>
          <h2 className="font-display text-xl font-semibold text-white">
            La fe se demuestra sirviendo
          </h2>
          <p className="mt-1.5 text-sm text-white/80">
            Cada caso lo verifica un equipo local junto a iglesias de la zona.
          </p>
        </div>
      </HeroMedia>

      <div className="surface-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-medium">Recaudado este año</p>
          <span className="font-display text-lg font-semibold tabular-nums">
            {formatMoney(totalRaised)}
          </span>
        </div>
        <Progress value={pct(totalRaised, totalGoal)} label="Progreso global" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          de {formatMoney(totalGoal)} en {cases.data?.length ?? 0} casos activos
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Button asChild size="lg">
          <Link to="/foundation/donate">
            <Heart className="size-4" /> Donar
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/foundation/volunteer">
            <Users className="size-4" /> Ser voluntario
          </Link>
        </Button>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="text-section font-semibold tracking-tight">Casos urgentes</h2>
          <Link to="/foundation/cases" className="shrink-0 text-xs font-medium text-muted-foreground">
            Ver todos
          </Link>
        </div>
        <AsyncBoundary {...featured} skeleton={<GridSkeleton aspect="aspect-video" />}>
          {(items) => (
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((c) => (
                <FoundationCaseCard key={c.id} item={c} />
              ))}
            </div>
          )}
        </AsyncBoundary>
      </section>

      <Rail title="Oportunidades de voluntariado" href="/foundation/volunteer">
        {opportunities.data?.map((o) => (
          <Link key={o.id} to="/foundation/volunteer" className="min-w-0">
            <GenerativeCover
              seed={o.id}
              gradient={o.color}
              className="aspect-square w-full"
              icon={HandHeart}
              label={o.title}
            />
            <p className="mt-2 truncate text-sm font-medium">{o.title}</p>
            <p className="truncate text-xs text-muted-foreground">{o.modality}</p>
          </Link>
        ))}
      </Rail>
    </div>
  );
}

/* ------------------------------------------------------------------ cases */

export function FoundationCases() {
  usePageMeta("Casos de ayuda", "Situaciones verificadas que necesitan apoyo.");
  useScreen({ title: "Casos de ayuda", back: true, hideSections: true });

  const [category, setCategory] = useState("Todos");
  const cases = useAsync(() => foundationService.cases(), []);
  const categories = ["Todos", ...new Set((cases.data ?? []).map((c) => c.category))];
  const visible =
    category === "Todos" ? cases.data : cases.data?.filter((c) => c.category === category);

  return (
    <div className="space-y-5">
      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {categories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={cases.loading}
        error={cases.error}
        data={visible}
        reload={cases.reload}
        skeleton={<GridSkeleton aspect="aspect-video" />}
      >
        {(items) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((c) => (
              <FoundationCaseCard key={c.id} item={c} />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

export function FoundationCaseDetail() {
  const { id = "" } = useParams();
  const item = useAsync(() => foundationService.case(id), [id]);
  const others = useAsync(() => foundationService.cases(), []);

  usePageMeta(item.data?.title ?? "Caso", item.data?.summary);
  useScreen({ title: item.data?.title ?? "Caso", back: true, hideSections: true }, [item.data?.id]);

  if (item.loading) return <DetailSkeleton />;
  const c = item.data;
  if (!c) return null;

  const progress = pct(c.raised, c.goal);

  return (
    <div className="space-y-6">
      <HeroMedia seed={c.id} title={c.title} kind="foundationCase" gradient={c.color} className="flex min-h-52 items-end p-5">
        <div className="relative z-10">
          {c.urgent && (
            <Badge variant="danger" size="md" className="mb-2.5 bg-destructive text-destructive-foreground">
              Urgente
            </Badge>
          )}
          <h1 className="font-display text-xl font-semibold text-white">{c.title}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-white/80">
            <MapPin className="size-3.5" /> {c.location}
          </p>
        </div>
      </HeroMedia>

      <div className="surface-card p-4">
        <Progress value={progress} label={`${progress} % recaudado`} />
        <div className="mt-2.5 flex items-baseline justify-between">
          <span className="font-display text-lg font-semibold tabular-nums">
            {formatMoney(c.raised)}
          </span>
          <span className="text-xs text-muted-foreground">meta {formatMoney(c.goal)}</span>
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" /> {c.participants} personas ya participan
        </p>
      </div>

      <div className="flex gap-2.5">
        <Button asChild className="flex-1" size="lg">
          <Link to={`/foundation/donate?caso=${c.id}`}>
            <Heart className="size-4" /> Ayudar ahora
          </Link>
        </Button>
        <Button
          variant="outline"
          aria-label="Compartir"
          onClick={async () => {
            const how = await share({
              title: c.title,
              text: c.summary,
              url: shareUrl(`/foundation/cases/${c.id}`),
            });
            if (how === "clipboard") toast.success("Enlace copiado");
          }}
        >
          <Share2 className="size-4" />
        </Button>
      </div>

      <section>
        <h2 className="mb-2 text-section font-semibold">La situación</h2>
        <p className="text-sm leading-relaxed text-muted-foreground" data-selectable>
          {c.situation}
        </p>
      </section>

      <section>
        <h2 className="mb-2.5 text-section font-semibold">Necesidades concretas</h2>
        <ul className="space-y-2">
          {c.needs.map((n) => (
            <li key={n} className="flex items-center gap-2.5 rounded-xl border border-border p-3 text-sm">
              <Check className="size-4 shrink-0 text-success" />
              {n}
            </li>
          ))}
        </ul>
      </section>

      <PlaceLink title={c.location} subtitle={c.category} target={{ label: c.location }} />

      <section>
        <h2 className="mb-2.5 text-section font-semibold">Actualizaciones</h2>
        <ol className="space-y-3 border-l border-border pl-4">
          {c.updates.map((u) => (
            <li key={u.date} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
              <p className="text-xs font-medium text-primary">{formatDate(u.date)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{u.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <Button asChild variant="outline" full>
        <Link to="/foundation/volunteer">
          <Users className="size-4" /> Quiero ser voluntario
        </Link>
      </Button>

      <Rail title="Otros casos" href="/foundation/cases">
        {others.data
          ?.filter((o) => o.id !== c.id)
          .slice(0, 6)
          .map((o) => (
            <Link key={o.id} to={`/foundation/cases/${o.id}`} className="min-w-0">
              <GenerativeCover
                seed={o.id}
                gradient={o.color}
                className="aspect-square w-full"
                icon={HandHeart}
                label={o.title}
              />
              <p className="mt-2 truncate text-sm font-medium">{o.title}</p>
              <p className="truncate text-xs text-muted-foreground">{o.location}</p>
            </Link>
          ))}
      </Rail>
    </div>
  );
}

/* -------------------------------------------------------------- volunteer */

export function FoundationVolunteer() {
  usePageMeta("Voluntariado", "Súmate a servir con tu tiempo y tus dones.");
  useScreen({ title: "Voluntariado", back: true, hideSections: true });

  const [modality, setModality] = useState("Todas");
  const opportunities = useAsync(() => foundationService.volunteerOpportunities(), []);
  const visible =
    modality === "Todas"
      ? opportunities.data
      : opportunities.data?.filter((o) => o.modality === modality);

  return (
    <div className="space-y-5">
      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {["Todas", "Presencial", "Online", "Híbrido"].map((m) => (
          <Chip key={m} active={modality === m} onClick={() => setModality(m)}>
            {m}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={opportunities.loading}
        error={opportunities.error}
        data={visible}
        reload={opportunities.reload}
        skeleton={<GridSkeleton aspect="aspect-video" />}
      >
        {(items) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((o) => (
              <VolunteerCard
                key={o.id}
                opportunity={o}
                onApply={async () => {
                  await foundationService.applyVolunteer(o.id);
                  haptic("success");
                  toast.success("Inscripción enviada. Te contactará el equipo local.");
                }}
              />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

/* ---------------------------------------------------------------- donate */

const AMOUNTS = [10, 25, 50, 100];
const FREQUENCIES: { value: Donation["frequency"]; label: string; description: string }[] = [
  { value: "Única", label: "Una sola vez", description: "Un aporte puntual" },
  { value: "Mensual", label: "Mensual", description: "Se renueva cada mes" },
  { value: "Anual", label: "Anual", description: "Se renueva cada año" },
];
type Step = "causa" | "monto" | "metodo" | "resumen" | "procesando" | "recibo";

export function FoundationDonate() {
  usePageMeta("Donar", "Apoya un caso verificado de la Fundación Heseria.");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const cases = useAsync(() => foundationService.cases(), []);

  const [step, setStep] = useState<Step>(params.get("caso") ? "monto" : "causa");
  const [caseId, setCaseId] = useState(params.get("caso") ?? "");
  const [amount, setAmount] = useState(25);
  const [custom, setCustom] = useState("");
  const [frequency, setFrequency] = useState<Donation["frequency"]>("Única");
  // Los métodos los configura la administración; aquí solo se eligen.
  const methods = useAsync(() => donationService.methods(), []);
  const [method, setMethod] = useState("");
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [declared, setDeclared] = useState(false);

  // El primero disponible queda preseleccionado.
  useEffect(() => {
    if (!method && methods.data?.length) setMethod(methods.data[0].id);
  }, [method, methods.data]);

  useScreen({ title: "Donar", back: true, hideSections: true });

  const selected = cases.data?.find((c) => c.id === caseId);
  const finalAmount = custom ? Number(custom) || 0 : amount;

  const STEP_INDEX: Record<Step, number> = {
    causa: 0, monto: 1, metodo: 2, resumen: 3, procesando: 4, recibo: 5,
  };

  const chosen = methods.data?.find((m) => m.id === method);

  async function confirm() {
    setStep("procesando");
    try {
      const r = await donationService.donate({
        amount: finalAmount,
        frequency,
        projectId: caseId,
        method,
      });
      setReceipt(r);
      haptic("success");
      setStep("recibo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar tu donación.");
      setStep("resumen");
    }
  }

  /** Abre PayPal (o el servicio que sea) fuera de la app. */
  async function openPayment() {
    if (!receipt?.payUrl) return;
    await openExternal(receipt.payUrl);
    // Al volver, lo natural es confirmar; se deja el aviso a la vista.
    setDeclared(true);
  }

  /** «Ya la envié»: queda por verificar y la administración recibe el aviso. */
  async function declarePaid() {
    if (!receipt) return;
    setConfirming(true);
    try {
      const updated = await donationService.confirm(receipt.id, note);
      setReceipt(updated);
      haptic("success");
      toast.success("Gracias. Verificamos tu donación y te confirmamos.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setConfirming(false);
    }
  }

  if (step === "procesando") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <span className="size-10 animate-spin rounded-full border-2 border-border border-t-primary" />
        <h1 className="mt-6 font-display text-lg font-semibold">Registrando tu donación</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Un momento, no cierres la app.</p>
      </div>
    );
  }

  if (step === "recibo" && receipt) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <span
          className={cn(
            "grid size-16 place-items-center rounded-full",
            receipt.status === "por-verificar"
              ? "bg-success/15 text-success"
              : "bg-primary/15 text-primary",
          )}
        >
          {receipt.status === "por-verificar" ? (
            <Check className="size-8" strokeWidth={2.5} />
          ) : (
            <Heart className="size-8" />
          )}
        </span>
        <h1 className="mt-6 font-display text-xl font-semibold">
          {receipt.status === "por-verificar" ? "Gracias, lo estamos verificando" : "Ya casi"}
        </h1>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
          {receipt.status === "por-verificar"
            ? `Confirmamos tu donación de ${formatMoney(finalAmount)} en cuanto la veamos reflejada.`
            : `Falta un paso: completar tu donación de ${formatMoney(finalAmount)} en ${receipt.method.label}.`}
        </p>

        <div className="surface-card mt-6 w-full p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Comprobante
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Número</dt>
              <dd className="font-mono font-medium">{receipt.reference}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Monto</dt>
              <dd className="font-medium tabular-nums">{formatMoney(finalAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Método</dt>
              <dd className="font-medium">{receipt.method.label}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Causa</dt>
              <dd className="max-w-[60%] text-right font-medium">{selected?.title}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Estado</dt>
              <dd className="font-medium">
                {receipt.status === "por-verificar" ? "Por verificar" : "Pendiente de envío"}
              </dd>
            </div>
          </dl>

          {receipt.instructions && (
            <p className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground" data-selectable>
              {receipt.instructions}
            </p>
          )}
        </div>

        {receipt.status !== "por-verificar" && (
          <div className="mt-5 w-full space-y-3">
            {receipt.payUrl && (
              <Button full size="lg" onClick={() => void openPayment()}>
                <ExternalLink className="size-4" /> Donar con {receipt.method.label}
              </Button>
            )}

            <div className="surface-card p-4 text-left">
              <p className="text-sm font-medium">
                {declared ? "¿Ya enviaste tu donación?" : "Cuando termines, avísanos"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Déjanos el número de operación si lo tienes. Nos ayuda a encontrar tu donación antes.
              </p>
              <Field label="Número de operación" htmlFor="donation-note" hint="Opcional">
                <Input
                  id="donation-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Por ejemplo 4XJ92831LS"
                  autoCapitalize="characters"
                />
              </Field>
              <Button
                full
                variant="outline"
                className="mt-3"
                loading={confirming}
                onClick={() => void declarePaid()}
              >
                <Check className="size-4" /> Ya la envié
              </Button>
            </div>
          </div>
        )}

        <div className="mt-6 flex w-full gap-2.5">
          <Button variant="outline" className="flex-1" onClick={() => navigate("/foundation")}>
            Volver
          </Button>
          <Button
            className="flex-1"
            onClick={async () => {
              const how = await share({
                title: "Ayuda con nosotros",
                text: `Estoy apoyando “${selected?.title}” en Heseria`,
                url: shareUrl(`/foundation/cases/${caseId}`),
              });
              if (how === "clipboard") toast.success("Enlace copiado");
            }}
          >
            <Share2 className="size-4" /> Compartir
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1.5">
        {["Causa", "Monto", "Método", "Confirmar"].map((label, i) => (
          <div key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              className={
                i <= STEP_INDEX[step]
                  ? "h-1 rounded-full bg-primary"
                  : "h-1 rounded-full bg-muted"
              }
            />
            <span
              className={
                i <= STEP_INDEX[step]
                  ? "text-[0.62rem] font-medium text-primary"
                  : "text-[0.62rem] text-muted-foreground"
              }
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {step === "causa" && (
        <section>
          <h1 className="font-display text-lg font-semibold">¿A qué causa quieres ayudar?</h1>

          {/*
            Quien dona tiene derecho a saber a dónde va su dinero antes de dar el
            primer paso, no al final y en letra pequeña.
          */}
          <p className="mt-2 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            Todo lo que se recauda aquí llega a la <strong className="text-foreground">Fundación
            Heseria</strong>, que es la única que puede pedir donaciones dentro de la app. Ninguna
            iglesia, ministerio ni persona puede abrir su propia colecta: si alguien te la pide por
            aquí, no viene de nosotros.
          </p>

          <div className="mt-4 space-y-2.5">
            {cases.data?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCaseId(c.id);
                  setStep("monto");
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors active:bg-secondary"
              >
                <GenerativeCover
                  seed={c.id}
                  gradient={c.color}
                  className="size-12 shrink-0"
                  rounded="rounded-lg"
                  icon={HandHeart}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.location}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "monto" && (
        <section>
          <h1 className="font-display text-lg font-semibold">¿Cuánto quieres aportar?</h1>
          {selected && (
            <p className="mt-1 text-sm text-muted-foreground">Para: {selected.title}</p>
          )}

          <div className="mt-5 grid grid-cols-4 gap-2.5">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAmount(a);
                  setCustom("");
                }}
                className={
                  finalAmount === a
                    ? "rounded-xl border border-primary bg-primary/12 py-3.5 font-display text-base font-semibold tabular-nums text-primary"
                    : "rounded-xl border border-border py-3.5 font-display text-base font-semibold tabular-nums text-muted-foreground"
                }
              >
                ${a}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <Field label="Otro monto (USD)" htmlFor="custom-amount">
              <Input
                id="custom-amount"
                type="number"
                inputMode="decimal"
                min={1}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Escribe un monto"
              />
            </Field>
          </div>

          <p className="mb-2 mt-5 text-sm font-medium">Frecuencia</p>
          <RadioGroup
            value={frequency}
            onValueChange={(v) => setFrequency(v as Donation["frequency"])}
            className="space-y-2"
          >
            {FREQUENCIES.map((f) => (
              <RadioItem key={f.value} value={f.value} label={f.label} description={f.description} />
            ))}
          </RadioGroup>

          <Button
            full
            size="lg"
            className="mt-6"
            disabled={finalAmount <= 0}
            onClick={() => setStep("metodo")}
          >
            Continuar <ArrowRight className="size-4" />
          </Button>
        </section>
      )}

      {step === "metodo" && (
        <section>
          <h1 className="font-display text-lg font-semibold">¿Cómo quieres aportar?</h1>

          {methods.loading ? (
            <ListSkeleton />
          ) : !methods.data?.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Todavía no hay métodos de aporte configurados. Escríbenos y lo resolvemos.
              </p>
            </div>
          ) : (
            <RadioGroup
              value={method}
              onValueChange={setMethod}
              className="mt-4 space-y-2"
            >
              {methods.data.map((m) => (
                <RadioItem key={m.id} value={m.id} label={m.label} description={m.description} />
              ))}
            </RadioGroup>
          )}

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              La donación se hace fuera de Heseria, en {chosen?.label ?? "el servicio que elijas"}.{" "}
              <strong className="text-foreground">Nunca te pedimos datos de tarjeta</strong> ni los
              guardamos: la app solo registra tu aporte y te da un comprobante.
            </p>
          </div>

          <Button
            full
            size="lg"
            className="mt-6"
            disabled={!method}
            onClick={() => setStep("resumen")}
          >
            Continuar <ArrowRight className="size-4" />
          </Button>
        </section>
      )}

      {step === "resumen" && (
        <section>
          <h1 className="font-display text-lg font-semibold">Confirma tu aporte</h1>
          <div className="surface-card mt-4 p-4">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Causa</dt>
                <dd className="max-w-[60%] text-right font-medium">{selected?.title}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Monto</dt>
                <dd className="font-medium tabular-nums">{formatMoney(finalAmount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Frecuencia</dt>
                <dd className="font-medium">{frequency}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Método</dt>
                <dd className="font-medium">{chosen?.label ?? "—"}</dd>
              </div>
            </dl>
          </div>

          <Button full size="lg" className="mt-6" onClick={confirm} disabled={!method}>
            <Heart className="size-4" /> Continuar
          </Button>
          <Button variant="ghost" full className="mt-2" onClick={() => setStep("metodo")}>
            Volver
          </Button>
        </section>
      )}
    </div>
  );
}
