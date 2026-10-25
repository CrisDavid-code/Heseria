# Backend

El servidor de Heseria vive en [`server/`](../server). Es un proyecto npm aparte,
con sus propias dependencias, para que nada suyo entre en el paquete de la app.

```
Aplicación (Android · iOS · web)
        │  HTTP + JSON (token en Authorization)
        │  WebSocket  (mensajes, avisos y llamadas)
        ▼
Express 5 + ws  ──  SQLite (un archivo)
        │
        ├── /api/*      la API
        ├── /ws         tiempo real
        ├── /media/*    audio y video de prueba generados
        └── /uploads/*  archivos subidos desde la app
```

---

## 1. Puesta en marcha

```bash
cd server
npm install
npm start
```

Arranca en el puerto 4000 y muestra las direcciones por las que responde,
incluida la de la red local, que es la que necesita el teléfono.

| Comando | Qué hace |
| --- | --- |
| `npm start` | Levanta la API (siembra la base si está vacía) |
| `npm run dev` | Igual, recargando al guardar |
| `npm run reset` | Borra y vuelve a sembrar la base |
| `npm run media` | Regenera el audio y el video de prueba |
| `npm run smoke` | Prueba de humo: 136 comprobaciones sobre la API viva |
| `npm run smoke:realtime` | 17 comprobaciones del canal en vivo y las llamadas |
| `npm run smoke:push` | 26 comprobaciones del envío push contra FCM y APNs simulados |
| `npm run check:push` | Diagnóstico de las credenciales push reales |
| `node src/export-dataset.mjs` | Vuelve a exportar el dataset desde `src/mocks` |

Variables de entorno, todas opcionales:

| Variable | Para qué |
| --- | --- |
| `PORT` | Puerto (4000 por defecto) |
| `HESERIA_JWT_SECRET` | Secreto de firma. Sin él se genera uno y se guarda en la base |
| `HESERIA_MAX_UPLOAD_MB` | Tamaño máximo de subida (512 por defecto) |
| `HESERIA_SMTP_HOST` · `_PORT` · `_USER` · `_PASS` | Servidor de correo saliente |
| `HESERIA_MAIL_FROM` | Remitente, por ejemplo `Heseria <hola@heseria.app>` |
| `HESERIA_APP_URL` | Base de los enlaces del correo (`heseria://reset` por defecto) |
| `HESERIA_FCM_CREDENTIALS` | Ruta al JSON de la cuenta de servicio de Firebase |
| `HESERIA_APNS_KEY` · `_KEY_ID` · `_TEAM_ID` · `_BUNDLE_ID` | Credenciales de APNs |
| `HESERIA_TURN_URL` · `_USER` · `_PASS` | Servidor TURN para llamadas en redes cerradas |

---

## 2. La base de datos

Un solo archivo: `server/data/heseria.db`. El esquema está en
[`src/db.js`](../server/src/db.js) y tiene dos zonas.

**Catálogo.** Una tabla `catalog(kind, id, data JSON)` con todo lo editorial:
iglesias, ministerios, artistas, canciones, álbumes, playlists, pódcast,
sermones, videos, películas, series, cursos, devocionales, planes, eventos,
grupos, casos de la fundación, voluntariado, libros y capítulos bíblicos.

Esta es la pieza que hace que **añadir contenido no obligue a actualizar la
app**: el catálogo es dato servido, no código empaquetado.

**Tablas relacionales.** Todo lo que una persona crea o cambia:

```
users · refresh_tokens · password_resets
content · uploads
campaigns · auto_rules · notifications · push_tokens
views · activity
posts · post_likes · comments · follows
prayers · prayer_prays
enrollments · lesson_progress
library_items · downloads · history
conversations · conversation_members · messages
church_members · group_members · event_rsvps
donations · volunteer_applications
moderation · settings
```

### Siembra

