# Rutas

**108 rutas** más la página 404. Todas registradas en
[`src/App.tsx`](../src/App.tsx) y cargadas con `React.lazy`.

Convenciones: `:id` es un identificador del dataset (ver
[`mock-data.md`](mock-data.md)); toda ruta es también un destino de enlace profundo (ver
[`deep-links.md`](deep-links.md)).

---

## Público

| Ruta | Pantalla |
| --- | --- |
| `/` | Landing pública |
| `/login` | Inicio de sesión |
| `/register` | Registro |
| `/forgot-password` | Recuperar contraseña |
| `/onboarding` | Personalización en tres pasos |
| `*` | 404 con búsqueda y accesos |

`/login`, `/register` y `/forgot-password` comparten `AuthLayout`.

---

## Inicio · Explorar · Buscar

| Ruta | Pantalla |
| --- | --- |
| `/home` | Inicio personalizado por rol |
| `/explore` | Descubrimiento por categorías |
| `/search` | Búsqueda global con filtros por tipo |

---

## Biblia y crecimiento

| Ruta | Pantalla |
| --- | --- |
| `/bible` | Versiones, libros, continuar leyendo |
| `/bible/:book/:chapter` | Lector con resaltado, notas, copiar y compartir |
| `/devotionals` | Devocional de hoy y archivo |
| `/devotionals/:id` | Lectura, reflexión, oración |
| `/plans` | Planes por categoría, en curso |
| `/plans/:id` | Días, tareas, progreso, recordatorios |
| `/prayer` | Peticiones: todas, mías, iglesia, respondidas |
| `/prayer/new` | Crear petición con visibilidad |

---

## Música

| Ruta | Pantalla |
| --- | --- |
| `/music` | Índice con géneros y populares |
| `/music/artists` | Directorio de artistas |
| `/music/artists/:id` | Perfil, canciones, álbumes |
| `/music/albums/:id` | Detalle con lista de pistas |
| `/music/playlists` | Playlists |
| `/music/playlists/:id` | Detalle y reproducción |

---

## Audio y video

| Ruta | Pantalla |
| --- | --- |
| `/podcasts` · `/podcasts/:id` | Shows y episodios |
| `/sermons` · `/sermons/:id` | Predicaciones con capítulos y cruces |
| `/videos` · `/videos/:id` | Videos por categoría |
| `/movies` · `/movies/:id` | Cine con hero y continuar viendo |
| `/series` · `/series/:id` | Temporadas y episodios |
| `/series/:id/watch` | Reproducción con «a continuación» |

---

## Academia

| Ruta | Pantalla |
| --- | --- |
| `/academy` | Catálogo y formación musical |
| `/courses` | Mis cursos y catálogo filtrable |
| `/courses/:id` | Ficha, módulos, requisitos, certificado |
| `/courses/:id/learn` | Reproductor con contenido, notas y materiales |

---

## Iglesias y comunidad

| Ruta | Pantalla |
| --- | --- |
| `/churches` | Búsqueda con filtros y mapa |
| `/churches/:id` | Perfil completo |
| `/my-church` | Mi iglesia |
| `/community` | Feed social con compositor |
| `/groups` · `/groups/:id` | Grupos, miembros, archivos |
| `/messages` | Conversaciones · `?c=<id>` abre el chat |
| `/events` · `/events/:id` | Eventos con RSVP y aforo |
| `/ministries` · `/ministries/:id` | Directorio de ministerios |

Las llamadas de voz y video viven dentro de la conversación, no en una ruta propia.

---

## Personal

| Ruta | Pantalla |
| --- | --- |
| `/library` | Biblioteca · `?tab=guardados\|musica\|videos\|cursos\|historial\|descargas` |
| `/notifications` | Centro de notificaciones |
| `/profile` · `/profile/:id` | Perfil propio o de otra persona |
| `/settings` | Nueve secciones en hojas inferiores |

---

## Fundación

| Ruta | Pantalla |
| --- | --- |
| `/foundation` | Portada con recaudación global |
| `/foundation/cases` | Casos por categoría |
| `/foundation/cases/:id` | Situación, necesidades, actualizaciones |
| `/foundation/volunteer` | Oportunidades e inscripción |
| `/foundation/donate` | Flujo de donación en cinco pasos |

---

## Contenido añadido

| Ruta | Pantalla |
| --- | --- |
| `/content/:id` | Reproduce contenido subido o enlazado |

Ver [`content-distribution.md`](content-distribution.md).

---

## Administración de iglesia

`/church-admin` y sus doce secciones: `members`, `members/:id`, `groups`, `ministries`,
`events`, `content`, `sermons`, `courses`, `messages`, `prayer`, `donations`,
`settings`.

## Portal docente

`/teacher` más `courses`, `courses/new`, `courses/:id`, `courses/:id/edit`, `students`,
`assignments`, `evaluations`, `certificates`, `analytics`.

## Portal de artista

`/artist` más `music`, `albums`, `songs`, `videos`, `events`, `analytics`.

## Portal de creador

`/creator` más `content`, `posts`, `videos`, `courses`, `analytics`.

## Administración global

`/admin` más `users`, `churches`, `content`, `media`, `courses`, `events`, `reports`,
`moderation`, `foundation`, `notifications`, `audience`, `settings`.

`notifications` y `audience` son adiciones posteriores al alcance inicial: difusión de
notificaciones y métricas de audiencia.

---

## Añadir una ruta

1. Crea el componente en `src/pages/<dominio>/`.
2. Llama a `usePageMeta` y `useScreen`.
3. Declara `const X = lazy(...)` y una `<Route>` en `src/App.tsx`.
4. Si pertenece a una pestaña, añade su prefijo al `match` correspondiente en
   `src/lib/nav.ts`.
