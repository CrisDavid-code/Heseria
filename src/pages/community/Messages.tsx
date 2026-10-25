import {
  ArrowLeft, Camera, Flag, Image as ImageIcon, Info, Mic, Paperclip, PenSquare, Phone, Pin, Search, Send,
  Smile, Square, Video as VideoIcon, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { GenerativeCover } from "@/components/media/covers";
import { AsyncBoundary, ListSkeleton } from "@/components/states";
import { BottomSheet, BottomSheetContent, SheetAction } from "@/components/ui/overlays";
import { Badge, Input } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { haptic } from "@/native";
import { FileRow } from "@/components/files/Files";
import { canRecord, startRecording, type ActiveRecording } from "@/components/files/VoiceRecorder";
import { fileService } from "@/services";
import { communityService, messageService } from "@/services";
import { onRealtimeEvent, sendRead, sendTyping } from "@/services/realtime";
import { NewConversationSheet } from "@/components/community/NewConversation";
import { startCall } from "@/store/call";
import { useMessageDrafts, useSession } from "@/store";
import { useScreen } from "@/store/screen";
import { users } from "@/store/directory";
import { cn, timeAgo } from "@/lib/utils";
import type { Conversation, Message, MessageAttachment } from "@/types";

const REACTIONS = ["🙏", "❤️", "🙌", "😊", "🔥", "👏"];

function hhmm(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ---------------------------------------------------------- conversation */

function ConversationView({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack: () => void;
}) {
  const { user } = useSession();
  const drafts = useMessageDrafts();
  const history = useAsync(() => messageService.messages(conversation.id), [conversation.id]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  /** Lo que se está subiendo ahora mismo, para que se vea que pasa algo. */
  const [uploading, setUploading] = useState<number | null>(null);
  /** Segundos que lleva la nota de voz. `null` cuando no se está grabando. */
  const [recordingFor, setRecordingFor] = useState<number | null>(null);
  const recorder = useRef<ActiveRecording | null>(null);
  const recordTick = useRef<number | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reactionFor, setReactionFor] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastTypingSent = useRef(0);
  const typingStop = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (history.data) setMessages(history.data);
  }, [history.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, peerTyping]);

  const draft = drafts.get(conversation.id);

  /* --------------------------------------------------------- en vivo */

  // Lo que escribe la otra persona entra por el canal de tiempo real.
  useEffect(() => {
    const off = onRealtimeEvent("message", (event) => {
      if (event.conversationId !== conversation.id) return;
      setMessages((m) => (m.some((x) => x.id === event.message.id) ? m : [...m, event.message]));
      setPeerTyping(false);
      // Tenerla abierta cuenta como leída.
      sendRead(conversation.id);
    });
    return off;
  }, [conversation.id]);

  useEffect(() => {
    const off = onRealtimeEvent("typing", (event) => {
      if (event.conversationId !== conversation.id || event.userId === user.id) return;
      setPeerTyping(event.typing);
    });
    return off;
  }, [conversation.id, user.id]);

  // Abrir la conversación marca como leídos los mensajes que había.
  useEffect(() => {
    sendRead(conversation.id);
  }, [conversation.id]);

  /**
   * Avisa de que se está escribiendo, como mucho una vez cada tres segundos, y
   * retira el aviso al parar.
   */
  function noteTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current > 3000) {
      sendTyping(conversation.id, true);
      lastTypingSent.current = now;
    }
    window.clearTimeout(typingStop.current);
    typingStop.current = window.setTimeout(() => {
      sendTyping(conversation.id, false);
      lastTypingSent.current = 0;
    }, 2500);
  }

  /**
   * Sube un archivo y lo manda como mensaje.
   *
   * Van en dos pasos a propósito: primero el archivo, que puede tardar, y
   * después el mensaje que lo enseña. Así el chat no se queda bloqueado
   * mientras sube un video de diez megas.
   */
  async function sendFile(file: File | Blob, name: string) {
    setUploading(0);
    try {
      const stored = await fileService.upload(file, {
        scope: "message",
        scopeId: conversation.id,
        title: name,
        visibility: "members",
        onProgress: setUploading,
      });
      const sent = await messageService.send(conversation.id, "", stored.id);
      setMessages((m) => (m.some((x) => x.id === sent.id) ? m : [...m, sent]));
      haptic("light");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el archivo.");
    } finally {
      setUploading(null);
    }
  }

  /** Empieza la nota de voz. Si no hay micrófono, se dice y no pasa nada. */
  async function beginRecording() {
    if (!canRecord()) {
      toast.error("Este dispositivo no permite grabar audio.");
      return;
    }
    try {
      recorder.current = await startRecording();
      setRecordingFor(0);
      recordTick.current = window.setInterval(() => {
        setRecordingFor((n) => (n == null ? null : n + 1));
      }, 1000);
      haptic("light");
    } catch {
      // Denegar el micrófono es una decisión, no un error que reportar.
      toast.error("Necesitamos permiso del micrófono para grabar una nota de voz.");
    }
  }

  /** Corta la grabación y la envía. */
  async function finishRecording() {
    const active = recorder.current;
    recorder.current = null;
    window.clearInterval(recordTick.current);
    setRecordingFor(null);
    if (!active) return;

    try {
      const audio = await active.stop();
      await sendFile(audio.blob, audio.fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo grabar.");
    }
  }

  /** Abre el selector del sistema con el filtro que toque. */
  function openPicker(accept: string, camera = false) {
    const input = fileInput.current;
    if (!input) return;
    input.accept = accept;
    if (camera) input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
  }

  /** La persona se arrepintió: el audio no sale de aquí. */
  function discardRecording() {
    recorder.current?.cancel();
    recorder.current = null;
    window.clearInterval(recordTick.current);
    setRecordingFor(null);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    drafts.set(conversation.id, "");
    window.clearTimeout(typingStop.current);
    sendTyping(conversation.id, false);
    lastTypingSent.current = 0;

    try {
      const sent = await messageService.send(conversation.id, text);
      setMessages((m) => (m.some((x) => x.id === sent.id) ? m : [...m, sent]));
      haptic("light");
    } catch (err) {
      // Si falla, se devuelve el texto al campo para no perderlo.
      drafts.set(conversation.id, text);
      toast.error(err instanceof Error ? err.message : "No se pudo enviar.");
    } finally {
      setSending(false);
    }
  }

  /**
   * Inicia una llamada. El servidor confirma que la otra persona existe y tiene
   * la app abierta antes de que se abra la pantalla: si no, se dice y ya.
   */
  async function placeCall(kind: "audio" | "video") {
    try {
      const prepared = await messageService.startCall(conversation.id, kind);
      if (!prepared.online) {
        toast.info(`${prepared.peer.name} no tiene la app abierta. Le avisamos de tu llamada.`);
        return;
      }
      await startCall(prepared.peer, kind);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar la llamada.");
    }
  }

  const pinned = messages.find((m) => m.pinned);

  return (
    <div className="flex h-full flex-col">
      {/* Conversation header (replaces the app header on this screen) */}
      <header className="-mx-4 flex shrink-0 items-center gap-2 border-b border-border bg-surface px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a conversaciones"
          className="tap-target grid shrink-0 place-items-center rounded-full active:bg-secondary"
        >
          <ArrowLeft className="size-5" />
        </button>
        <GenerativeCover
          seed={conversation.id}
          gradient={conversation.color}
          className="size-9 shrink-0"
          rounded="rounded-full"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{conversation.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {peerTyping
              ? "escribiendo…"
              : conversation.kind === "group"
                ? `${conversation.participantIds.length} participantes`
                : "en línea"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void placeCall("audio")}
          aria-label="Llamada de voz"
          className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
        >
          <Phone className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => void placeCall("video")}
          aria-label="Videollamada"
          className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
        >
          <VideoIcon className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          aria-label="Reportar conversación"
          className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
        >
          <Flag className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label="Información de la conversación"
          className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
        >
          <Info className="size-5" />
        </button>
      </header>

      {pinned && (
        <div className="-mx-4 flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2">
          <Pin className="size-3.5 shrink-0 text-primary" />
          <p className="min-w-0 truncate text-xs text-muted-foreground">{pinned.body}</p>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-none py-4">
        {history.loading ? (
          <ListSkeleton count={4} />
        ) : (
          messages.map((m) => {
            const mine = m.authorId === user.id;
            const author = users.find((u) => u.id === m.authorId);
            return (
              <div
                key={m.id}
                className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}
              >
                {!mine && (
                  <GenerativeCover
                    seed={m.authorId}
                    gradient={author?.color}
                    className="size-7 shrink-0"
                    rounded="rounded-full"
                  />
                )}
                <div
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setReactionFor(m.id);
                  }}
                  onDoubleClick={() => setReactionFor(m.id)}
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-left text-sm",
                    mine
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-surface-2",
                  )}
                >
                  {conversation.kind === "group" && !mine && (
                    <span className="mb-0.5 block text-[0.68rem] font-semibold text-primary">
                      {author?.name}
                    </span>
                  )}

                  {/*
                    El adjunto manda sobre el tipo: una imagen se ve, un audio se
                    escucha y lo demás se baja. El texto, si lo hay, va debajo.
                  */}
                  {m.attachment ? (
                    <span className="block">
                      <MessageAttachmentView attachment={m.attachment} />
                      {m.body && (
                        <span className="mt-1.5 block" data-selectable>
                          {m.body}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span data-selectable>{m.body}</span>
                  )}

                  <span
                    className={cn(
                      "mt-1 block text-right text-[0.62rem] tabular-nums",
                      mine ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {hhmm(m.createdAt)}
                  </span>

                  {m.reactions.length > 0 && (
                    <span className="mt-1 inline-flex rounded-full bg-background/80 px-1.5 py-0.5 text-xs">
                      {m.reactions.join(" ")}
                    </span>
                  )}
                </div>

                {/* Con el dedo se reacciona con pulsación larga; con teclado, aquí. */}
                <button
                  type="button"
                  onClick={() => setReactionFor(m.id)}
                  aria-label={`Reaccionar al mensaje de ${author?.name ?? "esta persona"}`}
                  className="sr-only shrink-0 rounded-lg px-2 py-1 text-xs text-primary focus-visible:not-sr-only focus-visible:static"
                >
                  Reaccionar
                </button>
              </div>
            );
          })
        )}

        {peerTyping && (
          <div className="flex items-center gap-2">
            <GenerativeCover
              seed={conversation.participantIds[1]}
              gradient={conversation.color}
              className="size-7 shrink-0"
              rounded="rounded-full"
            />
            <div className="flex gap-1 rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}

      {/* Un solo selector para las tres formas de adjuntar. */}
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void sendFile(file, file.name);
        }}
      />

      {uploading != null && (
        <div className="-mx-4 shrink-0 border-t border-border bg-surface px-4 py-2">
          <p className="mb-1 text-xs text-muted-foreground">Enviando archivo… {uploading} %</p>
          <span className="block h-1 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${uploading}%` }}
            />
          </span>
        </div>
      )}

      <form
        onSubmit={send}
        className="-mx-4 flex shrink-0 items-end gap-2 border-t border-border bg-surface px-3 py-2.5 pb-[calc(0.625rem+var(--safe-bottom))]"
      >
        <button
          type="button"
          onClick={() => setAttachOpen(true)}
          disabled={recordingFor != null}
          aria-label="Adjuntar"
          className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary disabled:opacity-40"
        >
          <Paperclip className="size-5" />
        </button>
        {recordingFor != null ? (
          <span className="flex min-h-10 flex-1 items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/8 px-3.5 text-sm">
            <span className="size-2 animate-pulse rounded-full bg-destructive" />
            <span className="tabular-nums">
              {String(Math.floor(recordingFor / 60)).padStart(2, "0")}:
              {String(recordingFor % 60).padStart(2, "0")}
            </span>
            <span className="text-xs text-muted-foreground">Grabando nota de voz</span>
          </span>
        ) : (
          <input
            value={draft}
            onChange={(e) => {
              drafts.set(conversation.id, e.target.value);
              noteTyping();
            }}
            placeholder="Mensaje"
            aria-label="Escribe un mensaje"
            enterKeyHint="send"
            className="max-h-28 min-h-10 flex-1 rounded-2xl border border-input bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus-visible:border-ring"
          />
        )}
        {recordingFor != null ? (
          <>
            <button
              type="button"
              onClick={discardRecording}
              aria-label="Descartar la nota de voz"
              className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
            >
              <X className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => void finishRecording()}
              aria-label="Enviar la nota de voz"
              className="tap-target grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
            >
              <Square className="size-4 fill-current" />
            </button>
          </>
        ) : draft.trim() ? (
          <button
            type="submit"
            aria-label="Enviar"
            className="tap-target grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            <Send className="size-4.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void beginRecording()}
            aria-label="Grabar nota de voz"
            className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
          >
            <Mic className="size-5" />
          </button>
        )}
      </form>

      {/* Attachments */}
      <BottomSheet open={attachOpen} onOpenChange={setAttachOpen}>
        <BottomSheetContent title="Adjuntar">
          {/*
            Las tres opciones abren el mismo selector con distinto filtro: es lo
            que entienden por igual el navegador y el WebView del teléfono, y la
            cámara se abre sola cuando se pide `capture`.
          */}
          <SheetAction
            icon={ImageIcon}
            label="Galería"
            onClick={() => {
              setAttachOpen(false);
              openPicker("image/*,video/*");
            }}
          />
          <SheetAction
            icon={Camera}
            label="Cámara"
            onClick={() => {
              setAttachOpen(false);
              openPicker("image/*", true);
            }}
          />
          <SheetAction
            icon={Paperclip}
            label="Documento"
            onClick={() => {
              setAttachOpen(false);
              openPicker(".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.epub");
            }}
          />
        </BottomSheetContent>
      </BottomSheet>

      {/* Reactions */}
      <BottomSheet open={reactionFor !== null} onOpenChange={(v) => !v && setReactionFor(null)}>
        <BottomSheetContent title="Reaccionar">
          <div className="flex justify-between gap-2 pb-2">
            {REACTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === reactionFor ? { ...m, reactions: [...m.reactions, r] } : m,
                    ),
                  );
                  messageService.react(reactionFor!, r);
                  haptic("light");
                  setReactionFor(null);
                }}
                className="tap-target flex-1 rounded-xl border border-border text-2xl transition-transform active:scale-95"
              >
                {r}
              </button>
            ))}
          </div>
        </BottomSheetContent>
      </BottomSheet>

      {/* Conversation info */}
      {/* Reportar (como en Chambas GT): llega a Administración → Moderación. */}
      <BottomSheet open={reportOpen} onOpenChange={setReportOpen}>
        <BottomSheetContent title="Reportar conversación" description="Cuéntanos qué pasa. La administración lo revisará.">
          {REPORT_REASONS.map((r) => (
            <SheetAction
              key={r}
              icon={Flag}
              label={r}
              onClick={async () => {
                setReportOpen(false);
                try {
                  await communityService.report(`chat:${conversation.id}`, r);
                  toast.success("Reporte enviado. Gracias por cuidar la comunidad.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "No se pudo enviar el reporte.");
                }
              }}
            />
          ))}
          <p className="mt-3 px-1 text-xs text-muted-foreground">
            Si estás en peligro, llama a la policía de tu país (en Guatemala, PNC 110).
          </p>
        </BottomSheetContent>
      </BottomSheet>

      <BottomSheet open={infoOpen} onOpenChange={setInfoOpen}>
        <BottomSheetContent title={conversation.title} description="Información de la conversación">
          <div className="mb-4 flex flex-col items-center">
            <GenerativeCover
              seed={conversation.id}
              gradient={conversation.color}
              className="size-20"
              rounded="rounded-full"
            />
            <p className="mt-3 font-display text-base font-semibold">{conversation.title}</p>
            <Badge variant="outline" className="mt-1.5">
              {conversation.kind === "group" ? "Grupo" : "Conversación directa"}
            </Badge>
          </div>
          <p className="mb-2 px-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Participantes
          </p>
          <div className="space-y-1">
            {conversation.participantIds.map((pid) => {
              const p = users.find((u) => u.id === pid);
              return (
                <div key={pid} className="flex items-center gap-3 rounded-lg p-2">
                  <GenerativeCover
                    seed={pid}
                    gradient={p?.color}
                    className="size-9 shrink-0"
                    rounded="rounded-full"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{p?.name ?? pid}</span>
                </div>
              );
            })}
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

/* ------------------------------------------------------------------ list */

const REPORT_REASONS = [
  "Acoso o trato inapropiado",
  "Fraude o pide dinero",
  "Contenido ofensivo",
  "Spam o publicidad",
  "Otro motivo",
];

export default function Messages() {
  usePageMeta("Mensajes", "Tus conversaciones en Heseria.");
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const openId = params.get("c");
  const [q, setQ] = useState("");

  const conversations = useAsync(() => messageService.conversations(), []);
  const active = conversations.data?.find((c) => c.id === openId);
  const [composing, setComposing] = useState(false);

  useScreen(
    active
      ? { title: active.title, immersive: true }
      : {
          title: "Mensajes",
          actions: (
            <button
              type="button"
              onClick={() => setComposing(true)}
              aria-label="Nuevo mensaje"
              className="tap-target grid place-items-center rounded-full text-primary active:bg-secondary"
            >
              <PenSquare className="size-5" />
            </button>
          ),
        },
    [active?.id],
  );

  if (active) {
    // Immersive: AppShell drops its own padding, so the chat owns the full
    // viewport and re-adds the gutter its children expect.
    return (
      <div className="flex h-dvh flex-col px-4 pt-safe">
        <ConversationView conversation={active} onBack={() => setParams({})} />
      </div>
    );
  }

  const visible = conversations.data?.filter((c) =>
    c.title.toLowerCase().includes(q.toLowerCase()),
  );

  /** Abre la conversación recién creada y refresca la lista. */
  function openConversation(id: string) {
    conversations.reload();
    setParams({ c: id });
  }

  return (
    <div className="space-y-4">
      <NewConversationSheet
        open={composing}
        onOpenChange={setComposing}
        onOpened={openConversation}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar conversación"
          aria-label="Buscar conversación"
          className="h-11 rounded-full pl-10"
        />
      </div>

      <AsyncBoundary
        loading={conversations.loading}
        error={conversations.error}
        data={visible}
        reload={conversations.reload}
        skeleton={<ListSkeleton />}
      >
        {(items) => (
          <ul className="space-y-0.5">
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setParams({ c: c.id })}
                  className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors active:bg-secondary"
                >
                  <GenerativeCover
                    seed={c.id}
                    gradient={c.color}
                    className="size-12 shrink-0"
                    rounded="rounded-full"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.title}</span>
                      <span className="shrink-0 text-[0.68rem] tabular-nums text-muted-foreground">
                        {timeAgo(c.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {c.kind === "group" ? "Mensaje del grupo" : "Toca para abrir la conversación"}
                      </span>
                      {c.unread > 0 && (
                        <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[0.62rem] font-semibold text-primary-foreground">
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}

/* ------------------------------------------------------------- adjuntos */

/**
 * El adjunto de un mensaje.
 *
 * Las imágenes y los audios se traen con la sesión puesta y se muestran desde
 * la memoria: poner la URL en un `<img src>` no funcionaría, porque esa
 * petición saldría sin autorización y el servidor la rechazaría. Para todo lo
 * demás basta la ficha de archivo de siempre, con su botón de descarga.
 */
function MessageAttachmentView({ attachment }: { attachment: MessageAttachment }) {
  const [src, setSrc] = useState<string | null>(null);
  const inline = attachment.mime.startsWith("image/") || attachment.mime.startsWith("audio/");

  useEffect(() => {
    if (!inline) return;
    let url: string | null = null;
    let alive = true;

    void fileService
      .blob(attachment.id)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.viewUrl, inline]);

  if (attachment.mime.startsWith("image/")) {
    return src ? (
      <img
        src={src}
        alt={attachment.title}
        className="block w-56 max-w-full rounded-lg object-cover"
      />
    ) : (
      <span className="block aspect-video w-56 animate-pulse rounded-lg bg-muted" />
    );
  }

  if (attachment.mime.startsWith("audio/")) {
    return src ? (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio src={src} controls preload="metadata" className="w-56 max-w-full" />
    ) : (
      <span className="flex items-center gap-2 text-xs opacity-75">
        <Mic className="size-4" /> Cargando nota de voz…
      </span>
    );
  }

  return (
    <FileRow
      file={{
        ...attachment,
        scope: "message",
        scopeId: null,
        visibility: "members",
        ownerId: null,
        createdAt: "",
      }}
      className="w-64 max-w-full border-transparent bg-background/40"
    />
  );
}
