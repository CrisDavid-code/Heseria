/**
 * HESERIA Familia: espacio privado con tutores y miembros, perfiles infantiles con lo mínimo
 * (nombre o apodo, edad aproximada y un avatar) y actividades bíblicas por edad con progreso.
 * Los niños no tienen cuenta, chat ni perfil público: el tutor marca lo que hicieron juntos.
 */
import { BookOpen, CheckCircle2, Circle, Copy, Home, LogOut, Plus, Shield, Trash2, UserMinus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Field, Input } from "@/components/ui/primitives";
import { FAMILY_ACTIVITIES } from "@/content/family-activities";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { familyService, type AgeGroup, type Child, type Family as FamilyT } from "@/services";
import { useSession } from "@/store";
import { useScreen } from "@/store/screen";

const AGES: { value: AgeGroup; label: string }[] = [
  { value: "3-5", label: "3 a 5 años" },
  { value: "6-8", label: "6 a 8 años" },
  { value: "9-12", label: "9 a 12 años" },
];
const AVATARS = ["🦁", "🐑", "🕊️", "🐟", "🌟", "🌈", "🐻", "🦋"];

const errMsg = (err: unknown, fallback: string) => toast.error(err instanceof Error ? err.message : fallback);

export default function Family() {
  usePageMeta("Familia", "La fe en casa.");
  useScreen({ title: "Familia", back: true });
  const fam = useAsync(() => familyService.mine(), []);
  if (fam.loading) return <ListSkeleton count={3} />;
  if (fam.error) return <ErrorState onRetry={fam.reload} />;
  return fam.data ? <Space family={fam.data} reload={fam.reload} /> : <Start onDone={fam.reload} />;
}

function Start({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await work(); toast.success(ok); onDone(); } catch (err) { errMsg(err, "No se pudo."); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface-2 p-4 text-center">
        <Home className="mx-auto size-10 text-primary" />
        <h2 className="mt-2 font-display text-lg font-semibold">Un espacio para tu familia</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          «Instruye al niño en su camino» (Proverbios 22:6). Actividades bíblicas por edad para hacer juntos, en un
          espacio que solo ve tu familia.
        </p>
      </div>
      <section className="space-y-2 rounded-2xl border border-border p-4">
        <Field label="Nombre del espacio" htmlFor="f-name">
          <Input id="f-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Familia Pérez" />
        </Field>
        <Button full loading={busy} disabled={!name.trim()} onClick={() => void run(() => familyService.create(name), "Espacio creado")}>
          Crear espacio familiar
        </Button>
      </section>
      <section className="space-y-2 rounded-2xl border border-border p-4">
        <Field label="¿Te invitaron? Código" htmlFor="f-code">
          <Input id="f-code" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" />
        </Field>
        <Button full variant="outline" loading={busy} disabled={code.trim().length !== 8} onClick={() => void run(() => familyService.join(code), "¡Bienvenido a la familia!")}>
          Unirme
        </Button>
      </section>
    </div>
  );
}

