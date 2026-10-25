/**
 * HESERIA — Llamadas de voz y video (WebRTC).
 *
 * El audio y el video viajan **directos entre los dos teléfonos**. El servidor
 * solo los presenta: le pasa a cada uno la descripción de la sesión del otro y
 * los candidatos de red. Eso es lo que hace el canal de tiempo real.
 *
 * Secuencia de una llamada:
 *
 *   quien llama                     servidor                 quien recibe
 *   ───────────                     ────────                 ────────────
 *   call:invite        ──────────────►  ──────────────►  call:incoming
 *                      ◄── call:ringing
 *                      ◄──────────────  ◄──────────────  call:accept
 *   oferta (SDP)       ──────────────►  ──────────────►  aplica la oferta
 *   aplica la respuesta ◄──────────────  ◄──────────────  respuesta (SDP)
 *   candidatos ICE     ◄─────────────►  ◄─────────────►  candidatos ICE
 *                          ... audio y video directos ...
 *   call:hangup        ──────────────►  ──────────────►  call:ended
 *
 * En redes muy cerradas hace falta además un servidor TURN; el servidor lo
 * incluye en `iceServers` si está configurado.
 */
import { useSyncExternalStore } from "react";
import {
  onRealtimeEvent, realtimeIceServers, sendRealtime, type CallPeer, type CallSignal,
} from "@/services/realtime";

export type CallStatus =
  | "inactiva"
  | "saliente"
  | "entrante"
  | "conectando"
  | "activa"
  | "finalizada";

export interface CallState {
  status: CallStatus;
  callId: string | null;
  kind: "audio" | "video";
  peer: CallPeer | null;
  /** Quién inició: decide quién crea la oferta. */
  outgoing: boolean;
  muted: boolean;
  cameraOff: boolean;
  /** Por qué terminó, para explicarlo en pantalla. */
  endedReason: string | null;
  error: string | null;
  seconds: number;
}

const INITIAL: CallState = {
  status: "inactiva",
  callId: null,
  kind: "audio",
  peer: null,
  outgoing: false,
  muted: false,
  cameraOff: false,
  endedReason: null,
  error: null,
  seconds: 0,
};

let state: CallState = INITIAL;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(patch: Partial<CallState>) {
  state = { ...state, ...patch };
  emit();
}

/* ------------------------------------------------------------- WebRTC */

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let timerId: number | undefined;

/** Candidatos que llegan antes de tener descripción remota; se aplican luego. */
let pendingCandidates: RTCIceCandidateInit[] = [];

/** Los elementos de video los registra la pantalla de llamada. */
let localVideoEl: HTMLVideoElement | null = null;
let remoteVideoEl: HTMLVideoElement | null = null;

export function attachVideo(which: "local" | "remote", el: HTMLVideoElement | null) {
  if (which === "local") {
    localVideoEl = el;
    if (el && localStream) el.srcObject = localStream;
  } else {
    remoteVideoEl = el;
    if (el && remoteStream) el.srcObject = remoteStream;
  }
}

function signal(signalPayload: CallSignal) {
  if (!state.callId) return;
  sendRealtime({ type: "call:signal", callId: state.callId, signal: signalPayload });
}

async function openMedia(kind: "audio" | "video"): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video:
      kind === "video"
        ? { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } }
        : false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

function createConnection(): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: realtimeIceServers() });

  pc.onicecandidate = (event) => {
    if (event.candidate) signal({ kind: "ice", candidate: event.candidate.toJSON() });
  };

  pc.ontrack = (event) => {
    remoteStream ??= new MediaStream();
    // Puede llegar primero el audio y después el video.
    for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
      if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
    }
    if (remoteVideoEl) remoteVideoEl.srcObject = remoteStream;
    if (state.status !== "activa") startTalking();
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected" && state.status !== "activa") startTalking();
    if (pc.connectionState === "failed") {
      set({ error: "No se pudo establecer la conexión. Puede que la red la bloquee." });
      hangUp("fallo");
    }
  };

  return pc;
}

function startTalking() {
  set({ status: "activa", seconds: 0 });
  window.clearInterval(timerId);
  timerId = window.setInterval(() => set({ seconds: state.seconds + 1 }), 1000);
}

