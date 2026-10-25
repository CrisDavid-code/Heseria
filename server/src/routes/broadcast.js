/**
 * HESERIA — Notificaciones: segmentos, campañas manuales y reglas automáticas.
 *
 * Enviar una campaña hace tres cosas: deja una notificación en el buzón de cada
 * destinatario, se la empuja al instante a quien tenga la app abierta, y sale
 * como aviso del sistema operativo a quien no —esto último solo si hay
 * credenciales de FCM o APNs configuradas; ver `src/push.js`.
 */
import { Router } from "express";
import { db, newId } from "../db.js";
import { requireAuth, requirePermission } from "../auth.js";
import { badRequest, notFound, oneOf, str, wrap } from "../http.js";
import { deliverPush, pushConfigured } from "../push.js";
import { pushNotification } from "../realtime.js";

export const broadcastRouter = Router();

/* ------------------------------------------------------------ segmentos */

export const SEGMENTS = [
  { id: "todos", label: "Todos los usuarios", description: "Cualquiera con la app instalada" },
  { id: "activos", label: "Activos (30 días)", description: "Abrieron la app el último mes" },
  { id: "inactivos", label: "Inactivos (30 días)", description: "No abren la app hace un mes" },
  { id: "mi-iglesia", label: "Mi iglesia", description: "Miembros de tu congregación" },
  { id: "jovenes", label: "Jóvenes", description: "Interés declarado en contenido juvenil" },
  { id: "musicos", label: "Músicos", description: "Equipos de alabanza y estudiantes de música" },
  { id: "maestros", label: "Maestros", description: "Docentes de la Academia" },
  { id: "creadores", label: "Creadores y artistas", description: "Publican contenido en la plataforma" },
];

const SEGMENT_IDS = SEGMENTS.map((s) => s.id);

/** Devuelve los identificadores de usuario que caen dentro de un segmento. */
export function resolveSegment(segment, actor) {
  const active30 =
    "SELECT DISTINCT user_id FROM activity WHERE at >= datetime('now', '-30 days')";

  switch (segment) {
    case "activos":
      return db.prepare(
        `SELECT id FROM users WHERE status = 'active' AND id IN (${active30})`,
      ).all().map((r) => r.id);

    case "inactivos":
      return db.prepare(
        `SELECT id FROM users WHERE status = 'active' AND id NOT IN (${active30})`,
      ).all().map((r) => r.id);

    case "mi-iglesia": {
      const churchId = actor?.church_id;
      if (!churchId) return [];
      return db.prepare("SELECT user_id AS id FROM church_members WHERE church_id = ?")
        .all(churchId).map((r) => r.id);
    }

    case "jovenes":
      return db.prepare(`
        SELECT id FROM users WHERE status = 'active'
        AND (role = 'youth_leader' OR lower(interests) LIKE '%joven%' OR lower(ministries) LIKE '%joven%')
      `).all().map((r) => r.id);

    case "musicos":
      return db.prepare(`
        SELECT id FROM users WHERE status = 'active'
        AND (role IN ('musician', 'artist') OR lower(ministries) LIKE '%alabanza%' OR lower(interests) LIKE '%m_sica%')
      `).all().map((r) => r.id);

    case "maestros":
      return db.prepare("SELECT id FROM users WHERE status = 'active' AND role = 'teacher'")
        .all().map((r) => r.id);

    case "creadores":
      return db.prepare(
        "SELECT id FROM users WHERE status = 'active' AND role IN ('creator', 'artist')",
      ).all().map((r) => r.id);

    default:
      return db.prepare("SELECT id FROM users WHERE status = 'active'").all().map((r) => r.id);
  }
}

broadcastRouter.get(
  "/segments",
  wrap((req, res) => {
    res.json(
      SEGMENTS.map((s) => ({ ...s, size: resolveSegment(s.id, req.user).length })),
    );
  }),
);

/* ------------------------------------------------------- envío efectivo */

