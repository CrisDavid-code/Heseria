/**
 * HESERIA — Canal de tiempo real sobre Firestore.
 *
 * Antes era un WebSocket contra el servidor propio. Sin servidor, lo mismo lo
 * dan los oyentes de Firestore (`onSnapshot`): un mensaje nuevo, el «está
 * escribiendo…», un aviso o una llamada entrante llegan al instante.
 *
 * El contrato no cambió: las pantallas se suscriben por tipo de evento con
 * `onRealtimeEvent()` y mandan con `sendRealtime()`. Solo cambió el transporte,
 * así que el chat, la campana y las llamadas siguen igual.
 */
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import { ms } from "@/services/fb";
import { ICE_SERVERS, toMessage, toNotification } from "@/services";
import type { Message, NotificationItem } from "@/types";

/* ---------------------------------------------------------------- tipos */

export interface CallPeer {
  id: string;
  name: string;
  color: string;
}

export type RealtimeEvent =
  | { type: "ready"; userId: string; iceServers: RTCIceServer[] }
  | { type: "message"; conversationId: string; message: Message }
  | { type: "typing"; conversationId: string; userId: string; typing: boolean }
  | { type: "read"; conversationId: string; by: string }
  | { type: "notification"; notification: NotificationItem }
  | { type: "call:incoming"; callId: string; kind: "audio" | "video"; from: CallPeer }
  | { type: "call:ringing"; callId: string; kind: "audio" | "video"; iceServers: RTCIceServer[] }
  | { type: "call:accepted"; callId: string; iceServers?: RTCIceServer[] }
  | { type: "call:signal"; callId: string; signal: CallSignal }
  | { type: "call:ended"; callId: string; reason: string }
  | { type: "call:failed"; reason: string }
  | { type: "pong" };

export type CallSignal =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

export type ConnectionState = "cerrado" | "conectando" | "conectado";

/* --------------------------------------------------------------- estado */

let state: ConnectionState = "cerrado";
let subscriptions: Unsubscribe[] = [];
/** Oyentes de las señales de cada llamada en curso. */
const callSignals = new Map<string, Unsubscribe>();
/** Hasta dónde se avisó de cada chat, para no repetir mensajes. */
const lastSeen = new Map<string, number>();
/** Lo que ya se emitió de «escribiendo» por chat y persona. */
const typingState = new Map<string, boolean>();
let startedAt = 0;

type Listener = (event: RealtimeEvent) => void;
const listeners = new Set<Listener>();
const stateListeners = new Set<(s: ConnectionState) => void>();

function setState(next: ConnectionState) {
  if (state === next) return;
  state = next;
  stateListeners.forEach((l) => l(next));
}

function emit(event: RealtimeEvent) {
  listeners.forEach((l) => {
    try {
      // Un oyente `async` devuelve una promesa: si revienta más tarde, el
      // `catch` de aquí ya no está escuchando.
      const result = l(event) as unknown;
      if (result instanceof Promise) {
        void result.catch((err: unknown) => {
          console.error("[heseria] fallo en un oyente de tiempo real", err);
        });
      }
    } catch (err) {
      console.error("[heseria] fallo en un oyente de tiempo real", err);
    }
  });
}

/* ------------------------------------------------------------- conexión */

