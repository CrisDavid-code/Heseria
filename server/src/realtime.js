/**
 * HESERIA — Tiempo real (WebSocket).
 *
 * Un solo canal para tres cosas que antes no funcionaban:
 *
 *   1. **Mensajes en vivo.** Lo que alguien escribe aparece en la pantalla del
 *      otro sin recargar.
 *   2. **Notificaciones al instante.** Una campaña enviada llega al buzón
 *      abierto en ese momento.
 *   3. **Señalización de llamadas.** El intercambio de ofertas, respuestas y
 *      candidatos ICE que necesita WebRTC para conectar dos teléfonos.
 *
 * El audio y el video de una llamada **no pasan por aquí**: viajan directos
 * entre los dos dispositivos. Este servidor solo los presenta.
 */
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { db, getSetting, newId, setSetting } from "./db.js";
import crypto from "node:crypto";

/* ------------------------------------------------------------- conexiones */

/** userId → Set de sockets (una persona puede tener varios dispositivos). */
const clients = new Map();

/** callId → { from, to, kind, startedAt } */
const calls = new Map();

function secret() {
  if (process.env.HESERIA_JWT_SECRET) return process.env.HESERIA_JWT_SECRET;
  let stored = getSetting("jwtSecret");
  if (!stored) {
    stored = crypto.randomBytes(48).toString("hex");
    setSetting("jwtSecret", stored);
  }
  return stored;
}

/** Manda un objeto a todos los dispositivos de una persona. Devuelve cuántos. */
export function sendTo(userId, payload) {
  const sockets = clients.get(userId);
  if (!sockets?.size) return 0;
  const data = JSON.stringify(payload);
  let sent = 0;
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(data);
      sent++;
    }
  }
  return sent;
}

/** ¿Tiene esta persona la app abierta ahora mismo? */
export const isOnline = (userId) => Boolean(clients.get(userId)?.size);

export const onlineCount = () => clients.size;

/* ---------------------------------------------------------------- mensajes */

const conversationMembers = db.prepare(
  "SELECT user_id FROM conversation_members WHERE conversation_id = ?",
);

/** Reparte un mensaje nuevo a los demás participantes conectados. */
export function broadcastMessage(conversationId, message, exceptUserId) {
  const members = conversationMembers.all(conversationId).map((m) => m.user_id);
  let delivered = 0;
  for (const userId of members) {
    if (userId === exceptUserId) continue;
    delivered += sendTo(userId, { type: "message", conversationId, message });
  }
  return delivered;
}

/** Avisa de que alguien está escribiendo. No se guarda nada. */
function broadcastTyping(conversationId, fromUserId, typing) {
  for (const { user_id: userId } of conversationMembers.all(conversationId)) {
    if (userId === fromUserId) continue;
    sendTo(userId, { type: "typing", conversationId, userId: fromUserId, typing });
  }
}

/* ----------------------------------------------------------- notificaciones */

/** Empuja una notificación recién creada a quien la recibe, si está conectado. */
export function pushNotification(userId, notification) {
  return sendTo(userId, { type: "notification", notification });
}

/* -------------------------------------------------------------- llamadas */

const userName = db.prepare("SELECT id, name, color FROM users WHERE id = ?");

/**
 * Servidores STUN públicos de Google. Bastan para conectar dos dispositivos en
 * la mayoría de redes domésticas y móviles.
 *
 * En redes muy cerradas (NAT simétrico, algunas corporativas) hace falta además
 * un servidor TURN, que retransmite el audio y el video. TURN consume ancho de
 * banda, así que se contrata aparte: basta con poner `HESERIA_TURN_URL`,
 * `HESERIA_TURN_USER` y `HESERIA_TURN_PASS` y aparecerá aquí sin tocar código.
 */
export function iceServers() {
  const servers = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  if (process.env.HESERIA_TURN_URL) {
    servers.push({
      urls: process.env.HESERIA_TURN_URL,
      username: process.env.HESERIA_TURN_USER,
      credential: process.env.HESERIA_TURN_PASS,
    });
  }
  return servers;
}

function endCall(callId, reason, byUserId) {
  const call = calls.get(callId);
  if (!call) return;
  calls.delete(callId);
  for (const userId of [call.from, call.to]) {
    if (userId === byUserId) continue;
    sendTo(userId, { type: "call:ended", callId, reason });
  }
}

