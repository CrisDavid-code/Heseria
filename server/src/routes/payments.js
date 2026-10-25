/**
 * HESERIA — Aportes sin pasarela de pago.
 *
 * No hay integración con ningún procesador, y por tanto **este servidor no ve
 * ni guarda datos de tarjeta**. El dinero se mueve por fuera —PayPal,
 * transferencia bancaria, Mercado Pago, efectivo— y la aplicación se encarga de
 * lo que sí le toca:
 *
 *   1. Ofrecer los métodos que la administración haya configurado.
 *   2. Generar el enlace o las instrucciones con el monto ya puesto.
 *   3. Registrar el aporte con un comprobante y dejarlo «pendiente».
 *   4. Permitir que la persona diga «ya pagué» con su referencia.
 *   5. Permitir que la administración lo confirme, y ahí pasa a «completada».
 *
 * Es el mismo circuito que usa cualquier organización pequeña que recibe
 * aportes por transferencia: la diferencia es que aquí queda registrado,
 * contabilizado y con aviso a las dos partes.
 *
 * **Hay un único destinatario: la Fundación Heseria.** Ninguna iglesia,
 * ministerio, grupo ni persona puede abrir su propia colecta dentro de la app,
 * y las cuentas de destino las configura solo la administración de la
 * plataforma. Los casos que aparecen en «Fundación» son proyectos de esa misma
 * fundación, no cuentas de terceros.
 */
import { Router } from "express";
import { catalog, db, getSetting, newId, setSetting } from "../db.js";
import { requireAuth, requirePermission } from "../auth.js";
import { badRequest, forbidden, notFound, num, oneOf, str, wrap } from "../http.js";
import { notify } from "../notify.js";
import { donationReceiptEmail } from "../mailer.js";

export const paymentsRouter = Router();

/* ---------------------------------------------------------------- métodos */

/**
 * Tipos admitidos. Cada uno sabe construir su enlace o su instrucción a partir
 * de la configuración y el monto.
 */
export const METHOD_TYPES = ["paypal", "transferencia", "mercadopago", "enlace", "efectivo"];

const DEFAULT_METHODS = [
  {
    id: "paypal",
    type: "paypal",
    label: "PayPal",
    description: "Dona con tu cuenta de PayPal.",
    // Nombre de usuario de PayPal.Me, sin la URL.
    handle: "",
    enabled: false,
    instructions: "",
  },
  {
    id: "transferencia",
    type: "transferencia",
    label: "Transferencia bancaria",
    description: "Transfiere desde tu banco y comparte el comprobante.",
    handle: "",
    enabled: false,
    instructions: "",
  },
];

const CURRENCIES = ["USD", "EUR", "CLP", "MXN", "COP", "ARS", "PEN", "BRL"];

export function paymentMethods() {
  return getSetting("paymentMethods", DEFAULT_METHODS);
}

/**
 * Construye lo que la app tiene que mostrar para pagar con ese método.
 *
 * `url` abre algo fuera de la app; `instructions` se muestra para copiar. Un
 * método puede traer ambos, uno o ninguno.
 */
export function buildPaymentAction(method, { amount, currency, reference }) {
  const clean = Number(amount).toFixed(2).replace(/\.00$/, "");

  switch (method.type) {
    case "paypal":
      return {
        // PayPal.Me acepta el monto y la moneda en la propia ruta.
        url: method.handle
          ? `https://www.paypal.com/paypalme/${encodeURIComponent(method.handle)}/${clean}${currency}`
          : null,
        instructions:
          method.instructions ||
          `Al terminar en PayPal, vuelve y confirma tu donación con el comprobante ${reference}.`,
      };

    case "mercadopago":
      return {
        url: method.handle || null,
        instructions:
          method.instructions ||
          `Indica el monto ${currency} ${clean} y usa la referencia ${reference}.`,
      };

    case "enlace":
      return {
        url: method.handle || null,
        instructions: method.instructions || "",
      };

    case "transferencia":
      return {
        url: null,
        instructions:
          method.instructions ||
          `Transfiere ${currency} ${clean} a la cuenta indicada y usa ${reference} como referencia.`,
      };

    case "efectivo":
      return {
        url: null,
        instructions:
          method.instructions || `Entrega tu donación en persona indicando la referencia ${reference}.`,
      };

    default:
      return { url: null, instructions: method.instructions || "" };
  }
}

/** Los métodos activos, tal como los ve cualquiera en la app. */
paymentsRouter.get(
  "/payment-methods",
  wrap((_req, res) => {
    res.json(
      paymentMethods()
        .filter((m) => m.enabled)
        .map(({ id, type, label, description }) => ({ id, type, label, description })),
    );
  }),
);

