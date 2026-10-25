/**
 * HESERIA — Compartir un versículo.
 *
 * Dos formas: como texto o como imagen. La imagen se compone aquí mismo sobre
 * uno de los cientos de fondos generados por código, y se puede mandar a un
 * chat de Heseria o a cualquier app del teléfono.
 *
 * Lo que sale de Heseria lleva siempre la invitación a descargar la app: es la
 * forma natural de que alguien que recibe un versículo bonito llegue aquí.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Image as ImageIcon, MessageCircle, Send, Share2, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { ListSkeleton } from "@/components/states";
import { GenerativeCover } from "@/components/media/covers";
import { useAsync } from "@/hooks/useAsync";
import { haptic, share, shareImage, shareUrl } from "@/native";
import { messageService, userService } from "@/services";
import { useSession } from "@/store";
import {
  allBackgrounds, backgroundFor, FORMATS, PALETTES, renderVerseBlob, renderVerseDataUrl,
  type Background, type Format,
} from "@/lib/verse-image";
import { fold } from "@/lib/countries";
import { cn } from "@/lib/utils";

/** La invitación que acompaña a todo lo que sale de la app. */
const INVITACION = "Descarga Heseria y lee la Biblia cada día · heseria.app";

export function VerseShareSheet({
  open,
  onOpenChange,
  text,
  reference,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  text: string;
  reference: string;
}) {
  const [format, setFormat] = useState<Format>("cuadrado");
  const [background, setBackground] = useState<Background>(() => backgroundFor(reference));
  const [working, setWorking] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  // Al cambiar de versículo, se propone un fondo distinto pero estable.
  useEffect(() => {
    setBackground(backgroundFor(reference));
  }, [reference]);

  const plain = `“${text}”\n— ${reference}`;
  const conInvitacion = `${plain}\n\n${INVITACION}`;

  const preview = useMemo(
    () => renderVerseDataUrl({ text, reference, background, format, footer: INVITACION }),
    [text, reference, background, format],
  );

  async function build(): Promise<Blob | null> {
    return renderVerseBlob({ text, reference, background, format, footer: INVITACION });
  }

  async function shareAsImage() {
    setWorking(true);
    try {
      const blob = await build();
      if (!blob) throw new Error("No se pudo componer la imagen.");
      const how = await shareImage(blob, {
        fileName: `${reference.replace(/[^\w]+/g, "-").toLowerCase()}.png`,
        title: reference,
        text: conInvitacion,
      });
      if (how === "download") toast.success("Imagen guardada en tus descargas.");
      if (how === "failed") toast.error("No pudimos compartir la imagen.");
      else haptic("success");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo compartir.");
    } finally {
      setWorking(false);
    }
  }

  async function shareAsText() {
    const how = await share({
      title: reference,
      text: conInvitacion,
      url: shareUrl("/bible"),
    });
    if (how === "clipboard") toast.success("Versículo copiado al portapapeles.");
    else if (how !== "failed") haptic("success");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(conInvitacion);
      toast.success("Copiado.");
    } catch {
      toast.error("No pudimos copiar.");
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="Compartir versículo" description={reference} fullScreen>
        <div className="mx-auto max-w-md pb-4">
          <Tabs defaultValue="imagen">
            <TabsList>
              <TabsTrigger value="imagen">
                <ImageIcon className="size-3.5" /> Imagen
              </TabsTrigger>
              <TabsTrigger value="texto">
                <Type className="size-3.5" /> Texto
              </TabsTrigger>
              <TabsTrigger value="chat">
                <MessageCircle className="size-3.5" /> Enviar
              </TabsTrigger>
            </TabsList>

            {/* ------------------------------------------------- imagen */}
            <TabsContent value="imagen">
              <img
                src={preview}
                alt={`Vista previa de ${reference}`}
                className="mx-auto max-h-[46vh] w-auto rounded-2xl border border-border"
              />

              <div className="mt-3 flex gap-1.5">
                {(Object.keys(FORMATS) as Format[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors",
                      format === f
                        ? "border-primary bg-primary/12 font-medium text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {FORMATS[f].label}
                  </button>
                ))}
              </div>

              <BackgroundGallery
                text={text}
                reference={reference}
                selected={background}
                onSelect={setBackground}
              />

              <div className="mt-4 flex gap-2.5">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    const blob = await build();
                    if (!blob) return;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${reference.replace(/[^\w]+/g, "-").toLowerCase()}.png`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                    toast.success("Imagen guardada.");
                  }}
                >
                  <Download className="size-4" /> Guardar
                </Button>
                <Button className="flex-[2]" loading={working} onClick={() => void shareAsImage()}>
                  <Share2 className="size-4" /> Compartir
                </Button>
              </div>
            </TabsContent>

            {/* -------------------------------------------------- texto */}
            <TabsContent value="texto">
              <blockquote
                className="rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-relaxed"
                data-selectable
              >
                <p className="whitespace-pre-line">{plain}</p>
                <p className="mt-3 text-xs text-muted-foreground">{INVITACION}</p>
              </blockquote>

              <div className="mt-4 flex gap-2.5">
                <Button variant="outline" className="flex-1" onClick={() => void copy()}>
                  <Copy className="size-4" /> Copiar
                </Button>
                <Button className="flex-[2]" onClick={() => void shareAsText()}>
                  <Share2 className="size-4" /> Compartir
                </Button>
              </div>
            </TabsContent>

            {/* --------------------------------------------------- chat */}
            <TabsContent value="chat">
              <SendToChat
                message={plain}
                sending={sendingTo}
                onSending={setSendingTo}
                onSent={() => {
                  onOpenChange(false);
                  toast.success("Versículo enviado.");
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/* ------------------------------------------------------ galería de fondos */

function BackgroundGallery({
  text,
  reference,
  selected,
  onSelect,
}: {
  text: string;
  reference: string;
  selected: Background;
  onSelect: (b: Background) => void;
}) {
  const backgrounds = useMemo(() => allBackgrounds(), []);
  // Se dibujan por tandas: componer trescientos fondos de golpe trabaría todo.
  const [visible, setVisible] = useState(24);

  // Miniatura barata: el mismo fondo, sin texto y en pequeño.
  const thumb = (b: Background) =>
    renderVerseDataUrl({ text: "", reference: "", background: b, format: "cuadrado" });

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium">Fondo</p>
        <p className="text-xs text-muted-foreground">{backgrounds.length} disponibles</p>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {backgrounds.slice(0, visible).map((b) => {
          const active = b.paletteId === selected.paletteId && b.motifId === selected.motifId;
          return (
            <button
              key={`${b.paletteId}-${b.motifId}`}
              type="button"
              onClick={() => {
                haptic("light");
                onSelect(b);
              }}
              aria-label={`Fondo ${b.motifId} ${b.paletteId}`}
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg border-2 transition-colors",
                active ? "border-primary" : "border-transparent",
              )}
            >
              <img src={thumb(b)} alt="" className="size-full object-cover" />
              {active && (
                <span className="absolute inset-0 grid place-items-center bg-black/35">
                  <Check className="size-4 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {visible < backgrounds.length && (
        <Button
          variant="ghost"
          full
          className="mt-2"
          onClick={() => setVisible((v) => v + 40)}
        >
          Ver más fondos
        </Button>
      )}

      <p className="mt-2 text-[0.7rem] text-muted-foreground">
        {PALETTES.length} colores × {backgrounds.length / PALETTES.length} motivos. Se dibujan en el
        momento, así que no ocupan espacio en tu teléfono.
      </p>
    </div>
  );
}

/* ------------------------------------------------------- enviar al chat */

function SendToChat({
  message,
  sending,
  onSending,
  onSent,
}: {
  message: string;
  sending: string | null;
  onSending: (id: string | null) => void;
  onSent: () => void;
}) {
  const { user } = useSession();
  const [query, setQuery] = useState("");
  const conversations = useAsync(() => messageService.conversations(), []);
  const people = useAsync(() => userService.list(), []);

  const term = fold(query.trim());

  const chats = (conversations.data ?? []).filter((c) => !term || fold(c.title).includes(term));
  const contacts = (people.data ?? [])
    .filter((p) => p.id !== user.id)
    .filter((p) => !term || fold(p.name).includes(term))
    .slice(0, 20);

  async function sendToConversation(id: string) {
    onSending(id);
    try {
      await messageService.send(id, message);
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar.");
    } finally {
      onSending(null);
    }
  }

  async function sendToPerson(personId: string) {
    onSending(personId);
    try {
      const { id } = await messageService.openWith(personId);
      await messageService.send(id, message);
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar.");
    } finally {
      onSending(null);
    }
  }

  if (conversations.loading || people.loading) return <ListSkeleton />;

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar chat o persona"
        aria-label="Buscar destinatario"
        className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm"
      />

      {chats.length > 0 && (
        <>
          <p className="mb-1 mt-4 px-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Tus conversaciones
          </p>
          <ul className="space-y-0.5">
            {chats.map((c) => (
              <li key={c.id}>
                <Row
                  id={c.id}
                  seed={c.id}
                  color={c.color}
                  title={c.title}
                  subtitle="Conversación"
                  busy={sending === c.id}
                  disabled={sending !== null}
                  onClick={() => void sendToConversation(c.id)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mb-1 mt-4 px-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Personas
      </p>
      <ul className="space-y-0.5">
        {contacts.map((p) => (
          <li key={p.id}>
            <Row
              id={p.id}
              seed={p.id}
              color={p.color}
              title={p.name}
              subtitle={`@${p.handle}`}
              busy={sending === p.id}
              disabled={sending !== null}
              onClick={() => void sendToPerson(p.id)}
            />
          </li>
        ))}
        {contacts.length === 0 && (
          <li className="px-1 py-6 text-center text-sm text-muted-foreground">
            No encontramos a nadie con ese nombre.
          </li>
        )}
      </ul>
    </div>
  );
}

function Row({
  seed,
  color,
  title,
  subtitle,
  busy,
  disabled,
  onClick,
}: {
  id: string;
  seed: string;
  color: string;
  title: string;
  subtitle: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors active:bg-secondary disabled:opacity-60"
    >
      <GenerativeCover seed={seed} gradient={color} className="size-9 shrink-0" rounded="rounded-full" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {busy ? (
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary" />
      ) : (
        <Send className="size-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}