`src/seed.js` toma `data/dataset.json` —exportado del mismo dataset que ya
usaba la app— y lo convierte en filas reales: catálogo, 38 cuentas con
contraseña, membresías, publicaciones con sus «me gusta», oraciones,
conversaciones, donaciones, reportes y un histórico de actividad.

Dos correcciones que exige una base real y el dataset no traía:

- El dataset reutiliza veinte nombres para veintiocho personas, así que había
  correos repetidos. Al segundo homónimo se le añade un número.
- Los correos y alias se pasan a ASCII: `mateo.cárdenas@` → `mateo.cardenas@`.

Además, `attachMedia()` enlaza los medios generados con el catálogo, de modo que
canciones, sermones, videos, películas, episodios y lecciones se reproducen de
verdad desde el primer arranque.

---

## 3. Cuentas y sesión

- Contraseñas con **bcrypt**. Nunca se guardan ni se devuelven en claro.
- **Access token** JWT de 2 horas + **refresh token** opaco de 90 días guardado
  en base de datos y por tanto revocable. Cada uso lo rota.
- El cliente renueva solo: `services/api.ts` detecta el 401, pide un token
  nuevo y reintenta la misma petición sin que la pantalla se entere.
- Cambiar la contraseña revoca todas las sesiones abiertas.

### Cuentas sembradas

Todas con la contraseña `heseria`:

| Correo | Rol |
| --- | --- |
| `camila.aguilar@heseria.app` | Usuaria |
| `pastor@heseria.app` | Pastor |
| `teacher@heseria.app` | Maestro |
| `musician@heseria.app` | Músico |
| `artist@heseria.app` | Artista |
| `missionary@heseria.app` | Misionero |
| `creator@heseria.app` | Creador |
| `churchadmin@heseria.app` | Administración de iglesia |
| `moderator@heseria.app` | Moderador |
| `admin@heseria.app` | Administración global |

> **Antes de publicar:** borra estas cuentas o cambia sus contraseñas, y quita
> el bloque de credenciales de prueba de la pantalla de acceso.

---

## 4. Permisos

`src/auth.js` repite la tabla de quince roles de
[`roles-permissions.md`](roles-permissions.md) y la aplica en cada endpoint con
`requirePermission` y `requireRole`.

Lo importante: **la autorización se decide en el servidor**. Los permisos del
frontend solo deciden qué se enseña; si alguien llama a la API directamente, es
esta capa la que responde 403.

Reglas propias que conviene conocer:

- Solo la administración global reparte roles, y no puede quitarse el suyo.
- Nadie puede suspender ni borrar su propia cuenta desde el panel.
- Quien publica contenido solo gestiona el suyo, salvo la administración global.
- Un reporte resuelto con «ocultar» retira de verdad la publicación.

---

## 5. La API

Prefijo `/api`. Todo JSON. Los errores traen `{ error, code }` con el mensaje ya
redactado en español, listo para mostrarse.

### Cuenta

```
POST   /api/auth/register        crear cuenta
POST   /api/auth/login           iniciar sesión
POST   /api/auth/refresh         renovar la sesión
POST   /api/auth/logout          revocar el refresh token
GET    /api/auth/me              perfil
PATCH  /api/auth/me              editar perfil
POST   /api/auth/change-password
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
POST   /api/auth/push-token      registrar el dispositivo
POST   /api/auth/heartbeat       latido de sesión
DELETE /api/auth/me              borrar la cuenta
```

### Catálogo (lectura pública)

```
/api/churches · /api/churches/nearby · /api/churches/:id
/api/churches-denominations
/api/churches/:id/members · /api/churches/:id/events · /api/churches/:id/sermons
/api/ministries · /api/ministries/:id
/api/bible/versions · /api/bible/books · /api/bible/:book/:chapter
/api/bible/search · /api/bible/verse-of-the-day
/api/devotionals · /api/devotionals/today · /api/devotionals/:id
/api/plans · /api/plans/:id
/api/music/songs · /api/music/artists · /api/music/albums · /api/music/playlists
/api/music/genres · /api/music/new-releases · /api/music/popular
/api/podcasts · /api/sermons · /api/videos · /api/movies · /api/series
/api/courses · /api/courses-categories
/api/events · /api/groups
/api/foundation/cases · /api/foundation/featured · /api/foundation/volunteer
/api/search · /api/search/suggestions
/api/public/stats
```

