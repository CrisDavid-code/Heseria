# Datos de demostración

El dataset de [`src/mocks/data.ts`](../src/mocks/data.ts) ya no lo lee la aplicación:
hoy es la **semilla del servidor**. `server/src/export-dataset.mjs` lo exporta a JSON y
`server/src/seed.js` lo convierte en filas reales de la base de datos.

Sigue siendo un único dataset, coherente y **determinista**.

---

## 1. Por qué determinista

No hay `Math.random` en ninguna parte. Los valores derivan de una función sembrada:

```ts
export function seeded(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
```

Consecuencia: la misma entrada produce siempre la misma salida. Las capturas no cambian
entre ejecuciones, las pruebas visuales son estables y dos dispositivos muestran lo
mismo.

---

## 2. Inventario

| Entidad | Cantidad | Prefijo |
| --- | --- | --- |
| Usuarios | 28 | `u1…u28` |
| Iglesias | 8 | `c1…c8` |
| Ministerios | 12 | `m1…m12` |
| Artistas | 8 | `ar1…ar8` |
| Canciones | 24 | `s1…s24` |
| Álbumes | 8 | `al1…al8` |
| Playlists | 6 | `pl1…pl6` |
| Podcasts | 6 (8 episodios c/u) | `pd1…pd6` |
| Sermones | 12 | `sm1…sm12` |
| Videos | 18 | `v1…v18` |
| Películas | 12 | `mv1…mv12` |
| Series | 6 (2 temporadas × 6) | `se1…se6` |
| Cursos | 20 (4 módulos × 4 lecciones) | `co1…co20` |
| Devocionales | 12 | `d1…d12` |
| Planes | 12 (14 días c/u) | `pn1…pn12` |
| Peticiones | 10 | `pr1…pr10` |
| Eventos | 12 | `e1…e12` |
| Grupos | 8 | `g1…g8` |
| Publicaciones | 12 | `po1…po12` |
| Conversaciones | 6 (8 mensajes c/u) | `cv1…cv6` |
| Casos sociales | 10 | `fc1…fc10` |
| Voluntariado | 6 | `vo1…vo6` |
| Donaciones | 18 | `dn1…dn18` |
| Notificaciones | 8 | `n1…n8` |
| Moderación | 14 | `mo1…mo14` |
| Libros bíblicos | 34 | por slug |
| Versiones bíblicas | 6 | `hsd`, `rvd`, `nvi`, … |

---

## 3. Relaciones

Las referencias cruzadas son reales, no decorativas:

```
User.churchId        → Church.id
Church.pastorId      → User.id
Church.ministries[]  → Ministry.id
Ministry.churchId    → Church.id
Ministry.leaderId    → User.id
Song.artistId        → Artist.id
Song.albumId         → Album.id
Album.artistId       → Artist.id
Playlist.trackIds[]  → Song.id
Sermon.preacherId    → User.id
Sermon.churchId      → Church.id
Course.instructorId  → User.id
Group.members[]      → User.id
Post.authorId        → User.id
Post.groupId         → Group.id
Message.conversationId → Conversation.id
Event.churchId       → Church.id
VolunteerOpportunity.caseId → FoundationCase.id
Donation.projectId   → FoundationCase.id
```

Por eso funcionan los cruces del producto: de un sermón se llega a su predicador, a su
iglesia y a su pasaje; de una canción, a su artista y su álbum.

El usuario actual es `u1` (Camila Aguilar), definido en `currentUserId`.

---

## 4. Color como identidad visual

Cada entidad lleva un campo `color` con un par de degradado de Tailwind, elegido de
`COLORS` mediante `color(seed)`. Alimenta las portadas generativas (ver
[`design-system.md`](design-system.md)) y garantiza que un elemento se vea igual en todas
las pantallas donde aparece.

Si el backend sirve imágenes reales, conserva este campo como respaldo.

---

## 5. Biblia

`getChapter(bookId, chapter, version)` genera entre 12 y 32 versículos con texto de
demostración explícito:

> «Texto de demostración: este versículo se sustituirá por el contenido de una
> traducción licenciada.»

**Es deliberado.** Heseria no distribuye traducciones protegidas. El selector de
versiones marca cuáles requieren licencia (`licensed: false`) y las deshabilita. Al
integrar una API autorizada hay que revisar cuota, atribución y restricciones de caché.

---

## 6. Datos que sí crea el usuario

Cuentas, publicaciones, comentarios, oraciones, mensajes, matrículas, biblioteca,
donaciones, contenido publicado, campañas y vistas viven en tablas propias del
servidor, no en el dataset. Ver [`backend.md`](backend.md#2-la-base-de-datos).

---

## 7. Dos correcciones que exigió la base de datos

El dataset fue escrito para pintar pantallas, no para ser una base de datos, así que la
siembra corrige dos cosas:

- **Correos repetidos.** Veinte nombres se reparten entre veintiocho personas. Al segundo
  homónimo se le añade un número: `camila.aguilar2@heseria.app`.
- **Acentos en correos y alias.** Se pasan a ASCII: `mateo.cárdenas@` →
  `mateo.cardenas@`.

Además, la siembra enlaza los medios generados con el catálogo, de modo que canciones,
sermones, videos, películas, episodios y lecciones se reproducen de verdad.

Los **tipos** de `src/types/` se quedan: son el contrato entre la app y el servidor.
