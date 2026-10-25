# Componentes

---

## Primitivas · `src/components/ui/`

### `button.tsx`
`Button` con variantes `primary`, `secondary`, `outline`, `ghost`, `subtle`,
`destructive`, `link`; tamaños `sm`, `md`, `lg`, `icon`, `iconSm`; `full`, `loading` y
`asChild` para envolver un `<Link>`.

### `primitives.tsx`
`Card` (+`Header`, `Title`, `Description`, `Content`, `Footer`), `Badge`, `Input`,
`Textarea`, `Label`, `Field` (etiqueta + control + error o pista), `Avatar`, `Progress`,
`Separator`, `Skeleton`, `Chip`, `SectionHeading`, `PageHeader`, `Stat`.

### `overlays.tsx`
`Dialog`, **`BottomSheet` + `BottomSheetContent`** (el patrón por defecto en móvil, con
asa, tope al 88 % y variante a pantalla completa), `SheetAction` (fila táctil que
sustituye al menú desplegable), `DropdownMenu`, `Popover`, `Tooltip`.

### `controls.tsx`
`Switch`, `SettingRow`, `Checkbox`, `RadioGroup` + `RadioItem`, `Slider`, `Select` +
`SimpleSelect`, `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent`.

---

## Layout · `src/components/layout/`

| Componente | Función |
| --- | --- |
| `AppHeader` | Cabecera contextual y hoja de cuenta con cambio de rol |
| `BottomTabs` | Cinco pestañas con área segura y háptica |
| `MiniPlayer` | Reproductor sobre las pestañas |
| `FullPlayer` | Reproductor a pantalla completa |
| `AudioEngine` | `<audio>` real para pistas con `src` |
| `Brand` | `HeseriaMark`, `HeseriaWordmark` |

---

## Estados · `src/components/states/`

`EmptyState`, `ErrorState`, `OfflineState`, `LoadingState`, `RailSkeleton`,
`GridSkeleton`, `ListSkeleton`, `DetailSkeleton` y **`AsyncBoundary`**, que resuelve las
cuatro ramas (cargando, error, vacío, contenido) en un solo lugar:

```tsx
<AsyncBoundary {...sermons} skeleton={<GridSkeleton />}>
  {(items) => items.map((s) => <SermonCard key={s.id} sermon={s} />)}
</AsyncBoundary>
```

---

## Medios · `src/components/media/`

| Componente | Función |
| --- | --- |
| `GenerativeCover` | Portada dibujada a partir del id |
| `MediaCover` | Portada con título incrustado |
| `HeroMedia` | Banner de pantalla de detalle |
| `VideoPlayerMock` | Reproductor simulado con capítulos, velocidad y calidad |
| `MediaPlayer` | Reproductor **real**: iframe, `<video>` o `<audio>` |
| `MediaPreview` | Vista previa en la hoja de ingesta |
| `MediaIngestSheet` | Alta de contenido por archivo o enlace |
| `AddedContentSection` | Fila del contenido añadido en los catálogos |
| `MapPlaceholder` | Mapa visual con marcadores |

---

## Tarjetas · `src/components/cards/`

`Rail` (carrusel con título), `MediaCard`, `HorizontalMediaCard`, `HeroCard`,
`ContinueCard`, `SongRow`, `PlaylistCard`, `PodcastCard`, `SermonCard`, `VideoCard`,
`MovieCard`, `SeriesCard`, `CourseCard`, `ChurchCard`, `EventCard`, `PersonCard`,
`MinistryCard`, `GroupCard`, `DevotionalCard`, `FoundationCaseCard`, `VolunteerCard`.

`PostCard` vive en `src/pages/community/Community.tsx` porque acarrea la interacción
completa (me gusta, comentarios, compartir, reportar).

---

## Administración · `src/components/admin/`

### `AdminKit.tsx`
- `KpiRow` — cuatro métricas con variación
- `QuickActions` — accesos rápidos
- `TrendChart`, `BarsChart`, `BreakdownChart` — gráficos con Recharts y tokens del tema
- **`AdminList`** — el sustituto móvil de la tabla: búsqueda, filtros, orden, selección
  y paginación en una lista táctil
- `AdminSections` — índice de subsecciones
- `RecentActivity` — línea de tiempo

### `ContentManager.tsx`
Gestión del contenido añadido: subir, ver, métricas, publicar, despublicar y eliminar.
Se reutiliza en los portales de artista, creador, iglesia y administración global.

---

## Convenciones

1. **Móvil primero.** Se diseña a 375 px y se amplía; nunca al revés.
2. **Objetivos de 44 px.** Usa `tap-target` en controles solo de icono.
3. **Sin colores literales.** Solo tokens.
4. **Etiqueta accesible siempre.** Todo botón de icono lleva `aria-label`.
5. **Un componente, un trabajo.** Si crece demasiado, se parte.
6. **Sin dependencia del hover.** Es un teléfono; usa `active:`.
7. **Los datos entran por props.** Los componentes no llaman a servicios; lo hacen las
   pantallas.