/** Engancha los oyentes de la cuenta. Llamarla dos veces no duplica nada. */
export function connectRealtime(): void {
  const uid = auth?.currentUser?.uid;
  if (!uid || subscriptions.length > 0) return;
  setState("conectando");
  startedAt = Date.now();

  // Mensajes, «escribiendo…» y leídos: todo sale del resumen de cada chat.
  subscriptions.push(
    onSnapshot(
      query(collection(db, "chats"), where("members", "array-contains", uid)),
      (snap) => {
        setState("conectado");
        for (const change of snap.docChanges()) {
          if (change.type === "removed") continue;
          const chatId = change.doc.id;
          const x = change.doc.data();
          void onChatChange(uid, chatId, x);
        }
      },
      () => setState("cerrado"),
    ),
  );

  // Avisos de la campana que lleguen después de abrir la app.
  subscriptions.push(
    onSnapshot(
      query(collection(db, `users/${uid}/notifications`), orderBy("createdAt", "desc"), limit(10)),
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== "added") continue;
          const n = toNotification(change.doc);
          if (n && ms(n.createdAt) >= startedAt - 5000 && !n.read) emit({ type: "notification", notification: n });
        }
      },
    ),
  );

  // Llamadas que me hacen.
  subscriptions.push(
    onSnapshot(query(collection(db, "calls"), where("to", "==", uid)), (snap) => {
      for (const change of snap.docChanges()) onCallChange(uid, change.doc.id, change.doc.data(), change.type);
    }),
  );
  // Llamadas que hago.
  subscriptions.push(
    onSnapshot(query(collection(db, "calls"), where("from", "==", uid)), (snap) => {
      for (const change of snap.docChanges()) onCallChange(uid, change.doc.id, change.doc.data(), change.type);
    }),
  );

  emit({ type: "ready", userId: uid, iceServers: ICE_SERVERS });
}

async function onChatChange(uid: string, chatId: string, x: Record<string, unknown>) {
  const last = x.last as { authorId?: string } | undefined;
  const lastAt = ms(x.lastAt);

  // Mensajes nuevos de otras personas desde la última vez que se avisó.
  const since = lastSeen.get(chatId) ?? startedAt;
  if (last && lastAt > since) {
    lastSeen.set(chatId, lastAt);
    const fresh = await getDocs(
      query(collection(db, `chats/${chatId}/messages`), orderBy("createdAt"), where("createdAt", ">", new Date(since))),
    ).catch(() => null);
    for (const d of fresh?.docs ?? []) {
      const message = toMessage(d, chatId);
      if (message) emit({ type: "message", conversationId: chatId, message });
    }
  } else if (!lastSeen.has(chatId)) {
    lastSeen.set(chatId, Math.max(lastAt, startedAt));
  }

  // «Escribiendo…»: un sello de hace menos de seis segundos.
  const typing = (x.typing ?? {}) as Record<string, unknown>;
  const members = (x.members as string[]) ?? [];
  for (const member of members) {
    if (member === uid) continue;
    const isTyping = Date.now() - ms(typing[member] ?? 0) < 6000 && typing[member] != null;
    const key = `${chatId}:${member}`;
    if (typingState.get(key) !== isTyping) {
      typingState.set(key, isTyping);
      emit({ type: "typing", conversationId: chatId, userId: member, typing: isTyping });
    }
  }
}

/* ------------------------------------------------------------ llamadas */

function onCallChange(uid: string, callId: string, x: Record<string, unknown>, change: string) {
  if (change === "removed") return;
  const status = x.status as string;
  const kind = (x.kind as "audio" | "video") ?? "audio";
  const incoming = x.to === uid;
  // Una llamada vieja que se quedó a medias no debe sonar al abrir la app.
  const fresh = Date.now() - ms(x.createdAt) < 60_000;

  if (status === "ringing" && change === "added" && fresh) {
    if (incoming) {
      emit({ type: "call:incoming", callId, kind, from: x.fromPeer as CallPeer });
    } else {
      emit({ type: "call:ringing", callId, kind, iceServers: ICE_SERVERS });
    }
    watchSignals(uid, callId);
  } else if (status === "accepted" && change === "modified") {
    emit({ type: "call:accepted", callId, iceServers: ICE_SERVERS });
  } else if (status === "ended" && change === "modified") {
    emit({ type: "call:ended", callId, reason: (x.reason as string) ?? "colgada" });
    callSignals.get(callId)?.();
    callSignals.delete(callId);
  }
}

/** La negociación WebRTC (oferta, respuesta y candidatos) del otro lado. */
function watchSignals(uid: string, callId: string) {
  if (callSignals.has(callId)) return;
  const off = onSnapshot(collection(db, `calls/${callId}/signals`), (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type !== "added") continue;
      const s = change.doc.data();
      if (s.from === uid) continue;
      emit({ type: "call:signal", callId, signal: s.signal as CallSignal });
    }
  });
  callSignals.set(callId, off);
}

