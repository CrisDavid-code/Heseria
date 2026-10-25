/**
 * HESERIA — Prueba de humo del tiempo real.
 *
 *   node src/smoke-realtime.mjs [http://localhost:4000]
 *
 * Abre dos sesiones de verdad y comprueba que:
 *   · un mensaje enviado por HTTP llega al otro por WebSocket,
 *   · el aviso de «está escribiendo» viaja entre ambos,
 *   · una notificación enviada por campaña llega al instante,
 *   · la señalización de llamada completa el circuito de invitación,
 *     aceptación e intercambio de ofertas, y cuelga.
 */
import { WebSocket } from "ws";

const BASE = process.argv[2] ?? "http://localhost:4000";
const WS = BASE.replace(/^http/, "ws");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FALLA ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const login = (email, password = "heseria") =>
  fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());

/** Abre un socket y acumula lo que llega, para poder esperar por tipo. */
function connect(token, label) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${WS}/ws?token=${token}`);
    const inbox = [];
    const waiters = [];

    socket.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      inbox.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].type === msg.type) {
          waiters[i].resolve(msg);
          waiters.splice(i, 1);
        }
      }
    });
    socket.on("error", reject);
    socket.on("open", () =>
      resolve({
        label,
        socket,
        inbox,
        send: (obj) => socket.send(JSON.stringify(obj)),
        /** Espera un mensaje de ese tipo, mirando primero lo ya recibido. */
        wait(type, ms = 4000) {
          const seen = inbox.find((m) => m.type === type);
          if (seen) return Promise.resolve(seen);
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`sin «${type}» en ${label}`)), ms);
            waiters.push({
              type,
              resolve: (m) => {
                clearTimeout(timer);
                res(m);
              },
            });
          });
        },
        close: () => socket.close(),
      }),
    );
  });
}

const settle = async (promise) => {
  try {
    return await promise;
  } catch {
    return null;
  }
};

console.log(`\nHESERIA — tiempo real contra ${WS}/ws\n`);

/* ------------------------------------------------------------- sesiones */

const camila = await login("camila.aguilar@heseria.app");
const admin = await login("admin@heseria.app");
check("dos sesiones abiertas", Boolean(camila.accessToken && admin.accessToken));

const a = await connect(camila.accessToken, "camila");
const b = await connect(admin.accessToken, "admin");

const readyA = await settle(a.wait("ready"));
const readyB = await settle(b.wait("ready"));
check("ambos sockets saludan", Boolean(readyA && readyB));
check(
  "el servidor entrega servidores ICE",
  Array.isArray(readyA?.iceServers) && readyA.iceServers.length > 0,
  JSON.stringify(readyA?.iceServers?.[0]),
);

const badToken = await new Promise((resolve) => {
  const socket = new WebSocket(`${WS}/ws?token=invalido`);
  socket.on("close", (code) => resolve(code));
  socket.on("error", () => resolve(-1));
});
check("rechaza un token inválido", badToken === 4001 || badToken === -1, String(badToken));

/* -------------------------------------------------------------- mensajes */

console.log("\nMensajes en vivo");

const conversation = await fetch(`${BASE}/api/conversations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${camila.accessToken}` },
  body: JSON.stringify({ userId: admin.user.id }),
}).then((r) => r.json());
check("conversación directa lista", Boolean(conversation.id), JSON.stringify(conversation));

const incoming = b.wait("message");
const sent = await fetch(`${BASE}/api/conversations/${conversation.id}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${camila.accessToken}` },
  body: JSON.stringify({ body: "Hola, esto llega en vivo." }),
}).then((r) => r.json());

const delivered = await settle(incoming);
check(
  "el mensaje llega al otro sin recargar",
  delivered?.message?.body === "Hola, esto llega en vivo." && delivered.conversationId === conversation.id,
  JSON.stringify(delivered?.message?.body),
);
check("quien lo envía no lo recibe duplicado", !a.inbox.some((m) => m.type === "message" && m.message?.id === sent.id));

const typingSoon = b.wait("typing");
a.send({ type: "typing", conversationId: conversation.id, typing: true });
const typing = await settle(typingSoon);
check("viaja el aviso de «escribiendo»", typing?.typing === true && typing.userId === camila.user.id);

const readSoon = a.wait("read");
b.send({ type: "read", conversationId: conversation.id });
check("viaja el acuse de lectura", Boolean(await settle(readSoon)));

/* -------------------------------------------------------- notificaciones */

console.log("\nNotificaciones al instante");

const notifSoon = a.wait("notification", 6000);
await fetch(`${BASE}/api/broadcast/campaigns`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.accessToken}` },
  body: JSON.stringify({
    title: "Aviso en vivo",
    body: "Comprobando el canal de tiempo real.",
    segment: "todos",
    href: "/home",
  }),
});
const notification = await settle(notifSoon);
check("la campaña llega al buzón abierto", notification?.notification?.title === "Aviso en vivo",
  JSON.stringify(notification?.notification?.title));

/* -------------------------------------------------------------- llamadas */

console.log("\nSeñalización de llamadas");

const prepared = await fetch(`${BASE}/api/conversations/${conversation.id}/call`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${camila.accessToken}` },
  body: JSON.stringify({ kind: "video" }),
}).then((r) => r.json());
check("el servidor prepara la llamada", prepared.online === true && Array.isArray(prepared.iceServers),
  JSON.stringify({ online: prepared.online }));

const ringingSoon = a.wait("call:ringing");
const incomingSoon = b.wait("call:incoming");
a.send({ type: "call:invite", to: admin.user.id, kind: "video" });

const ringing = await settle(ringingSoon);
const incomingCall = await settle(incomingSoon);
check("suena en el otro teléfono", incomingCall?.from?.id === camila.user.id, JSON.stringify(incomingCall?.from?.name));
check("quien llama recibe el identificador", Boolean(ringing?.callId));

const acceptedSoon = a.wait("call:accepted");
b.send({ type: "call:accept", callId: incomingCall.callId });
check("la aceptación vuelve a quien llamó", Boolean(await settle(acceptedSoon)));

// Relevo de la negociación: oferta → respuesta.
const offerSoon = b.wait("call:signal");
a.send({
  type: "call:signal",
  callId: ringing.callId,
  signal: { kind: "offer", sdp: "v=0 (oferta de prueba)" },
});
const offer = await settle(offerSoon);
check("la oferta SDP llega al otro extremo", offer?.signal?.kind === "offer");

const answerSoon = a.wait("call:signal");
b.send({
  type: "call:signal",
  callId: incomingCall.callId,
  signal: { kind: "answer", sdp: "v=0 (respuesta de prueba)" },
});
const answer = await settle(answerSoon);
check("la respuesta SDP vuelve", answer?.signal?.kind === "answer");

const endedSoon = b.wait("call:ended");
a.send({ type: "call:hangup", callId: ringing.callId });
const ended = await settle(endedSoon);
check("colgar corta la llamada en ambos", ended?.reason === "colgada", JSON.stringify(ended?.reason));

/* ------------------------------------------------------------- limpieza */

a.close();
b.close();

console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} correctas · ${failed} fallidas`);
if (failures.length) {
  console.log("\n  Fallos:");
  for (const f of failures) console.log(`   · ${f}`);
}
console.log("");
process.exit(failed ? 1 : 0);
