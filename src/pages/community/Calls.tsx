import {
  Mic, MicOff, Phone, PhoneOff, RefreshCw, Video, VideoOff, Volume2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { GenerativeCover } from "@/components/media/covers";
import { haptic } from "@/native";
import {
  acceptCall, attachVideo, dismissCall, flipCamera, hangUp, rejectCall, toggleCamera, toggleMute,
  useCall,
} from "@/store/call";
import { cn, formatDuration } from "@/lib/utils";

/**
 * HESERIA — Pantalla de llamada.
 *
 * El audio y el video son reales: van directos entre los dos dispositivos por
 * WebRTC. Esta pantalla solo pinta lo que ocurre y expone los controles; toda
 * la mecánica vive en `@/store/call`.
 */
export function CallOverlay() {
  const call = useCall();
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  // Los elementos de video se registran para que el motor les enchufe la señal.
  useEffect(() => {
    attachVideo("local", localRef.current);
    attachVideo("remote", remoteRef.current);
    return () => {
      attachVideo("local", null);
      attachVideo("remote", null);
    };
  }, [call.status]);

  // Una llamada entrante avisa con vibración.
  useEffect(() => {
    if (call.status === "entrante") haptic("heavy");
    if (call.status === "activa") haptic("success");
  }, [call.status]);

  // Terminada, la pantalla se retira sola.
  useEffect(() => {
    if (call.status !== "finalizada") return;
    const id = window.setTimeout(dismissCall, call.error ? 3200 : 1400);
    return () => window.clearTimeout(id);
  }, [call.status, call.error]);

  if (call.status === "inactiva") return null;

  const { peer, kind, status } = call;
  const title = peer?.name ?? "Llamada";

  const statusLabel = {
    saliente: "Llamando…",
    entrante: kind === "video" ? "Videollamada entrante" : "Llamada entrante",
    conectando: "Conectando…",
    activa: formatDuration(call.seconds),
    finalizada:
      call.endedReason === "rechazada"
        ? "Llamada rechazada"
        : call.endedReason === "desconexion"
          ? "Se perdió la conexión"
          : "Llamada finalizada",
    inactiva: "",
  }[status];

  const showRemoteVideo = kind === "video" && status === "activa";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background pt-safe">
      <div className="relative flex-1 overflow-hidden">
        {/* Video del otro extremo, o su avatar mientras no llega imagen. */}
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className={cn(
            "absolute inset-0 size-full bg-black object-cover",
            showRemoteVideo ? "opacity-100" : "opacity-0",
          )}
        />

        {!showRemoteVideo && (
          <>
            <GenerativeCover
              seed={peer?.id ?? title}
              gradient={peer?.color ?? "from-indigo-500/70 to-slate-800/70"}
              rounded="rounded-none"
              className="absolute inset-0 size-full"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <GenerativeCover
                seed={`${peer?.id ?? title}-avatar`}
                gradient={peer?.color}
                className="size-32"
                rounded="rounded-full"
                label={title}
              />
              <h1 className="mt-6 font-display text-2xl font-semibold text-white">{title}</h1>
              <p className="mt-1.5 text-sm tabular-nums text-white/75">{statusLabel}</p>
              {call.error && (
                <p
                  role="alert"
                  className="mx-8 mt-4 rounded-xl bg-black/55 px-4 py-2.5 text-center text-sm text-white backdrop-blur"
                >
                  {call.error}
                </p>
              )}
            </div>
          </>
        )}

        {showRemoteVideo && (
          <div className="absolute inset-x-0 top-0 p-5 pt-8 text-center">
            <h1 className="font-display text-xl font-semibold text-white drop-shadow">{title}</h1>
            <p className="mt-1 text-sm tabular-nums text-white/80">{statusLabel}</p>
          </div>
        )}

        {/* Vista propia. Se ve en cuanto hay cámara, también mientras suena. */}
        {kind === "video" && (
          <div
            className={cn(
              "absolute bottom-4 right-4 w-28 overflow-hidden rounded-2xl border-2 border-white/25 bg-black transition-opacity",
              call.cameraOff ? "opacity-0" : "opacity-100",
            )}
          >
            <video
              ref={localRef}
              autoPlay
              playsInline
              muted
              className="aspect-[3/4] w-full scale-x-[-1] object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-center text-[0.6rem] text-white">
              Tú
            </span>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="shrink-0 bg-surface px-6 py-6 pb-[calc(1.5rem+var(--safe-bottom))]">
        {status === "entrante" ? (
          <div className="flex items-center justify-around">
            <button
              type="button"
              onClick={rejectCall}
              aria-label="Rechazar"
              className="grid size-16 place-items-center rounded-full bg-destructive text-destructive-foreground transition-transform active:scale-95"
            >
              <PhoneOff className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => void acceptCall()}
              aria-label="Contestar"
              className="grid size-16 place-items-center rounded-full bg-success text-success-foreground transition-transform active:scale-95"
            >
              <Phone className="size-6" />
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-4 gap-3">
              <ControlButton
                icon={call.muted ? MicOff : Mic}
                label={call.muted ? "Silenciado" : "Micrófono"}
                active={call.muted}
                onClick={toggleMute}
              />
              <ControlButton
                icon={call.cameraOff ? VideoOff : Video}
                label="Cámara"
                active={call.cameraOff}
                disabled={kind !== "video"}
                onClick={toggleCamera}
              />
              <ControlButton
                icon={RefreshCw}
                label="Girar"
                disabled={kind !== "video" || status !== "activa"}
                onClick={() => void flipCamera()}
              />
              <ControlButton icon={Volume2} label="Altavoz" active onClick={() => haptic("light")} />
            </div>

            <button
              type="button"
              onClick={() => hangUp()}
              aria-label="Colgar"
              disabled={status === "finalizada"}
              className="mx-auto grid size-16 place-items-center rounded-full bg-destructive text-destructive-foreground transition-transform active:scale-95 disabled:opacity-50"
            >
              <PhoneOff className="size-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: typeof Mic;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        onClick();
      }}
      disabled={disabled}
      aria-pressed={active}
      className="flex flex-col items-center gap-1.5 disabled:opacity-35"
    >
      <span
        className={cn(
          "grid size-12 place-items-center rounded-full transition-colors",
          active ? "bg-foreground text-background" : "bg-secondary text-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="text-[0.65rem] text-muted-foreground">{label}</span>
    </button>
  );
}