/** Corta las llamadas en las que participaba alguien que se desconectó. */
function endCallsOf(userId) {
  for (const [callId, call] of calls) {
    if (call.from === userId || call.to === userId) {
      endCall(callId, "desconexion", userId);
    }
  }
}

/* ------------------------------------------------------------- protocolo */

function handle(socket, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const me = socket.userId;

  switch (msg.type) {
    /* ------------------------------------------------------------ chat */

    case "typing": {
      if (typeof msg.conversationId !== "string") return;
      broadcastTyping(msg.conversationId, me, Boolean(msg.typing));
      return;
    }

    case "read": {
      if (typeof msg.conversationId !== "string") return;
      db.prepare(
        "UPDATE messages SET read = 1 WHERE conversation_id = ? AND sender_id <> ?",
      ).run(msg.conversationId, me);
      for (const { user_id: userId } of conversationMembers.all(msg.conversationId)) {
        if (userId !== me) sendTo(userId, { type: "read", conversationId: msg.conversationId, by: me });
      }
      return;
    }

    /* -------------------------------------------------------- llamadas */

    case "call:invite": {
      const to = String(msg.to ?? "");
      const kind = msg.kind === "video" ? "video" : "audio";
      const target = userName.get(to);
      if (!target) {
        socket.send(JSON.stringify({ type: "call:failed", reason: "no_existe" }));
        return;
      }
      if (!isOnline(to)) {
        socket.send(JSON.stringify({ type: "call:failed", reason: "desconectado" }));
        return;
      }

      const callId = newId("call");
      calls.set(callId, { from: me, to, kind, startedAt: Date.now() });

      const caller = userName.get(me);
      sendTo(to, {
        type: "call:incoming",
        callId,
        kind,
        from: { id: caller.id, name: caller.name, color: caller.color },
      });
      socket.send(JSON.stringify({ type: "call:ringing", callId, kind, iceServers: iceServers() }));
      return;
    }

    case "call:accept": {
      const call = calls.get(msg.callId);
      if (!call || call.to !== me) return;
      call.accepted = true;
      // Quien llamó crea la oferta; quien contesta espera.
      sendTo(call.from, { type: "call:accepted", callId: msg.callId });
      socket.send(JSON.stringify({ type: "call:accepted", callId: msg.callId, iceServers: iceServers() }));
      return;
    }

    case "call:reject":
    case "call:hangup": {
      const call = calls.get(msg.callId);
      if (!call || (call.from !== me && call.to !== me)) return;
      endCall(msg.callId, msg.type === "call:reject" ? "rechazada" : "colgada", me);
      return;
    }

    /* Relevo ciego de la negociación WebRTC entre los dos extremos. */
    case "call:signal": {
      const call = calls.get(msg.callId);
      if (!call || (call.from !== me && call.to !== me)) return;
      const other = call.from === me ? call.to : call.from;
      sendTo(other, { type: "call:signal", callId: msg.callId, signal: msg.signal });
      return;
    }

    case "ping":
      socket.send(JSON.stringify({ type: "pong" }));
      return;

    default:
      return;
  }
}

/* -------------------------------------------------------------- arranque */

/**
 * Engancha el WebSocket al mismo servidor HTTP, en `/ws`.
 * La sesión se pasa como `?token=`: los encabezados no se pueden poner en un
 * WebSocket desde el navegador.
 */
export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket, request) => {
    let userId;
    try {
      const url = new URL(request.url, "http://localhost");
      const token = url.searchParams.get("token");
      userId = jwt.verify(token, secret()).sub;
    } catch {
      socket.close(4001, "sesion invalida");
      return;
    }

    const user = userName.get(userId);
    if (!user) {
      socket.close(4001, "cuenta inexistente");
      return;
    }

    socket.userId = userId;
    socket.isAlive = true;
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(socket);

    socket.send(JSON.stringify({ type: "ready", userId, iceServers: iceServers() }));

    socket.on("message", (raw) => {
      try {
        handle(socket, raw.toString());
      } catch (err) {
        console.error("[heseria] fallo en mensaje de tiempo real:", err.message);
      }
    });

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("close", () => {
      const set = clients.get(userId);
      set?.delete(socket);
      if (set && set.size === 0) {
        clients.delete(userId);
        endCallsOf(userId);
      }
    });

    socket.on("error", () => socket.close());
  });

  // Descarta conexiones muertas: un móvil que pierde red no siempre cierra.
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref?.();

  return wss;
}