const insertNotification = db.prepare(`
  INSERT INTO notifications (id, user_id, campaign_id, type, title, body, href)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Reparte la notificación por los tres caminos, en este orden:
 *
 *   1. **Buzón.** Una fila por destinatario. Es lo que sobrevive a todo.
 *   2. **Tiempo real.** A quien tenga la app abierta le aparece al instante.
 *   3. **Push del sistema.** A quien no la tenga abierta, si hay credenciales
 *      de FCM o APNs configuradas.
 */
function fanOut({ campaignId, recipients, type, title, body, href }) {
  const rows = recipients.map((userId) => ({
    id: newId("n"),
    userId,
    title,
    body,
    href,
    type,
  }));

  const run = db.transaction(() => {
    for (const row of rows) {
      insertNotification.run(row.id, row.userId, campaignId, type, title, body, href);
    }
  });
  run();

  for (const row of rows) {
    pushNotification(row.userId, {
      id: row.id,
      category: type,
      title,
      body,
      href,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }

  // El push sale en segundo plano: la respuesta no espera a Google ni a Apple.
  void deliverPush(recipients, { title, body, href }).catch((err) =>
    console.error("[heseria] fallo al enviar push:", err.message),
  );

  return recipients.length;
}

function serializeCampaign(c) {
  const stats = db.prepare(`
    SELECT COUNT(*) AS delivered, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened
    FROM notifications WHERE campaign_id = ?
  `).get(c.id);
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    segment: c.segment,
    href: c.href,
    status: c.status,
    source: c.source,
    createdAt: c.created_at,
    scheduledAt: c.scheduled_at ?? undefined,
    sentAt: c.sent_at ?? undefined,
    audience: c.audience,
    delivered: stats.delivered ?? 0,
    opened: stats.opened ?? 0,
    contentId: c.content_id ?? undefined,
  };
}

/* ------------------------------------------------------------- campañas */

broadcastRouter.get(
  "/campaigns",
  requireAuth,
  requirePermission("canPublish"),
  wrap((_req, res) => {
    const rows = db.prepare("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 200").all();
    res.json(rows.map(serializeCampaign));
  }),
);

broadcastRouter.get(
  "/campaigns/:id",
  requireAuth,
  requirePermission("canPublish"),
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Esa campaña no existe.");
    res.json(serializeCampaign(row));
  }),
);

broadcastRouter.post(
  "/campaigns",
  requireAuth,
  requirePermission("canPublish"),
  wrap((req, res) => {
    const title = str(req.body?.title, "título", { min: 3, max: 120 });
    const body = str(req.body?.body, "mensaje", { min: 3, max: 500 });
    const segment = oneOf(req.body?.segment ?? "todos", SEGMENT_IDS, "segmento");
    const href = str(req.body?.href, "destino", { required: false, max: 200 }) || "/home";
    const scheduledAt = str(req.body?.scheduledAt, "programación", { required: false, max: 40 });

    if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) {
      throw badRequest("La fecha de programación no es válida.", "bad_date");
    }

    const recipients = resolveSegment(segment, req.user);
    const id = newId("cp");
    const scheduled = Boolean(scheduledAt) && new Date(scheduledAt) > new Date();

    db.prepare(`
      INSERT INTO campaigns (id, title, body, segment, href, status, source, scheduled_at, sent_at, audience, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?)
    `).run(
      id, title, body, segment, href,
      scheduled ? "programada" : "enviada",
      scheduledAt || null,
      scheduled ? null : new Date().toISOString(),
      recipients.length, req.user.id,
    );

    let delivered = 0;
    if (!scheduled) {
      delivered = fanOut({ campaignId: id, recipients, type: "sistema", title, body, href });
    }

    res.status(201).json({
      ...serializeCampaign(db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id)),
      delivered,
      push: pushConfigured(),
    });
  }),
);

/** Envía ahora una campaña programada. */
broadcastRouter.post(
  "/campaigns/:id/send",
  requireAuth,
  requirePermission("canPublish"),
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Esa campaña no existe.");
    if (row.status === "enviada") throw badRequest("Esa campaña ya se envió.", "already_sent");

    const recipients = resolveSegment(row.segment, req.user);
    const delivered = fanOut({
      campaignId: row.id, recipients, type: "sistema",
      title: row.title, body: row.body, href: row.href,
    });
    db.prepare(
      "UPDATE campaigns SET status = 'enviada', sent_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), audience = ? WHERE id = ?",
    ).run(recipients.length, row.id);

    res.json({ ...serializeCampaign(db.prepare("SELECT * FROM campaigns WHERE id = ?").get(row.id)), delivered });
  }),
);

broadcastRouter.post(
  "/campaigns/:id/cancel",
  requireAuth,
  requirePermission("canPublish"),
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Esa campaña no existe.");
    if (row.status === "enviada") throw badRequest("Una campaña enviada ya no se puede cancelar.", "already_sent");
    db.prepare("UPDATE campaigns SET status = 'borrador', scheduled_at = NULL WHERE id = ?").run(row.id);
    res.json({ ok: true });
  }),
);

broadcastRouter.delete(
  "/campaigns/:id",
  requireAuth,
  requirePermission("canPublish"),
  wrap((req, res) => {
    db.prepare("DELETE FROM campaigns WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------ reglas automáticas */

const RULE_DESCRIPTIONS = {
  "content.published": "Avisa cuando se añade música, video, película, serie o sermón.",
  "devotional.daily": "Recordatorio cada mañana a las 07:00.",
  "event.created": "Avisa a los miembros cuando se publica un evento.",
  "course.published": "Avisa a quienes tienen interés en formación.",
  "prayer.answered": "Avisa a quienes oraron cuando el autor comparte el testimonio.",
};

const serializeRule = (r) => ({
  id: r.id,
  event: r.event,
  label: r.label,
  description: RULE_DESCRIPTIONS[r.event] ?? "",
  template: r.title,
  body: r.body,
  segment: r.segment,
  enabled: Boolean(r.enabled),
});

broadcastRouter.get(
  "/rules",
  requireAuth,
  requirePermission("canPublish"),
  wrap((_req, res) => {
    res.json(db.prepare("SELECT * FROM auto_rules ORDER BY rowid").all().map(serializeRule));
  }),
);

broadcastRouter.patch(
  "/rules/:id",
  requireAuth,
  requirePermission("canPublish"),
  wrap((req, res) => {
    const rule = db.prepare("SELECT * FROM auto_rules WHERE id = ?").get(req.params.id);
    if (!rule) throw notFound("Esa regla no existe.");

    const fields = [];
    const values = [];
    if (req.body?.enabled !== undefined) {
      fields.push("enabled = ?");
      values.push(req.body.enabled ? 1 : 0);
    }
    if (req.body?.template !== undefined) {
      fields.push("title = ?");
      values.push(str(req.body.template, "plantilla", { min: 3, max: 160 }));
    }
    if (req.body?.body !== undefined) {
      fields.push("body = ?");
      values.push(str(req.body.body, "mensaje", { required: false, max: 400 }));
    }
    if (req.body?.segment !== undefined) {
      fields.push("segment = ?");
      values.push(oneOf(req.body.segment, SEGMENT_IDS, "segmento"));
    }
    if (fields.length) {
      values.push(rule.id);
      db.prepare(`UPDATE auto_rules SET ${fields.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`)
        .run(...values);
    }
    res.json(serializeRule(db.prepare("SELECT * FROM auto_rules WHERE id = ?").get(rule.id)));
  }),
);

/**
 * Dispara la regla asociada a un evento del dominio. La llaman las rutas que
 * publican contenido, crean eventos o marcan una oración como respondida.
 *
 * `vars.recipients` permite acotar el envío a personas concretas (por ejemplo,
 * solo quienes oraron por esa petición).
 */
export function fireAuto(event, vars = {}) {
  const rule = db.prepare("SELECT * FROM auto_rules WHERE event = ? AND enabled = 1").get(event);
  if (!rule) return null;

  const render = (text) =>
    String(text).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");

  const title = render(rule.title);
  const body = render(rule.body);
  const href = vars.href ?? "/home";
  const recipients = Array.isArray(vars.recipients)
    ? vars.recipients
    : resolveSegment(rule.segment, vars.actor);

  if (!recipients.length) return null;

  const id = newId("cp");
  db.prepare(`
    INSERT INTO campaigns (id, title, body, segment, href, status, source, sent_at, audience, content_id, created_by)
    VALUES (?, ?, ?, ?, ?, 'enviada', 'automatica', strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?)
  `).run(id, title, body, rule.segment, href, recipients.length, vars.contentId ?? null, vars.actor?.id ?? null);

  fanOut({ campaignId: id, recipients, type: "sistema", title, body, href });
  return id;
}

/* -------------------------------------------------------- programadas */

/**
 * Envía las campañas cuya hora ya llegó. El servidor lo llama cada minuto:
 * es el equivalente sencillo a una cola de trabajos.
 */
export function dispatchScheduled() {
  const due = db.prepare(
    "SELECT * FROM campaigns WHERE status = 'programada' AND scheduled_at IS NOT NULL AND scheduled_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now')",
  ).all();
  for (const campaign of due) {
    const actor = campaign.created_by
      ? db.prepare("SELECT * FROM users WHERE id = ?").get(campaign.created_by)
      : null;
    const recipients = resolveSegment(campaign.segment, actor);
    fanOut({
      campaignId: campaign.id, recipients, type: "sistema",
      title: campaign.title, body: campaign.body, href: campaign.href,
    });
    db.prepare(
      "UPDATE campaigns SET status = 'enviada', sent_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), audience = ? WHERE id = ?",
    ).run(recipients.length, campaign.id);
  }
  return due.length;
}
