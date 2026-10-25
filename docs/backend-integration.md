# Integración pendiente

Este documento era la lista de trabajo del backend. **El backend ya existe** y
está descrito en [`backend.md`](backend.md): cuentas, catálogo, comunidad,
contenido, notificaciones, tiempo real, llamadas, aportes, correo, métricas,
moderación y administración.

Lo que queda son **credenciales de terceros** y unas pocas piezas de
infraestructura. Nada de esto exige reescribir la aplicación.

---

## 1. Avisos push del sistema operativo

**Estado.** El envío está implementado en
[`server/src/push.js`](../server/src/push.js), contra FCM HTTP v1 y APNs,
incluida la firma de tokens y el descarte de dispositivos desaparecidos.

**Qué falta.** Solo las credenciales:

1. Un proyecto en [Firebase](https://console.firebase.google.com) con una app
   Android de identificador `app.heseria.mobile`. Descarga
   `google-services.json` a `android/app/`.
2. En Configuración → Cuentas de servicio, genera una clave privada JSON y
   guárdala como `server/credentials/fcm-service-account.json`.
3. Para iOS: una clave de APNs (.p8) en `server/credentials/apns.p8`, más
   `HESERIA_APNS_KEY_ID`, `HESERIA_APNS_TEAM_ID` y `HESERIA_APNS_BUNDLE_ID`.

Reinicia el servidor: al arrancar dice qué detectó.

> Android e iOS **no** entregan notificaciones a una app cerrada por ningún otro
> camino. No es una carencia del código; es cómo funcionan los sistemas.

---

## 2. Correo saliente

**Estado.** Implementado en [`server/src/mailer.js`](../server/src/mailer.js):
bienvenida, código de recuperación y comprobante de aporte, con plantillas HTML.

**Qué falta.** Las variables SMTP:

```
HESERIA_SMTP_HOST=smtp.gmail.com
HESERIA_SMTP_PORT=587
HESERIA_SMTP_USER=tu@correo.com
HESERIA_SMTP_PASS=contraseña-de-aplicación
HESERIA_MAIL_FROM=Heseria <hola@heseria.app>
```

Sin ellas los mensajes van a `server/outbox/` como archivos `.eml`. **Configura
SMTP antes de publicar**: mientras no exista, la recuperación de contraseña
devuelve el código en la respuesta para no dejar el trámite a medias.

---

## 3. Llamadas en redes cerradas

**Estado.** Las llamadas son WebRTC real y funcionan con los STUN públicos de
Google en la mayoría de redes domésticas y móviles.

**Qué falta.** Un servidor **TURN** para las redes con NAT simétrico o
cortafuegos estrictos, donde los dos extremos no logran verse. TURN retransmite
el audio y el video, así que consume ancho de banda y se contrata aparte
(Twilio, Metered, Cloudflare Calls, o `coturn` propio).

```
HESERIA_TURN_URL=turn:tu-servidor:3478
HESERIA_TURN_USER=usuario
HESERIA_TURN_PASS=clave
```

Aparece solo en la lista de `iceServers`; no hay que tocar código.

**Llamadas de grupo.** Todavía no. Con WebRTC puro, cada participante tendría
que enviar su video a todos los demás, lo que no aguanta más de tres o cuatro
personas en un móvil. Para grupos hace falta un SFU (LiveKit, Janus, mediasoup).
Hoy el endpoint rechaza la llamada de grupo con un mensaje claro.

---

## 4. Cobro automático de aportes

**Estado.** Los aportes funcionan de punta a punta sin pasarela: enlace de
PayPal, transferencia o entrega en persona, con comprobante, declaración de pago
y confirmación desde el panel.

**Qué falta, solo si quieres automatizarlo.** Conectar la API de PayPal o una
pasarela para que el estado pase a «completada» sin intervención humana. El
punto de integración sería un webhook que llame al mismo código que hoy usa el
botón **Confirmar**.

No es urgente: para una fundación que recibe decenas de aportes al mes, la
verificación manual es razonable y evita comisiones y trámites de alta.

---

## 5. Almacenamiento y transcodificación

**Estado.** Los archivos subidos se guardan en `server/uploads/` y se sirven con
`Accept-Ranges: bytes`, que es lo que permite saltar en la línea de tiempo.

**Qué falta.**

- Almacenamiento de objetos (S3, R2, GCS) con URLs firmadas de caducidad corta.
- Transcodificación a HLS en varias calidades, con miniaturas.
- CDN delante.

Ver [`content-distribution.md`](content-distribution.md).

---

## 6. Biblia con licencia

El texto es de demostración y está marcado como tal. Falta contratar una API
autorizada y reimplementar `GET /api/bible/:book/:chapter`, revisando cuota,
atribución obligatoria y restricciones de caché del proveedor.

---

## 7. Endurecimiento antes de publicar

| Tarea | Por qué |
| --- | --- |
| HTTPS con certificado | Hoy el APK de depuración permite HTTP para la red local |
| `wss://` para el tiempo real | Va sobre el mismo servidor: al poner HTTPS queda resuelto |
| `HESERIA_JWT_SECRET` en el entorno | Si no, se genera y se guarda en la base |
| SMTP configurado | Sin él, el código de recuperación sale en la respuesta |
| Limitar peticiones en `/login` y `/register` | Evitar fuerza bruta y registro masivo |
| Borrar las diez cuentas de demostración | Contraseña conocida (`heseria`) |
| Quitar el bloque de credenciales del acceso | Está en `src/pages/auth/Login.tsx` |
| Permisos por ámbito | Un `church_admin` debería gestionar solo **su** iglesia |
| Auditoría administrativa | Quién publicó, moderó o cambió un rol |
| Copias de seguridad | La base es un archivo; hay que respaldarlo |
| PostgreSQL si crece | El esquema es SQL estándar: cambia el driver |