/** Suelta cámara, micrófono y conexión. Siempre, pase lo que pase. */
function teardown() {
  window.clearInterval(timerId);
  timerId = undefined;
  pendingCandidates = [];

  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  remoteStream = null;

  if (localVideoEl) localVideoEl.srcObject = null;
  if (remoteVideoEl) remoteVideoEl.srcObject = null;

  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
    peerConnection = null;
  }
}

async function applyPending() {
  if (!peerConnection) return;
  for (const candidate of pendingCandidates) {
    await peerConnection.addIceCandidate(candidate).catch(() => undefined);
  }
  pendingCandidates = [];
}

/* --------------------------------------------------------------- acciones */

/** Pide permisos y abre cámara o micrófono. Devuelve si lo consiguió. */
async function prepareMedia(kind: "audio" | "video"): Promise<boolean> {
  try {
    localStream = await openMedia(kind);
    if (localVideoEl) localVideoEl.srcObject = localStream;
    return true;
  } catch (err) {
    if (state.callId) sendRealtime({ type: "call:hangup", callId: state.callId });
    const name = (err as Error)?.name;
    set({
      error:
        name === "NotAllowedError"
          ? `Necesitamos permiso para usar ${kind === "video" ? "la cámara y el micrófono" : "el micrófono"}.`
          : name === "NotFoundError"
            ? "No encontramos micrófono ni cámara en este dispositivo."
            : "No pudimos acceder al micrófono.",
      status: "finalizada",
      endedReason: "sin-medios",
    });
    return false;
  }
}

/** Llama a alguien. `peer` es solo para pintar el nombre mientras suena. */
export async function startCall(peer: CallPeer, kind: "audio" | "video") {
  if (state.status !== "inactiva" && state.status !== "finalizada") return;

  set({
    ...INITIAL,
    status: "saliente",
    kind,
    peer,
    outgoing: true,
    cameraOff: kind === "audio",
  });

  // Los permisos se piden antes de hacer sonar el teléfono del otro: así no
  // suena para nada si al final no hay micrófono.
  if (!(await prepareMedia(kind))) return;

  const ok = sendRealtime({ type: "call:invite", to: peer.id, kind });
  if (!ok) {
    set({ error: "No hay conexión con el servidor.", status: "finalizada", endedReason: "sin-red" });
    teardown();
  }
}

/** ¿Hay una llamada viva a la que pueda referirse un evento que llega? */
const callActive = () =>
  state.status === "saliente" || state.status === "entrante" || state.status === "conectando" ||
  state.status === "activa";

/** Contesta la llamada entrante. */
export async function acceptCall() {
  if (state.status !== "entrante" || !state.callId) return;
  if (!(await prepareMedia(state.kind))) {
    sendRealtime({ type: "call:reject", callId: state.callId });
    return;
  }
  set({ status: "conectando" });
  sendRealtime({ type: "call:accept", callId: state.callId });
}

export function rejectCall() {
  if (state.callId) sendRealtime({ type: "call:reject", callId: state.callId });
  teardown();
  set({ ...INITIAL, status: "finalizada", endedReason: "rechazada", peer: state.peer });
}

export function hangUp(reason = "colgada") {
  if (state.callId) sendRealtime({ type: "call:hangup", callId: state.callId });
  teardown();
  set({ status: "finalizada", endedReason: reason });
}

/** Cierra la pantalla una vez terminada. */
export function dismissCall() {
  teardown();
  set({ ...INITIAL });
}

export function toggleMute() {
  const next = !state.muted;
  localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
  set({ muted: next });
}

export function toggleCamera() {
  const next = !state.cameraOff;
  localStream?.getVideoTracks().forEach((t) => (t.enabled = !next));
  set({ cameraOff: next });
}

