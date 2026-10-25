# Notificaciones push

La difusión funciona **dentro de la app**: componer, segmentar, programar, disparar
reglas automáticas y medir entrega y apertura. Lo que falta es el aviso del sistema
operativo cuando la app está cerrada.

---

## 1. Qué existe hoy

| Pieza | Dónde |
| --- | --- |
| Registro del dispositivo | `registerPush()` en [`src/native/index.ts`](../src/native/index.ts) |
| Guardado del token | `POST /api/auth/push-token` → tabla `push_tokens` |
| Campañas, reglas, segmentos y reparto | [`server/src/routes/broadcast.js`](../server/src/routes/broadcast.js) |
| Buzón de cada persona | tabla `notifications` |
| Pantalla de administración | `/admin/notifications` |
| Centro de notificaciones | `/notifications` |

**Lo que sí ocurre.** Enviar una campaña resuelve el segmento contra las cuentas reales,
inserta una notificación por destinatario y registra la entrega. Marcarla como leída
cuenta como apertura, y de ahí sale la tasa que muestra el panel. Las reglas automáticas
las dispara el servidor cuando ocurre el hecho: publicar contenido, crear un evento o
marcar una oración como respondida.

**Entrega al instante.** Quien tenga la app abierta recibe la notificación por el
canal de tiempo real (`/ws`) sin recargar nada. Eso ya funciona.

**El envío push está escrito.** [`server/src/push.js`](../server/src/push.js)
implementa FCM HTTP v1 y APNs, firma los tokens de acceso, envía en tandas y
descarta los dispositivos que ya no existen. `registerPush()` captura el token
del dispositivo y lo guarda en el servidor, y tocar la notificación abre la
pantalla que lleve dentro.

**Lo único que falta son las credenciales.** Sin un proyecto de Firebase o una
clave de APNs, `deliverPush()` devuelve `configured: false` y lo dice; la
notificación igualmente queda en el buzón. Los pasos exactos están en la
cabecera de `push.js` y en
[`backend-integration.md`](backend-integration.md#1-avisos-push-del-sistema-operativo).

> Android e iOS no entregan notificaciones a una app cerrada por ningún otro
> camino que FCM y APNs. No es una carencia del código.

---

## 2. Referencia del protocolo

### 2.1 Registro de dispositivos

`registerPush()` pide permiso, espera el evento `registration` y envía el token a
`POST /api/auth/push-token`. Así se ve por dentro:

```ts
PushNotifications.addListener("registration", async (token) => {
  await http.post("/devices", {
    token: token.value,
    platform: platform(),      // "android" | "ios"
    locale: navigator.language,
  });
});
```

Tabla sugerida: `devices(id, user_id, token, platform, locale, last_seen_at, revoked_at)`.
Un usuario puede tener varios dispositivos; hay que revocar los tokens que FCM y APNs
reporten como inválidos.

### 2.2 Credenciales

- **Android:** proyecto de Firebase, `google-services.json` en `android/app/`, y la
  clave de servidor de FCM en el backend.
- **iOS:** clave de APNs (`.p8`) con su Key ID y Team ID, capacidad *Push
  Notifications* activada en Xcode y `Background Modes → Remote notifications`.

### 2.3 Endpoints

```
POST /devices                      registra o actualiza un token
DELETE /devices/:token             revoca

GET  /campaigns                    historial
POST /campaigns                    crea y envía o programa
POST /campaigns/:id/cancel         cancela una programada
DELETE /campaigns/:id

GET  /campaigns/rules              reglas automáticas
PATCH /campaigns/rules/:id         activa, desactiva o edita
```

El cuerpo de `POST /campaigns` es exactamente `CampaignInput`:

```ts
{ title, body, segment, href?, scheduledAt?, source?, contentId? }
```

### 2.4 Resolución de segmentos

`SEGMENTS` en `broadcast.ts` define ocho audiencias. El backend debe traducir cada una a
una consulta:

| Segmento | Consulta |
| --- | --- |
| `todos` | todos los dispositivos activos |
| `activos` | sesión en los últimos 30 días |
| `inactivos` | sin sesión en 30 días |
| `mi-iglesia` | miembros de la iglesia del emisor |
| `jovenes` | interés declarado en contenido juvenil |
| `musicos` | rol músico o artista, o inscritos en cursos de música |
| `maestros` | rol maestro |
| `creadores` | rol creador o artista |

### 2.5 Envíos programados

Las campañas con `scheduledAt` requieren un planificador en el servidor (cron o cola
con retraso). El cliente solo registra la fecha.

### 2.6 Reglas automáticas

`broadcastService.trigger(event, vars)` se llama hoy desde el cliente al publicar
contenido. **Eso debe moverse al servidor**, porque solo él conoce a toda la audiencia:

| Evento | Cuándo dispararlo |
| --- | --- |
| `content.published` | al publicarse música, video, película, serie o sermón |
| `event.created` | al crearse un evento de iglesia |
| `devotional.daily` | cron diario a las 07:00 en la zona horaria del usuario |
| `course.published` | al publicarse un curso |
| `prayer.answered` | cuando el autor marca su petición como respondida |

La plantilla admite `{titulo}`, que se sustituye al disparar.

---

## 3. Métricas de entrega

La interfaz muestra audiencia, entregadas y abiertas. Para que sean reales:

- **Entregadas:** contar los recibos de FCM y APNs.
- **Abiertas:** registrar el evento cuando el usuario toca la notificación. El listener
  `pushNotificationActionPerformed` de Capacitor da el `campaignId` si se envía en el
  payload:

```ts
PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
  const { campaignId, href } = notification.data;
  http.post(`/campaigns/${campaignId}/opened`);
  if (href) router.navigate(href);
});
```

Ese `href` es el que enlaza push con [`deep-links.md`](deep-links.md).

---

## 4. Payload recomendado

```json
{
  "notification": { "title": "Nuevo en Heseria: Cielos abiertos", "body": "Toca para abrirlo." },
  "data": {
    "campaignId": "cp-1730000000000",
    "href": "/content/ct-1730000000000",
    "contentId": "ct-1730000000000"
  }
}
```

En iOS añade `"content-available": 1` si quieres despertar la app en segundo plano, y
configura `apns-priority` y `apns-collapse-id` para agrupar avisos del mismo contenido.

---

## 5. Preferencias del usuario

`/settings → Notificaciones` ya permite activar o desactivar por categoría (mensajes,
oración, comunidad, cursos, eventos, iglesia). Hoy es estado local; el backend debe
persistirlo por usuario y **respetarlo antes de enviar**. Ignorar estas preferencias es
la vía rápida a que desinstalen la app.

Conviene además:

- Respetar horas de silencio por zona horaria.
- Limitar la frecuencia (por ejemplo, máximo dos notificaciones no transaccionales al
  día).
- Incluir siempre una forma de desactivar la categoría desde la propia notificación.