### Comunidad y cuenta

```
GET    /api/community/feed
POST   /api/community/posts
POST   /api/community/posts/:id/like        alterna
POST   /api/community/posts/:id/comments
POST   /api/community/posts/:id/report
DELETE /api/community/posts/:id

GET    /api/prayers?scope=all|mine|church|answered
POST   /api/prayers
POST   /api/prayers/:id/pray                alterna
POST   /api/prayers/:id/answered            avisa a quienes oraron

GET    /api/conversations
POST   /api/conversations                   abre o reutiliza una directa
GET    /api/conversations/:id/messages
POST   /api/conversations/:id/messages
POST   /api/conversations/:id/call

GET    /api/users · /api/users/suggested · /api/users/:id
POST   /api/users/:id/follow                alterna

GET    /api/library · /api/library/ids · /api/library/:kind
POST   /api/library/toggle
GET/POST/DELETE /api/history · /api/downloads
GET    /api/notifications · /api/notifications/unread-count
POST   /api/notifications/:id/read · /api/notifications/read-all
GET    /api/courses/enrolled · /api/courses/:id/progress
POST   /api/courses/:id/enroll
POST   /api/courses/:id/lessons/:lessonId/complete
GET/POST /api/donations
POST   /api/foundation/volunteer/:id/apply
GET    /api/recommendations · /api/continue/watching · /api/continue/listening
POST   /api/events/:id/rsvp · /api/churches/:id/join · /api/groups/:id/join
```

### Contenido

```
POST   /api/content/uploads     sube un archivo, devuelve su URL
GET    /api/content?kind=video
GET    /api/content/:id
POST   /api/content             publica (dispara la regla automática)
PATCH  /api/content/:id
POST   /api/content/:id/publish · /unpublish
DELETE /api/content/:id
POST   /api/views               registra una visualización
```

### Notificaciones

```
GET    /api/broadcast/segments      con el tamaño real de cada audiencia
GET    /api/broadcast/campaigns
POST   /api/broadcast/campaigns     envía o programa
POST   /api/broadcast/campaigns/:id/send · /cancel
GET    /api/broadcast/rules
PATCH  /api/broadcast/rules/:id
```

### Métricas y administración

```
GET    /api/audience/active
GET    /api/audience/engagement/:contentId     quiénes lo vieron y quiénes no
GET    /api/audience/retention
GET    /api/analytics/kpis?scope=church|teacher|artist|creator|admin
GET    /api/analytics/series · /breakdown · /overview · /activity
GET    /api/moderation · POST /api/moderation/:id/resolve
GET    /api/admin/users · POST · PATCH · DELETE
GET/POST/PATCH/DELETE /api/admin/catalog/:kind[/:id]
GET    /api/admin/health
```

---

## 6. Tiempo real y llamadas

Un solo WebSocket en `/ws`, autenticado con el mismo token de la API pasado como
`?token=`. Sirve para tres cosas:

**Mensajes en vivo.** Lo que alguien escribe aparece en la pantalla del otro sin
recargar, junto con el aviso de «está escribiendo» y el acuse de lectura. Quien
no tenga la app abierta recibe en cambio una notificación.

**Notificaciones al instante.** Una campaña enviada entra directamente en el
buzón que esté abierto en ese momento.

**Llamadas de voz y video.** Son WebRTC real: el audio y el video van directos
entre los dos dispositivos y **no pasan por el servidor**, que solo presenta a
los extremos y les entrega los servidores ICE.