/** Configuración completa, solo para quien administra. */
paymentsRouter.get(
  "/admin/payment-methods",
  requireAuth,
  requirePermission("canManageFoundation"),
  wrap((_req, res) => res.json(paymentMethods())),
);

paymentsRouter.patch(
  "/admin/payment-methods",
  requireAuth,
  requirePermission("canManageFoundation"),
  wrap((req, res) => {
    const incoming = Array.isArray(req.body?.methods) ? req.body.methods : null;
    if (!incoming) throw badRequest("Envía la lista de métodos.", "bad_methods");

    const methods = incoming.slice(0, 12).map((m) => ({
      id: str(m.id, "id", { max: 40 }),
      type: oneOf(m.type, METHOD_TYPES, "tipo"),
      label: str(m.label, "nombre", { max: 60 }),
      description: str(m.description, "descripción", { required: false, max: 240 }),
      handle: str(m.handle, "cuenta o enlace", { required: false, max: 400 }),
      instructions: str(m.instructions, "instrucciones", { required: false, max: 1000 }),
      enabled: Boolean(m.enabled),
    }));

    // Un método activo sin destino no sirve de nada: mejor decirlo aquí.
    for (const m of methods) {
      if (!m.enabled) continue;
      const needsHandle = ["paypal", "mercadopago", "enlace"].includes(m.type);
      if (needsHandle && !m.handle) {
        throw badRequest(`«${m.label}» está activo pero no tiene cuenta ni enlace.`, "missing_handle");
      }
      if (!needsHandle && !m.instructions) {
        throw badRequest(`«${m.label}» está activo pero no tiene instrucciones.`, "missing_instructions");
      }
    }

    setSetting("paymentMethods", methods);
    res.json(methods);
  }),
);

/* -------------------------------------------------------------- aportes */

const serializeDonation = (d) => ({
  id: d.id,
  donorId: d.user_id,
  amount: d.amount,
  currency: d.currency,
  frequency: d.recurring ? "Mensual" : "Única",
  projectId: d.project_id,
  project: d.project,
  method: d.method,
  status: d.status,
  reference: d.reference,
  createdAt: d.created_at,
  confirmedAt: d.confirmed_at ?? undefined,
  donorNote: d.donor_note ?? undefined,
});

/**
 * Forma completa para la pantalla del aporte: incluye el método como objeto y
 * cómo pagarlo, igual que al crearlo. Así la pantalla no cambia de forma entre
 * «recién creado» y «ya declarado».
 */
function donationView(row) {
  const method =
    paymentMethods().find((m) => m.label === row.method) ??
    { id: "otro", type: "enlace", label: row.method, handle: "", instructions: "" };
  const action = buildPaymentAction(method, {
    amount: row.amount,
    currency: row.currency,
    reference: row.reference,
  });
  return {
    ...serializeDonation(row),
    method: { id: method.id, type: method.type, label: method.label },
    payUrl: action.url,
    instructions: action.instructions,
  };
}

/**
 * Registra la intención de aportar y devuelve cómo pagarla.
 *
 * Queda en estado «pendiente» hasta que alguien la confirme. Nunca se acepta
 * información de tarjeta: si llega, se rechaza la petición entera.
 *
 * El destino no se elige: es siempre la Fundación Heseria. `projectId` solo
 * dice a qué proyecto de la fundación se destina, y tiene que ser un caso
 * publicado por ella.
 */
