/**
 * HESERIA — Aviso a una persona concreta.
 *
 * Las campañas van por `routes/broadcast.js`; esto es para lo individual: un
 * comentario, un seguidor nuevo, un mensaje, un comprobante de aporte.
 *
 * Hace lo mismo por los tres caminos: buzón, tiempo real y push del sistema.
 */
import { db, newId } from "./db.js";
import { pushNotification } from "./realtime.js";
import { deliverPush } from "./push.js";

const insert = db.prepare(`
  INSERT INTO notifications (id, user_id, type, title, body, href)
  VALUES (?, ?, ?, ?, ?, ?)
`);

/**
 * @param {string} userId Destinatario.
 * @param {{type?: string, title: string, body?: string, href?: string, push?: boolean}} n
 */
export function notify(userId, n) {
  const id = newId("n");
  const type = n.type ?? "sistema";
  const body = n.body ?? "";
  const href = n.href ?? "/home";

  insert.run(id, userId, type, n.title, body, href);

  pushNotification(userId, {
    id,
    category: type,
    title: n.title,
    body,
    href,
    read: false,
    createdAt: new Date().toISOString(),
  });

  if (n.push !== false) {
    void deliverPush([userId], { title: n.title, body, href }).catch((err) =>
      console.error("[heseria] fallo al enviar push:", err.message),
    );
  }

  return id;
}