export function disconnectRealtime(): void {
  subscriptions.forEach((off) => off());
  subscriptions = [];
  callSignals.forEach((off) => off());
  callSignals.clear();
  lastSeen.clear();
  typingState.clear();
  setState("cerrado");
}

/** Firestore se reconecta solo; esto solo engancha si aún no había oyentes. */
export function reviveRealtime(): void {
  connectRealtime();
}

export const realtimeState = (): ConnectionState => state;
export const realtimeIceServers = (): RTCIceServer[] => ICE_SERVERS;

/* ---------------------------------------------------------- suscripción */

export function onRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function onRealtimeEvent<T extends RealtimeEvent["type"]>(
  type: T,
  listener: (event: Extract<RealtimeEvent, { type: T }>) => void,
): () => void {
  return onRealtime((event) => {
    if (event.type === type) listener(event as Extract<RealtimeEvent, { type: T }>);
  });
}

export function onRealtimeState(listener: (s: ConnectionState) => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/* ------------------------------------------------------------- emisión */

/**
 * Manda algo «por el canal»: lo traduce a la escritura de Firestore que
 * corresponde. Devuelve si había sesión para hacerlo.
 */
export function sendRealtime(payload: Record<string, unknown>): boolean {
  const uid = auth?.currentUser?.uid;
  if (!uid) return false;
  void send(uid, payload).catch((err) => {
    console.error("[heseria] no se pudo enviar", err);
    if (String(payload.type).startsWith("call:")) emit({ type: "call:failed", reason: "red" });
  });
  return true;
}

async function send(uid: string, p: Record<string, unknown>) {
  switch (p.type) {
    case "typing":
      await updateDoc(doc(db, "chats", String(p.conversationId)), {
        [`typing.${uid}`]: p.typing ? serverTimestamp() : deleteField(),
      });
      return;
    case "read":
      await updateDoc(doc(db, "chats", String(p.conversationId)), {
        [`readBy.${uid}`]: serverTimestamp(),
        [`unread.${uid}`]: 0,
      });
      emit({ type: "read", conversationId: String(p.conversationId), by: uid });
      return;

    case "call:invite": {
      const to = String(p.to);
      const [meSnap, peerSnap] = await Promise.all([getDoc(doc(db, "users", uid)), getDoc(doc(db, "users", to))]);
      if (!peerSnap.exists()) {
        emit({ type: "call:failed", reason: "no_existe" });
        return;
      }
      const meData = meSnap.data() ?? {};
      const callRef = doc(collection(db, "calls"));
      await setDoc(callRef, {
        from: uid,
        to,
        kind: p.kind === "video" ? "video" : "audio",
        status: "ringing",
        fromPeer: { id: uid, name: meData.name ?? "", color: meData.color ?? "" },
        createdAt: serverTimestamp(),
      });
      return;
    }
    case "call:accept":
      await updateDoc(doc(db, "calls", String(p.callId)), { status: "accepted", acceptedAt: serverTimestamp() });
      return;
    case "call:reject":
    case "call:hangup":
      await updateDoc(doc(db, "calls", String(p.callId)), {
        status: "ended",
        reason: p.type === "call:reject" ? "rechazada" : "colgada",
        endedBy: uid,
        endedAt: serverTimestamp(),
      });
      return;
    case "call:signal":
      await addDoc(collection(db, `calls/${String(p.callId)}/signals`), {
        from: uid,
        // JSON plano: Firestore no acepta las clases de WebRTC tal cual.
        signal: JSON.parse(JSON.stringify(p.signal)),
        createdAt: serverTimestamp(),
      });
      return;
    default:
      return;
  }
}

export const sendTyping = (conversationId: string, typing: boolean) =>
  sendRealtime({ type: "typing", conversationId, typing });

export const sendRead = (conversationId: string) => sendRealtime({ type: "read", conversationId });