paymentsRouter.post(
  "/donations",
  requireAuth,
  wrap((req, res) => {
    const body = req.body ?? {};

    if (body.cardNumber || body.cvv || body.cardCvv || body.pan) {
      throw badRequest(
        "Este servidor no recibe datos de tarjeta. La donación se hace fuera de la app.",
        "no_card_data",
      );
    }

    const amount = num(body.amount, "monto", { min: 1, max: 1_000_000 });
    const currency = oneOf(
      str(body.currency, "moneda", { required: false }) || "USD",
      CURRENCIES,
      "moneda",
    );
    const recurring = body.recurring === true;
    const projectId = str(body.projectId, "proyecto", { required: false });

    // Solo un caso de la Fundación Heseria puede recibir el aporte. Si llega
    // un identificador de iglesia, de grupo o de cualquier otra cosa, no hay
    // caso que lo respalde y la donación no se registra.
    const project = projectId ? catalog.get("foundationCase", projectId) : null;
    if (projectId && !project) {
      throw notFound("Ese proyecto no existe en la Fundación Heseria.");
    }

    const methods = paymentMethods().filter((m) => m.enabled);
    if (!methods.length) {
      throw badRequest(
        "Todavía no hay métodos de donación configurados. Escríbenos y lo resolvemos.",
        "no_methods",
      );
    }

    const methodId = str(body.method, "método", { required: false }) || methods[0].id;
    const method = methods.find((m) => m.id === methodId);
    if (!method) throw badRequest("Ese método de donación no está disponible.", "bad_method");

    const id = newId("dn");
    const reference = `HSR-${id.slice(-8).toUpperCase()}`;

    db.prepare(`
      INSERT INTO donations (id, user_id, project_id, project, amount, currency, method,
                             recurring, status, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)
    `).run(
      id, req.user.id, projectId || null, project?.title ?? "Fondo general",
      amount, currency, method.label, recurring ? 1 : 0, reference,
    );

    res.status(201).json(donationView(db.prepare("SELECT * FROM donations WHERE id = ?").get(id)));
  }),
);

/**
 * «Ya pagué». La persona confirma que hizo la transferencia o el pago y, si
 * quiere, deja el número de operación. Avisa a la administración.
 */
paymentsRouter.post(
  "/donations/:id/confirm",
  requireAuth,
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM donations WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Ese aporte no existe.");
    if (row.user_id !== req.user.id) throw forbidden("Ese aporte no es tuyo.");
    if (row.status === "completada") return res.json(donationView(row));

    const note = str(req.body?.note, "referencia", { required: false, max: 300 });
    db.prepare("UPDATE donations SET status = 'por-verificar', donor_note = ? WHERE id = ?")
      .run(note || null, row.id);

    // La administración de la fundación revisa y confirma.
    const admins = db.prepare(
      "SELECT id FROM users WHERE role IN ('admin', 'missionary') AND status = 'active'",
    ).all();
    for (const admin of admins) {
      notify(admin.id, {
        type: "fundacion",
        title: "Aporte por verificar",
        body: `${req.user.name} declaró un aporte de ${row.currency} ${row.amount} (${row.reference}).`,
        href: "/admin/foundation",
      });
    }

    void donationReceiptEmail({
      to: req.user.email,
      name: req.user.first_name,
      amount: row.amount,
      currency: row.currency,
      project: row.project,
      reference: row.reference,
      method: row.method,
    });

    res.json(donationView(db.prepare("SELECT * FROM donations WHERE id = ?").get(row.id)));
  }),
);

/** Historial propio. */
paymentsRouter.get(
  "/donations",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare("SELECT * FROM donations WHERE user_id = ? ORDER BY created_at DESC")
      .all(req.user.id);
    res.json(rows.map(serializeDonation));
  }),
);

/* ------------------------------------------------------- administración */

paymentsRouter.get(
  "/admin/donations",
  requireAuth,
  requirePermission("canManageFoundation"),
  wrap((req, res) => {
    const status = req.query.status;
    const rows = status
      ? db.prepare("SELECT * FROM donations WHERE status = ? ORDER BY created_at DESC").all(status)
      : db.prepare("SELECT * FROM donations ORDER BY created_at DESC LIMIT 300").all();

    const donor = db.prepare("SELECT name, email FROM users WHERE id = ?");
    res.json(
      rows.map((d) => ({
        ...serializeDonation(d),
        donor: d.user_id ? donor.get(d.user_id) : null,
      })),
    );
  }),
);

/** La administración confirma que el dinero llegó. */
paymentsRouter.post(
  "/admin/donations/:id/settle",
  requireAuth,
  requirePermission("canManageFoundation"),
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM donations WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Ese aporte no existe.");

    const status = oneOf(
      req.body?.status ?? "completada",
      ["completada", "pendiente", "por-verificar", "cancelada"],
      "estado",
    );

    db.prepare(
      "UPDATE donations SET status = ?, confirmed_at = CASE WHEN ? = 'completada' THEN strftime('%Y-%m-%dT%H:%M:%SZ','now') ELSE NULL END WHERE id = ?",
    ).run(status, status, row.id);

    if (status === "completada" && row.user_id) {
      notify(row.user_id, {
        type: "fundacion",
        title: "Confirmamos tu aporte",
        body: `${row.currency} ${row.amount} para ${row.project}. Gracias. Comprobante ${row.reference}.`,
        href: "/foundation",
      });
    }

    res.json(serializeDonation(db.prepare("SELECT * FROM donations WHERE id = ?").get(row.id)));
  }),
);
