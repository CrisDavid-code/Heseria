import { Heart, Lock, Plus, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GenerativeCover } from "@/components/media/covers";
import { AsyncBoundary, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioItem, SimpleSelect, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import { useAction, useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { haptic } from "@/native";
import { prayerService, type PrayerScope } from "@/services";
import { useScreen } from "@/store/screen";
import { users } from "@/store/directory";
import { timeAgo } from "@/lib/utils";
import type { PrayerRequest } from "@/types";

const CATEGORIES = [
  "Salud", "Familia", "Provisión", "Dirección", "Comunidad", "Ministerio", "Misiones",
  "Ciudad", "Gratitud", "Estudios",
];

function PrayerCard({ request }: { request: PrayerRequest }) {
  const author = users.find((u) => u.id === request.authorId);
  const [praying, setPraying] = useState(false);
  const [count, setCount] = useState(request.prayingCount);

  return (
    <article className="surface-card p-4">
      <div className="flex items-start gap-3">
        <GenerativeCover
          seed={request.authorId}
          gradient={author?.color}
          className="size-10 shrink-0"
          rounded="rounded-full"
          label={author?.name ?? ""}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{author?.name}</p>
          <p className="text-xs text-muted-foreground">{timeAgo(`${request.createdAt}T09:00:00Z`)}</p>
        </div>
        {request.visibility === "private" && (
          <Badge variant="outline">
            <Lock className="size-3" /> Privada
          </Badge>
        )}
        {request.visibility === "church" && <Badge variant="outline">Mi iglesia</Badge>}
      </div>

      <h3 className="mt-3 font-display text-base font-semibold leading-snug">{request.title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground" data-selectable>
        {request.body}
      </p>

      {request.answered && request.testimony && (
        <div className="mt-3 rounded-xl border border-success/25 bg-success/8 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
            <Sparkles className="size-3.5" /> Oración respondida
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{request.testimony}</p>
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" /> {count} personas orando
        </span>
        <Button
          size="sm"
          variant={praying ? "secondary" : "subtle"}
          disabled={praying}
          onClick={async () => {
            haptic("success");
            setPraying(true);
            const r = await prayerService.pray(request.id);
            setCount(r.prayingCount);
            toast.success("Gracias por orar. Se lo hicimos saber.");
          }}
        >
          <Heart className={praying ? "size-3.5 fill-current" : "size-3.5"} />
          {praying ? "Estás orando" : "Estoy orando"}
        </Button>
      </div>

      <Badge variant="primary" className="mt-3">
        {request.category}
      </Badge>
    </article>
  );
}

/* ------------------------------------------------------------------ list */

export function PrayerList() {
  usePageMeta("Oración", "Comparte peticiones y ora por tu comunidad.");
  useScreen({
    title: "Oración",
    actions: (
      <Link
        to="/prayer/new"
        aria-label="Nueva petición"
        className="tap-target grid place-items-center rounded-full text-primary active:bg-secondary"
      >
        <Plus className="size-5" />
      </Link>
    ),
  });

  const [scope, setScope] = useState<PrayerScope>("all");
  const list = useAsync(() => prayerService.list(scope), [scope]);

  return (
    <div className="space-y-5">
      <Tabs value={scope} onValueChange={(v) => setScope(v as PrayerScope)}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="mine">Mis peticiones</TabsTrigger>
          <TabsTrigger value="church">Mi iglesia</TabsTrigger>
          <TabsTrigger value="answered">Respondidas</TabsTrigger>
        </TabsList>

        <TabsContent value={scope}>
          <AsyncBoundary
            loading={list.loading}
            error={list.error}
            data={list.data}
            reload={list.reload}
            skeleton={<ListSkeleton />}
            empty={
              <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                <Heart className="mx-auto mb-3 size-6 text-muted-foreground" />
                <h3 className="font-display text-base font-semibold">
                  {scope === "mine" ? "Aún no compartes peticiones" : "Todavía no hay peticiones aquí"}
                </h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
                  Compartir lo que estás viviendo permite que otros caminen contigo.
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link to="/prayer/new">Crear petición</Link>
                </Button>
              </div>
            }
          >
            {(items) => (
              <div className="space-y-3">
                {items.map((p) => (
                  <PrayerCard key={p.id} request={p} />
                ))}
              </div>
            )}
          </AsyncBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------- new form */

export function PrayerNew() {
  usePageMeta("Nueva petición", "Comparte una petición de oración.");
  useScreen({ title: "Nueva petición", back: true, hideSections: true });

  const navigate = useNavigate();
  const { execute, pending } = useAction(prayerService.create);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [visibility, setVisibility] = useState<PrayerRequest["visibility"]>("public");
  const [errors, setErrors] = useState<{ title?: string; body?: string; category?: string }>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (title.trim().length < 4) found.title = "Escribe un título breve.";
    if (body.trim().length < 10) found.body = "Cuéntanos un poco más para orar mejor.";
    if (!category) found.category = "Elige una categoría.";
    setErrors(found);
    if (Object.keys(found).length) return;

    const created = await execute({ title, body, category, visibility });
    if (created) {
      haptic("success");
      toast.success("Tu petición fue compartida");
      navigate("/prayer");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Título" htmlFor="title" required error={errors.title}>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Por ejemplo: por la salud de mi abuela"
          aria-invalid={Boolean(errors.title)}
        />
      </Field>

      <Field
        label="Petición"
        htmlFor="body"
        required
        error={errors.body}
        hint="Comparte lo necesario para que otros puedan acompañarte."
      >
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Cuéntanos qué está pasando…"
          className="min-h-36"
          aria-invalid={Boolean(errors.body)}
        />
      </Field>

      <Field label="Categoría" required error={errors.category}>
        <SimpleSelect
          value={category}
          onValueChange={setCategory}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          placeholder="Elige una categoría"
          ariaLabel="Categoría"
        />
      </Field>

      <div>
        <p className="mb-2 text-sm font-medium">¿Quién puede verla?</p>
        <RadioGroup
          value={visibility}
          onValueChange={(v) => setVisibility(v as PrayerRequest["visibility"])}
          className="space-y-2"
        >
          <RadioItem value="public" label="Pública" description="Toda la comunidad de Heseria" />
          <RadioItem value="church" label="Mi iglesia" description="Solo los miembros de tu iglesia" />
          <RadioItem value="private" label="Privada" description="Solo tú y el equipo de oración" />
        </RadioGroup>
      </div>

      <div className="flex gap-2.5 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-[2]" size="lg" loading={pending}>
          Compartir petición
        </Button>
      </div>
    </form>
  );
}
