/**
 * HESERIA — Envío de correo.
 *
 * Con credenciales SMTP configuradas, envía de verdad. Sin ellas, escribe el
 * mensaje en `server/outbox/` como archivo `.eml` (el formato que abre
 * cualquier cliente de correo) y lo registra en consola.
 *
 * Ese respaldo no es decorativo: el flujo de recuperación de contraseña se
 * completa igual, y se puede comprobar exactamente qué se habría enviado.
 *
 * Para enviar de verdad basta con definir:
 *
 *   HESERIA_SMTP_HOST=smtp.gmail.com
 *   HESERIA_SMTP_PORT=587
 *   HESERIA_SMTP_USER=tu@correo.com
 *   HESERIA_SMTP_PASS=contraseña-de-aplicación
 *   HESERIA_MAIL_FROM="Heseria <hola@heseria.app>"
 *
 * Con Gmail hay que usar una «contraseña de aplicación», no la del correo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUTBOX_DIR = path.resolve(here, "../outbox");
fs.mkdirSync(OUTBOX_DIR, { recursive: true });

const FROM = process.env.HESERIA_MAIL_FROM ?? "Heseria <no-reply@heseria.app>";

let transport = null;

/** ¿Hay un servidor de correo configurado? */
export function mailConfigured() {
  return Boolean(process.env.HESERIA_SMTP_HOST && process.env.HESERIA_SMTP_USER);
}

function getTransport() {
  if (transport || !mailConfigured()) return transport;
  transport = nodemailer.createTransport({
    host: process.env.HESERIA_SMTP_HOST,
    port: Number(process.env.HESERIA_SMTP_PORT ?? 587),
    secure: Number(process.env.HESERIA_SMTP_PORT) === 465,
    auth: {
      user: process.env.HESERIA_SMTP_USER,
      pass: process.env.HESERIA_SMTP_PASS,
    },
  });
  return transport;
}

/** Guarda el mensaje en disco cuando no hay SMTP. */
function toOutbox({ to, subject, text, html }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(OUTBOX_DIR, `${stamp}-${to.replace(/[^\w.@-]/g, "_")}.eml`);
  const body = [
    `From: ${FROM}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="utf-8"',
    "",
    html ?? `<pre>${text}</pre>`,
  ].join("\r\n");
  fs.writeFileSync(file, body, "utf8");
  console.log(`[heseria] correo sin enviar (falta SMTP) → ${path.relative(process.cwd(), file)}`);
  return { delivered: false, file };
}

/**
 * Envía un correo. Nunca lanza: un fallo de correo no debe tumbar la petición
 * que lo originó.
 */
export async function sendMail({ to, subject, text, html }) {
  const mailer = getTransport();
  if (!mailer) return toOutbox({ to, subject, text, html });
  try {
    const info = await mailer.sendMail({ from: FROM, to, subject, text, html });
    return { delivered: true, id: info.messageId };
  } catch (err) {
    console.error("[heseria] fallo al enviar correo:", err.message);
    return { ...toOutbox({ to, subject, text, html }), error: err.message };
  }
}

/* ------------------------------------------------------------ plantillas */

const shell = (title, body) => `
<div style="margin:0;padding:24px;background:#0f1117;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#161922;border-radius:16px;padding:32px;color:#e6e8ee">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.01em;color:#22d3ee">Heseria</p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#fff">${title}</h1>
    ${body}
    <p style="margin:32px 0 0;font-size:12px;color:#8b90a0">
      Si no esperabas este correo, puedes ignorarlo.
    </p>
  </div>
</div>`;

const button = (href, label) => `
<a href="${href}" style="display:inline-block;margin:8px 0 4px;padding:12px 24px;border-radius:10px;background:#22d3ee;color:#0f1117;font-weight:600;text-decoration:none">${label}</a>`;

export function passwordResetEmail({ to, name, link, code }) {
  return sendMail({
    to,
    subject: "Recupera tu contraseña de Heseria",
    text: `Hola ${name}. Abre este enlace para crear una contraseña nueva: ${link}\nO escribe este código en la app: ${code}\nVence en una hora.`,
    html: shell(
      `Hola, ${name}`,
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#c3c7d2">
         Pediste crear una contraseña nueva. El enlace vence en una hora.
       </p>
       ${button(link, "Crear contraseña nueva")}
       <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#c3c7d2">
         ¿No se abre? Escribe este código en la app:
       </p>
       <p style="margin:8px 0 0;font-size:24px;font-weight:700;letter-spacing:0.18em;color:#22d3ee">${code}</p>`,
    ),
  });
}

export function welcomeEmail({ to, name }) {
  return sendMail({
    to,
    subject: "Te damos la bienvenida a Heseria",
    text: `Hola ${name}. Tu cuenta de Heseria ya está lista.`,
    html: shell(
      `Bienvenida, ${name}`,
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#c3c7d2">
         Tu cuenta ya está lista. Desde el inicio puedes leer la Biblia, seguir un
         devocional, escuchar música y encontrar tu comunidad.
       </p>`,
    ),
  });
}

export function donationReceiptEmail({ to, name, amount, currency, project, reference, method }) {
  return sendMail({
    to,
    subject: `Comprobante de tu aporte · ${reference}`,
    text: `Gracias ${name}. Registramos ${currency} ${amount} para ${project}. Método: ${method}. Comprobante: ${reference}.`,
    html: shell(
      "Gracias por tu aporte",
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#c3c7d2">
         Hola ${name}, registramos tu aporte para <strong style="color:#fff">${project}</strong>.
       </p>
       <table style="width:100%;border-collapse:collapse;font-size:14px;color:#c3c7d2">
         <tr><td style="padding:6px 0">Monto</td><td style="padding:6px 0;text-align:right;color:#fff;font-weight:600">${currency} ${amount}</td></tr>
         <tr><td style="padding:6px 0">Método</td><td style="padding:6px 0;text-align:right;color:#fff">${method}</td></tr>
         <tr><td style="padding:6px 0">Comprobante</td><td style="padding:6px 0;text-align:right;color:#22d3ee;font-family:monospace">${reference}</td></tr>
       </table>`,
    ),
  });
}
