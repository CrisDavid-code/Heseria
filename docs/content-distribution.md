# Distribución de contenido

**Pregunta clave: ¿hay que actualizar la app cada vez que se sube contenido nuevo?**

No. Y la razón es arquitectónica, no un truco.

---

## 1. El principio

El contenido es **dato**, no **código**.

- Actualizar la app en Google Play o App Store solo hace falta cuando cambia el
  **código**: pantallas nuevas, correcciones, plugins nativos.
- El catálogo —música, películas, series, videos, sermones, podcasts— se pide al
  servidor **en tiempo de ejecución**, cada vez que el usuario abre una pantalla.

Por eso el superadministrador publica algo y aparece en todos los dispositivos en el
siguiente refresco, sin pasar por la tienda ni pedirle nada al usuario. **Esto ya
funciona**, no es una promesa.

---

## 2. Cómo está preparado

Toda pantalla de catálogo consume un servicio:

```
/movies  →  useAsync(() => movieService.list())  →  movieService  →  GET /api/movies
```

`contentService` (en [`src/services/index.ts`](../src/services/index.ts)) es el que
gestiona lo que se sube desde la app:

```ts
contentService.create(input, onProgress)   // ingesta
contentService.list(kind)                  // catálogo
contentService.publish(id) / unpublish(id)
contentService.remove(id)
```

Su implementación llama al servidor, así que lo publicado es **global**: lo ve cualquiera
con la app instalada, en cualquier dispositivo, sin actualizar nada.

---

## 3. Cómo funciona en el servidor

### 3.1 Endpoints

```
GET    /api/content?kind=          catálogo
GET    /api/content/:id
POST   /api/content                crea (metadatos + fuente)
PATCH  /api/content/:id
POST   /api/content/:id/publish
POST   /api/content/:id/unpublish
DELETE /api/content/:id

POST   /api/content/uploads        sube el archivo y devuelve su URL
POST   /api/views                  registra una visualización
```

Publicar exige el permiso `canPublish`, y quien publica solo gestiona lo suyo salvo la
administración global.

`POST /api/content` recibe exactamente `ContentInput`:

```ts
{ kind, title, subtitle, description, category, durationSec, source, ownerId }
```

Y `source` es un `MediaSource` de [`src/lib/media-source.ts`](../src/lib/media-source.ts):

```ts
{ kind: "file" | "link", url, originalUrl?, provider, fileName?, sizeMb? }
```

### 3.2 Las dos vías de ingesta

**Por enlace.** El cliente detecta el proveedor (YouTube, Vimeo, `.mp4`, `.mp3`,
`.m3u8`) y normaliza la URL; el servidor comprueba que empiece por `http(s)://` y la
guarda. No hay archivo que almacenar: la reproducción va contra el origen.

**Por archivo.** `POST /api/content/uploads` recibe el archivo con progreso real (XHR,
porque `fetch` no lo expone), lo guarda en `server/uploads/` y devuelve su URL; después
el cliente crea la ficha apuntando a ella. El servidor filtra por tipo MIME y limita el
tamaño con `HESERIA_MAX_UPLOAD_MB` (512 MB por defecto). Borrar el contenido borra
también el archivo del disco.

**Lo que falta para producción:** almacenamiento de objetos (S3, R2, GCS) con URLs
firmadas en lugar del disco local, y una cola de transcodificación a HLS en varias
calidades. Hoy el archivo se sirve tal cual se subió.

### 3.3 Entrega

- **Enlaces externos:** nada que hacer, los reproduce el origen.
- **Archivos propios:** hoy los sirve Express desde `/uploads`, con
  `Accept-Ranges: bytes` para que el reproductor pueda saltar en la línea de tiempo. En
  producción, CDN con URLs firmadas de caducidad corta; para contenido con licencia,
  considerar DRM (Widevine en Android, FairPlay en iOS).

### 3.4 Frescura sin actualizar la app

Tres mecanismos, de menor a mayor inmediatez:

1. **Al abrir la pantalla.** Así funciona hoy: cada `useAsync` vuelve a pedir los datos.
2. **Invalidación con ETag.** El cliente manda `If-None-Match`; el servidor responde
   `304` si nada cambió. Ahorra datos en móvil.
3. **Push silencioso.** Al publicar contenido, enviar un push con
   `content-available: 1` para que la app refresque en segundo plano. Ver
   [`push-notifications.md`](push-notifications.md).

---

## 4. Aviso automático al publicar

Al crear contenido, el **servidor** dispara la regla `content.published` y genera una
campaña automática hacia el segmento configurado, dejando una notificación en el buzón de
cada destinatario. No lo decide el dispositivo: enviar avisos masivos no es cosa del
cliente.

**Ese disparo debe moverse al servidor.** Hoy ocurre en el cliente porque no hay otro
sitio, pero solo el backend conoce a toda la audiencia y sus preferencias. El
administrador puede desactivar la regla desde `/admin/notifications → Automáticas`.

---

## 5. Dónde aparece lo publicado

| Tipo | Pantalla |
| --- | --- |
| `song`, `album` | `/music` — sección «Añadido recientemente» |
| `video` | `/videos` |
| `movie`, `series` | `/movies` |
| `sermon` | `/sermons` |
| `podcast` | `/podcasts` |

Todos enlazan a `/content/:id`, que reproduce la fuente real: iframe para YouTube y
Vimeo, `<video>` o `<audio>` para enlaces directos y archivos. El audio directo además
puede pasar al reproductor global y seguir sonando mientras se navega.

---

## 6. Quién puede publicar

| Rol | Portal | Alcance |
| --- | --- | --- |
| Artista | `/artist/music`, `/artist/songs`, `/artist/albums`, `/artist/videos` | Su propia música |
| Creador | `/creator/content`, `/creator/videos` | Su propio contenido |
| Admin de iglesia | `/church-admin/content`, `/church-admin/sermons` | Contenido de su iglesia |
| **Admin global** | `/admin/media`, `/admin/content` | **Todo el catálogo** |

Los permisos de interfaz están en [`roles-permissions.md`](roles-permissions.md). La
autorización real la valida el servidor en cada endpoint.