```
quien llama                    servidor                quien recibe
───────────                    ────────                ────────────
call:invite       ─────────────►  ─────────────►  call:incoming
                  ◄── call:ringing
                  ◄─────────────  ◄─────────────  call:accept
oferta (SDP)      ─────────────►  ─────────────►  aplica la oferta
aplica respuesta  ◄─────────────  ◄─────────────  respuesta (SDP)
candidatos ICE    ◄────────────►  ◄────────────►  candidatos ICE
                      ... audio y video directos ...
call:hangup       ─────────────►  ─────────────►  call:ended
```

Con los STUN públicos de Google basta en la mayoría de redes domésticas y
móviles. En redes muy cerradas (NAT simétrico, algunas corporativas) hace falta
un **servidor TURN**, que retransmite el tráfico y por eso se contrata aparte:
se define en `HESERIA_TURN_URL` y aparece solo en `iceServers`.

Antes de que suene nada se comprueba que la otra persona tenga la app abierta y
se piden los permisos de micrófono y cámara. Si falta cualquiera de las dos
cosas se dice, y no se hace sonar el teléfono del otro.

Las llamadas de grupo todavía no están: el endpoint las rechaza con un mensaje
claro en vez de fingir que funcionan.

---

## 7. Aportes sin pasarela de pago

**Heseria no procesa pagos y no recibe datos de tarjeta.** Si una petición trae
un número de tarjeta, el servidor la rechaza entera. El dinero se mueve por
fuera y la aplicación lleva el registro.

El circuito completo:

1. La administración configura los métodos en **Administración → Fundación →
   Métodos**: PayPal, Mercado Pago, transferencia bancaria, otro enlace de cobro
   o en persona.
2. Quien dona elige monto, causa y método.
3. El servidor registra el aporte con un comprobante (`HSR-…`) en estado
   **pendiente** y devuelve el enlace ya armado —por ejemplo
   `paypal.com/paypalme/tuusuario/25USD`— o las instrucciones de transferencia.
4. El enlace se abre **fuera de la app**, en el navegador del sistema, para que
   se vea el dominio y el candado reales.
5. Al volver, la persona pulsa **Ya pagué** y puede dejar el número de
   operación. El aporte pasa a **por verificar** y la administración recibe el
   aviso.
6. La administración confirma y pasa a **completada**; quien donó recibe la
   confirmación.

Con PayPal.Me no hace falta cuenta de empresa, ni claves de API, ni revisión:
basta el nombre de usuario.

---

## 8. Correo

Con SMTP configurado envía de verdad: bienvenida al registrarse, código de
recuperación de contraseña y comprobante de aporte.

Sin SMTP, el mensaje se escribe en `server/outbox/` como archivo `.eml` —que
abre cualquier cliente de correo— y el trámite no se interrumpe: la recuperación
de contraseña devuelve el código en la respuesta para poder terminarla. **Con
SMTP configurado deja de devolverlo**, que es lo correcto en producción.

Con Gmail hay que usar una «contraseña de aplicación», no la de la cuenta.

---

## 9. Avisos push

`src/push.js` implementa el envío real contra **FCM HTTP v1** (Android) y
**APNs** (iOS), incluida la firma de los tokens y el descarte de los
dispositivos que ya no existen. No queda código por escribir: faltan las
credenciales, y el propio archivo explica cómo obtenerlas.

Mientras no estén, una campaña igual llega: entra en el buzón de la app y, a
quien la tenga abierta, al instante por WebSocket. Lo único que no ocurre es el
aviso del sistema con la app cerrada.

Conviene saber que **eso no es una limitación del código**: Android e iOS no
entregan notificaciones a una app cerrada por ningún otro camino que FCM y APNs.

---

## 10. Ubicación e iglesias cercanas

`GET /api/churches/nearby?lat=&lng=&radius=&denomination=&limit=`