/** Cambia entre cámara frontal y trasera sin cortar la llamada. */
export async function flipCamera() {
  if (state.kind !== "video" || !peerConnection || !localStream) return;
  const current = localStream.getVideoTracks()[0];
  const facing = current?.getSettings().facingMode === "environment" ? "user" : "environment";
  try {
    const fresh = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: false,
    });
    const track = fresh.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find((s) => s.track?.kind === "video");
    await sender?.replaceTrack(track);
    current?.stop();
    localStream.removeTrack(current);
    localStream.addTrack(track);
    if (localVideoEl) localVideoEl.srcObject = localStream;
  } catch {
    /* un solo lente: no hay nada que cambiar */
  }
}

/* ------------------------------------------------------ eventos entrantes */

onRealtimeEvent("call:incoming", (event) => {
  // Ocupada: se rechaza para que el otro no se quede esperando.
  if (state.status !== "inactiva" && state.status !== "finalizada") {
    sendRealtime({ type: "call:reject", callId: event.callId });
    return;
  }
  set({
    ...INITIAL,
    status: "entrante",
    callId: event.callId,
    kind: event.kind,
    peer: event.from,
    outgoing: false,
    cameraOff: event.kind === "audio",
  });
});

onRealtimeEvent("call:ringing", (event) => {
  if (state.status !== "saliente") return;
  set({ callId: event.callId });
});

onRealtimeEvent("call:accepted", async () => {
  // Puede llegar tarde, cuando ya se abandonó la llamada: entonces se ignora,
  // o reaparecería una pantalla de llamada vacía.
  if (!callActive()) return;
  set({ status: "conectando" });
  // Quien llamó crea la oferta; quien contestó espera a recibirla.
  if (!state.outgoing) return;

  peerConnection = createConnection();
  localStream?.getTracks().forEach((track) => peerConnection?.addTrack(track, localStream!));

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  signal({ kind: "offer", sdp: offer });
});

/**
 * ¿Esto es una descripción de sesión que WebRTC pueda aceptar?
 *
 * La señal llega por la red desde el otro teléfono. Si viene a medias —por
 * un corte, por una versión antigua de la app o por un evento rezagado—,
 * `setRemoteDescription` lanza y la llamada se queda colgada sin explicación.
 * Mejor descartarla y seguir esperando la buena.
 */
function isSessionDescription(value: unknown): value is RTCSessionDescriptionInit {
  if (typeof value !== "object" || value === null) return false;
  const sdp = value as { type?: unknown; sdp?: unknown };
  return (
    (sdp.type === "offer" || sdp.type === "answer" || sdp.type === "pranswer") &&
    typeof sdp.sdp === "string" &&
    sdp.sdp.length > 0
  );
}

onRealtimeEvent("call:signal", async (event) => {
  if (!callActive() || event.callId !== state.callId) return;
  const payload = event.signal;

  if (payload.kind === "offer") {
    peerConnection ??= createConnection();
    localStream?.getTracks().forEach((track) => {
      const already = peerConnection?.getSenders().some((s) => s.track === track);
      if (!already) peerConnection?.addTrack(track, localStream!);
    });
    if (!isSessionDescription(payload.sdp)) return;
    await peerConnection.setRemoteDescription(payload.sdp);
    await applyPending();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    signal({ kind: "answer", sdp: answer });
    return;
  }

  if (payload.kind === "answer") {
    if (!peerConnection) return;
    if (!isSessionDescription(payload.sdp)) return;
    await peerConnection.setRemoteDescription(payload.sdp);
    await applyPending();
    return;
  }

  if (payload.kind === "ice") {
    if (!peerConnection?.remoteDescription) {
      pendingCandidates.push(payload.candidate);
      return;
    }
    await peerConnection.addIceCandidate(payload.candidate).catch(() => undefined);
  }
});

onRealtimeEvent("call:ended", (event) => {
  if (!callActive()) return;
  teardown();
  set({ status: "finalizada", endedReason: event.reason });
});

onRealtimeEvent("call:failed", (event) => {
  if (!callActive()) return;
  teardown();
  set({
    status: "finalizada",
    endedReason: event.reason,
    error:
      event.reason === "desconectado"
        ? "Esa persona no tiene la app abierta ahora mismo."
        : "No pudimos iniciar la llamada.",
  });
});

/* ------------------------------------------------------------------ hook */

export function useCall(): CallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => state,
  );
}

export const callState = () => state;
