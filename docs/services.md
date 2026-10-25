# Servicios

Todos en [`src/services/index.ts`](../src/services/index.ts). Cada dominio exporta una
**interfaz** y un **objeto** que la implementa llamando al servidor.

Las peticiones pasan por [`src/services/api.ts`](../src/services/api.ts), que resuelve la
dirección del servidor, adjunta el token y renueva la sesión sola cuando caduca. Ninguna
pantalla llama a `fetch`.

```ts
export interface SermonService {
  list(): Promise<Sermon[]>;
  get(id: ID): Promise<Sermon | undefined>;
  related(id: ID): Promise<Sermon[]>;
  byChurch(churchId: ID): Promise<Sermon[]>;
}
export const sermonService: SermonService = {
  list: () => api.get<Sermon[]>("/api/sermons"),
  // …
};
```

Un 401 no llega a la pantalla: el cliente pide un token nuevo y reintenta la misma
petición. Solo si la renovación falla se cierra la sesión y se vuelve al acceso.

---

## Catálogo

| Servicio | Métodos principales |
| --- | --- |
| `authService` | `login`, `register`, `logout`, `getCurrentUser`, `updateProfile`, `changePassword`, `requestPasswordReset`, `resetPassword`, `registerPushToken`, `deleteAccount` |
| `userService` | `list`, `get`, `updateProfile`, `follow`, `byRole` |
| `churchService` | `list(filtros)`, `get`, `myChurch`, `join`, `members`, `nearby` |
| `bibleService` | `versions`, `books`, `chapter`, `search`, `verseOfTheDay` |
| `devotionalService` | `list`, `get`, `today`, `complete` |
| `planService` | `list`, `get`, `markDay` |
| `prayerService` | `list(scope)`, `get`, `create`, `pray` |
| `musicService` | `songs`, `song`, `artists`, `artist`, `albums`, `album`, `playlists`, `playlist`, `songsByArtist`, `songsByAlbum`, `albumsByArtist`, `newReleases`, `popular`, `genres` |
| `podcastService` | `list`, `get`, `categories` |
| `sermonService` | `list`, `get`, `related`, `byChurch` |
| `videoService` | `list`, `get`, `categories` |
| `movieService` | `list`, `get`, `featured`, `genres` |
| `seriesService` | `list`, `get` |
| `courseService` | `list(filtros)`, `get`, `enroll`, `myCourses`, `byInstructor`, `completeLesson`, `save`, `categories` |
| `communityService` | `feed`, `get`, `create`, `like`, `comment`, `report`, `byAuthor` |
| `groupService` | `list`, `get`, `join`, `posts` |
| `messageService` | `conversations`, `conversation`, `messages`, `send`, `react`, `startCall` |
| `eventService` | `list`, `get`, `rsvp`, `upcoming`, `byChurch` |
| `ministryService` | `list`, `get`, `byChurch` |
| `foundationService` | `cases`, `case`, `featured`, `volunteerOpportunities`, `applyVolunteer` |
| `donationService` | `history`, `donate` |
| `notificationService` | `list`, `markRead`, `markAllRead` |
| `searchService` | `global`, `suggestions` |
| `libraryService` | `songs`, `playlists`, `sermons`, `courses`, `movies`, `videos`, `verses`, `history`, `downloads`, `toggleSave` |
| `analyticsService` | `kpis(scope)`, `series(scope)`, `breakdown(scope)` |
| `moderationService` | `queue(status)`, `resolve` |
| `recommendationService` | `forYou(role)`, `continueWatching`, `continueListening`, `people` |
| `contentService` | `list`, `get`, `create`, `update`, `publish`, `unpublish`, `remove` |
| `broadcastService` | `campaigns`, `campaign`, `send`, `cancel`, `remove`, `rules`, `toggleRule`, `updateRule`, `trigger` |
| `audienceService` | `active`, `engagement(contentId)`, `retention` |

`academyService` es un alias de `courseService`. `adminService` añade gestión de cuentas
y edición del catálogo; `publicService` sirve las cifras de la portada sin sesión.

---

## Alcance

Todo lo que se escribe vive en el servidor, así que su alcance es la plataforma entera,
no el dispositivo: el contenido publicado lo ve cualquiera, la notificación enviada llega
a todos los buzones y las vistas registradas alimentan las métricas de audiencia.

Ver [`backend.md`](backend.md) para el detalle de cada endpoint.

---

## Cómo se consumen

```tsx
// Lectura
const sermons = useAsync(() => sermonService.list(), []);

// Con dependencias: se recarga al cambiar el filtro,
// descartando respuestas obsoletas.
const courses = useAsync(() => courseService.list({ level }), [level]);

// Acción del usuario, con estado de envío
const { execute, pending, error } = useAction(authService.login);
```

**Regla:** una pantalla nunca importa de `src/mocks`. Si necesita datos, hay un servicio;
si no existe, se crea.

---

## La dirección del servidor

`api.ts` la resuelve en este orden:

1. La que haya guardado la persona en **Cuenta → Servidor**.
2. `VITE_API_URL`, compilada dentro del paquete.
3. El mismo host que sirve la web, en el puerto 4000.

Por eso el mismo APK sirve para probar en cualquier red sin recompilar.