Las coordenadas vienen del GPS del teléfono. La distancia se calcula con la
fórmula del semiverseno contra la posición de cada congregación: es una
distancia real, no un adorno.

**Sin coordenadas responde `located: false` y pone las distancias a `null`.** No
se inventa un número: si no se sabe dónde está la persona, la app lo dice.

El catálogo de iglesias está en
[`server/src/churches-gt.js`](../server/src/churches-gt.js): veinte
congregaciones **evangélicas de Guatemala** —Ciudad de Guatemala, Mixco, Villa
Nueva, Antigua, Quetzaltenango, Cobán, Huehuetenango y más—, con coordenadas
reales de cada barrio o localidad.

Las denominaciones admitidas son todas protestantes: evangélica, pentecostal,
bautista, presbiteriana, metodista, carismática, menonita, Asambleas de Dios,
Iglesia de Dios y nazarena. **Ninguna es católica**, por indicación expresa, y
`GET /api/churches-denominations` lo deja comprobable.

Los **nombres son inventados a propósito**. Publicar la ficha de una iglesia que
existe, con su dirección y su teléfono, sin que ella lo haya pedido, no es algo
que deba hacer una plataforma. Cuando abra el registro de congregaciones, cada
una creará y confirmará la suya.

En el teléfono, `getCurrentPosition()` usa el GPS y pide el permiso en el
momento; en el navegador usa la API de geolocalización, que solo funciona en
HTTPS o en localhost. Devuelve de dónde salió el dato (`gps`, `web` o `default`)
y, si falló, por qué: permiso denegado, sin señal o agotado el tiempo.

---

## 11. Medios de prueba

`node src/make-media.mjs` genera material **original**, sintetizado por código,
sin descargar ni incrustar obra de terceros:

| Archivo | Qué es |
| --- | --- |
| `cielo-abierto.mp3` | Instrumental de 1:37 — pad, arpegio, bajo y percusión |
| `manantial.mp3` | Instrumental de 1:31, más lento |
| `adviento.mp3` | 30 s; es también la banda sonora del video |
| `heseria-demo.mp4` | 960×540, 24 fps, H.264 + AAC |

El video lleva un reloj, un contador de fotogramas y una barra de progreso, así
que basta mirarlo para comprobar que reproducir, pausar y saltar funcionan.

El servidor sirve estos archivos con `Accept-Ranges: bytes`, que es lo que
permite saltar en la línea de tiempo.

---

## 12. Lo que sigue sin estar

| Pendiente | Qué falta |
| --- | --- |
| **Aviso push con la app cerrada** | Solo las credenciales: un proyecto de Firebase y una clave de APNs. El envío ya está escrito |
| **Correo saliente** | Solo las credenciales SMTP. Sin ellas se escribe en `outbox/` |
| **Llamadas en redes muy cerradas** | Un servidor TURN. Con STUN funciona en la mayoría de redes |
| **Llamadas de grupo** | Solo hay llamadas de dos. El endpoint lo dice en vez de fingirlo |
| **Biblia con licencia** | El texto es de demostración. `bibleService` ya tiene la forma que necesita una API autorizada |
| **Transcodificación** | Los archivos se sirven tal cual se suben; no hay varias calidades ni HLS |
| **Almacenamiento de objetos** | Las subidas van al disco del servidor, no a S3 ni R2 |

---

## 13. Llevarlo a producción

1. **HTTPS.** Detrás de un proxy con certificado. Sin esto, quita
   `usesCleartextTraffic` del manifiesto de depuración y nada más.
2. **`HESERIA_JWT_SECRET`** en el entorno, no generado al vuelo.
3. **PostgreSQL** si crece: el esquema es SQL estándar, cambia el driver.
4. **Almacenamiento de objetos** para `uploads/`, con URLs firmadas.
5. **Limitación de peticiones** en `/api/auth/login` y `/register`.
6. **Copias de seguridad** del archivo de base de datos.
7. **Borrar las cuentas de demostración.**