function Space({ family, reload }: { family: FamilyT; reload: () => void }) {
  const { user } = useSession();
  const tutor = family.roles[user.id] === "tutor";
  const kids = useAsync(() => familyService.children(family), [family.id]);
  const [code, setCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id?: string; name: string; ageGroup: AgeGroup; avatar: string; done?: string[] } | null>(null);
  const [open, setOpen] = useState<Child | null>(null);

  const act = (work: () => Promise<unknown>, after = reload) => work().then(after, (err) => errMsg(err, "No se pudo."));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface-2 p-4">
        <p className="font-display text-lg font-semibold">{family.name}</p>
        <p className="text-xs text-muted-foreground">Solo los miembros ven este espacio.</p>
      </div>

      <section className="space-y-2">
        <h3 className="font-medium">Niños</h3>
        {kids.loading ? (
          <ListSkeleton count={2} />
        ) : !kids.data?.length ? (
          <EmptyState icon={Home} title="Sin perfiles" description={tutor ? "Agrega a tus hijos para seguir sus actividades." : "Un tutor puede agregarlos."} />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {kids.data.map((c) => {
              const total = FAMILY_ACTIVITIES[c.ageGroup].length;
              const done = FAMILY_ACTIVITIES[c.ageGroup].filter((a) => c.done.includes(a.id)).length;
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setOpen(c)} className="w-full rounded-2xl border border-border p-3 text-left">
                    <span className="text-3xl">{c.avatar || "🙂"}</span>
                    <p className="mt-1 truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{done} de {total} actividades</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {tutor && (
          <Button full variant="outline" onClick={() => setDraft({ name: "", ageGroup: "6-8", avatar: "🦁" })}>
            <Plus className="size-4" /> Agregar niño o niña
          </Button>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Miembros</h3>
        <ul className="space-y-1">
          {family.members.map((m) => (
            <li key={m} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{family.names[m] || "Miembro"}{m === user.id && " (tú)"}</span>
              <Badge variant={family.roles[m] === "tutor" ? "success" : "default"}>{family.roles[m] ?? "miembro"}</Badge>
              {tutor && m !== user.id && m !== family.createdBy && (
                <>
                  <button type="button" aria-label="Cambiar rol" onClick={() => void act(() => familyService.setRole(family, m, family.roles[m] === "tutor" ? "miembro" : "tutor"))}>
                    <Shield className="size-4" />
                  </button>
                  <button type="button" aria-label="Quitar del espacio" onClick={() => confirm("¿Quitar a esta persona del espacio?") && void act(() => familyService.removeMember(family, m))}>
                    <UserMinus className="size-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {tutor &&
          (code ? (
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="font-mono text-2xl tracking-widest">{code}</p>
              <p className="text-xs text-muted-foreground">Compártelo con tu familia. Vence en 7 días.</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void navigator.clipboard.writeText(code).then(() => toast.success("Código copiado"))}>
                <Copy className="size-3.5" /> Copiar
              </Button>
            </div>
          ) : (
            <Button full variant="outline" onClick={() => void familyService.invite(family).then(setCode, (e) => errMsg(e, "No se pudo crear el código."))}>
              Invitar a un familiar
            </Button>
          ))}
      </section>

      {family.createdBy === user.id ? (
        <Button full variant="ghost" onClick={() => confirm("¿Borrar el espacio familiar y los perfiles de los niños?") && void act(() => familyService.remove(family))}>
          <Trash2 className="size-4" /> Borrar espacio
        </Button>
      ) : (
        <Button full variant="ghost" onClick={() => confirm("¿Salir del espacio familiar?") && void act(() => familyService.leave(family))}>
          <LogOut className="size-4" /> Salir del espacio
        </Button>
      )}

      <BottomSheet open={Boolean(draft)} onOpenChange={(v) => !v && setDraft(null)}>
        <BottomSheetContent title={draft?.id ? "Editar perfil" : "Nuevo perfil"}>
          {draft && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Solo pedimos un nombre o apodo y la edad aproximada. No se guarda foto, fecha de nacimiento ni contacto.</p>
              <Field label="Nombre o apodo" htmlFor="k-name" required>
                <Input id="k-name" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="Edad" htmlFor="k-age">
                <SimpleSelect value={draft.ageGroup} onValueChange={(v) => setDraft({ ...draft, ageGroup: v as AgeGroup })} options={AGES} ariaLabel="Edad" />
              </Field>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar">
                {AVATARS.map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={draft.avatar === a} onClick={() => setDraft({ ...draft, avatar: a })}
                    className={`rounded-xl border p-2 text-2xl ${draft.avatar === a ? "border-primary" : "border-border"}`}>
                    {a}
                  </button>
                ))}
              </div>
              <Button full disabled={!draft.name.trim()} onClick={() => void act(() => familyService.saveChild(family, draft), () => { setDraft(null); kids.reload(); })}>
                Guardar
              </Button>
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>

      <BottomSheet open={Boolean(open)} onOpenChange={(v) => !v && setOpen(null)}>
        <BottomSheetContent title={open ? `${open.avatar} ${open.name}` : ""}>
          {open && (
            <div className="space-y-2">
              {FAMILY_ACTIVITIES[open.ageGroup].map((a) => {
                const done = open.done.includes(a.id);
                return (
                  <div key={a.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        disabled={!tutor}
                        aria-label={done ? "Marcar como pendiente" : "Marcar como hecha"}
                        onClick={() => void familyService.toggleDone(family, open, a.id).then(() => {
                          setOpen({ ...open, done: done ? open.done.filter((d) => d !== a.id) : [...open.done, a.id] });
                          kids.reload();
                        }, (e) => errMsg(e, "No se pudo."))}
                      >
                        {done ? <CheckCircle2 className="size-5 text-primary" /> : <Circle className="size-5 text-muted-foreground" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{a.todo}</p>
                        <Link to={`/bible/${a.book}/${a.chapter}`} className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                          <BookOpen className="size-3" /> {a.ref}
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
              {tutor && (
                <div className="flex gap-2 pt-2">
                  <Button full variant="outline" onClick={() => { setDraft({ ...open }); setOpen(null); }}>Editar perfil</Button>
                  <Button full variant="ghost" onClick={() => confirm(`¿Borrar el perfil de ${open.name}?`) && void act(() => familyService.removeChild(family, open.id), () => { setOpen(null); kids.reload(); })}>
                    Borrar
                  </Button>
                </div>
              )}
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
