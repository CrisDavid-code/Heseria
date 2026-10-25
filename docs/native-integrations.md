# Integraciones nativas

Todas las capacidades nativas pasan por [`src/native/index.ts`](../src/native/index.ts).
En dispositivo se ejecuta el plugin de Capacitor; en el navegador cae a una alternativa
web segura, de modo que el mismo código funciona en `npm run dev` y en la app empaquetada.

```ts
import { haptic, share, getCurrentPosition, pickMedia, registerPush } from "@/native";
```

---

## Estado por capacidad

| Capacidad | Hoy | Falta |
| --- | --- | --- |
| Háptica | Funciona en dispositivo | — |
| Compartir | Hoja nativa / Web Share / portapapeles | — |
| Almacenamiento clave-valor | Preferences / localStorage | — |
| Estado de red | Funciona; alimenta el modo offline | — |
| Status bar y splash | Sincronizados con el tema | Assets de marca |
| Botón atrás de Android | Funciona | — |
| Ubicación | Pide permiso; devuelve mock si se deniega | Geocodificación y distancias reales |
| Cámara y galería | Selecciona archivo y lo muestra | **Subida a object storage** |
| Push | Pide permiso y registra | **Backend FCM/APNs** |
| Deep links | Escucha y enruta | **Universal / App Links** |
| Mapas | Componente visual | **SDK de mapas real** |
| Llamadas | Pantallas completas | **WebRTC + señalización** |
| Streaming | Reproductores simulados | **HLS/DASH + URLs firmadas** |
| Offline | Interfaz completa | **Descarga y caché reales** |

---

## 1. Ubicación

```ts
const { latitude, longitude } = await getCurrentPosition();
```

Pide el permiso solo en dispositivo. Si se deniega o falla, devuelve `MOCK_LOCATION`
(Santiago de Chile) para que ninguna pantalla se rompa.

**Pendiente:** el backend debe geocodificar iglesias, eventos, profesores y casos de la
fundación, y exponer búsqueda por radio. El campo `distanceKm` de `Church` hoy es un
valor sembrado.

Pantallas afectadas: `/churches`, `/events`, `/ministries`, `/foundation`, formación
musical presencial.

---

## 2. Cámara, galería y multimedia

```ts
const media = await pickMedia("camera" | "gallery");
```

Devuelve una URI nativa o un `objectURL` en web. El archivo se muestra localmente pero
**no se sube a ningún sitio**.

**Pendiente:**

1. Endpoint que devuelva una URL firmada de subida.
2. Subida directa al object storage (S3, R2, GCS).
3. Transcodificación de video y generación de miniaturas.
4. Devolver la URL definitiva para persistirla.

Usado en: compositor de comunidad, adjuntos de chat, subida de artistas y creadores,
foto de perfil.

Grabación de audio y video en curso todavía no está implementada; requiere
`@capacitor-community/media` o equivalente.

---

## 3. Mapas

`src/components/media/MapPlaceholder.tsx` dibuja una cuadrícula estilizada con
marcadores en posiciones deterministas.

**Pendiente:** sustituir por Google Maps o Mapbox. La interfaz del componente ya tiene
la forma que necesita el real:

```tsx
<MapPlaceholder
  title="Comunidad Vida Nueva"
  subtitle="Santiago, Chile"
  markers={[{ id, label, meta }]}
/>
```

Bastaría con mantener esa firma y cambiar el interior, más añadir `latitude`/`longitude`
a los marcadores.

---

## 4. Llamadas

`src/pages/community/Calls.tsx` implementa la máquina de estados completa: saliente,
entrante, conectando, activa y finalizada, con controles de micrófono, cámara,
altavoz, cambio de cámara, compartir pantalla, participantes y colgar.

**No hay WebRTC.** Lo que falta:

1. Servidor de señalización (WebSocket) para oferta/respuesta e ICE.
2. Servidores STUN y TURN.
3. `RTCPeerConnection` y captura de medios; en Capacitor conviene
   `@capacitor-community/camera-preview` o WebRTC del propio WebView.
4. Llamadas entrantes en segundo plano: CallKit en iOS y ConnectionService en Android.
5. Llamadas grupales: SFU (LiveKit, Janus, mediasoup).

`messageService.startCall()` ya devuelve un `callId`, que es el punto natural para
iniciar la señalización.

---

## 5. Streaming

`VideoPlayerMock` simula la reproducción con un reloj, pero implementa de verdad la
barra de progreso, capítulos, velocidad, calidad, subtítulos, silencio y pantalla
completa.

**Pendiente:** reemplazar el reloj por un `<video>` alimentado con un manifiesto
HLS/DASH y URLs firmadas. Para audio, `usePlayerClock` en
[`src/components/layout/Player.tsx`](../src/components/layout/Player.tsx) debe
sustituirse por un elemento `<audio>`; el resto del store del reproductor ya expresa
las operaciones reales (play, pause, seek, volumen, cola, shuffle, repeat).

Reproducción en segundo plano y controles en la pantalla de bloqueo requieren además
`@capacitor-community/media-session`.

---

## 6. Offline y descargas

La interfaz existe: interruptor de modo sin conexión, listado de descargas con progreso
y tamaño, aviso de contenido disponible, y `onNetworkChange` que detecta la
conectividad real.

**Pendiente:** descarga real con Filesystem, gestión de cuota, cifrado del contenido
con licencia y sincronización al recuperar conexión.

Aviso: muchas licencias bíblicas y de video **prohíben** el almacenamiento local. Hay
que revisarlo antes de implementar.

---

## 7. Moderación automática

`moderationService` gestiona la cola manual. La ficha de revisión ya reserva el espacio
para el veredicto automático y su nivel de confianza.

**Pendiente:** clasificación de texto e imagen en el backend, aplicada antes de
publicar. La interfaz no necesita cambios.
