# Sistema de diseño

Todo vive en [`src/styles.css`](../src/styles.css). Oscuro primero, acento cian,
sin dependencias de UI más allá de las primitivas de Radix.

---

## 1. Tokens

Los colores se declaran como variables CSS en `:root` (claro) y `.dark` (oscuro), y
`@theme inline` los expone a Tailwind. Por eso `bg-surface` o `text-muted-foreground`
funcionan y cambian de tema solos.

| Token | Uso |
| --- | --- |
| `background` | Fondo de la app |
| `surface` · `surface-2` | Paneles y superficies elevadas |
| `card` · `popover` | Tarjetas y capas flotantes |
| `primary` | Acción principal (cian) |
| `secondary` · `muted` | Fondos suaves y texto atenuado |
| `destructive` · `success` · `warning` | Estados semánticos |
| `border` · `input` · `ring` | Bordes y foco |
| `chart-1…5` | Series de gráficos |
| `sidebar*` | Superficie de navegación |

Escrito en `oklch`, que mantiene la luminosidad percibida constante al cambiar el tono.

**Nunca escribas un color literal.** Si un tono no existe como token, añádelo a los dos
temas.

---

## 2. Tipografía

- **Space Grotesk** para títulos (`font-display`), con tracking negativo.
- **DM Sans** para el resto.
- Ambas se cargan desde Google Fonts en `index.html`, con pila de respaldo del sistema.

Escala semántica:

| Clase | Tamaño | Uso |
| --- | --- | --- |
| `text-display` | 3,25 rem | Hero de la landing |
| `text-title` | 2 rem | Título de pantalla |
| `text-section` | 1,25 rem | Encabezado de sección |

Los números llevan `tabular-nums` en contadores, duraciones y métricas, para que no
bailen al actualizarse.

---

## 3. Utilidades propias

| Utilidad | Qué hace |
| --- | --- |
| `surface-card` | Tarjeta estándar: fondo, borde, radio |
| `glass` | Superficie translúcida con desenfoque |
| `hero-gradient` | Degradado radial de cabecera |
| `rail` | Carrusel horizontal con scroll-snap |
| `scroll-x` | Scroll horizontal con inercia, sin barra |
| `no-scrollbar` | Oculta la barra |
| `clamp-2` · `clamp-3` | Trunca a 2 o 3 líneas |
| `animate-fade-up` | Entrada de pantalla |
| `pt-safe` · `pb-safe` · `px-safe` · `top-safe` | Áreas seguras |
| `tap-target` | Mínimo táctil de 44 px |

---

## 4. Portadas generativas

La app no distribuye fotografía con licencia. Cada portada se **dibuja** a partir del id
del elemento, en [`src/components/media/covers.tsx`](../src/components/media/covers.tsx):

```tsx
<GenerativeCover seed={song.id} gradient={song.color} />
<MediaCover seed={movie.id} gradient={movie.color} title={movie.title} />
<HeroMedia seed={church.id} gradient={church.color}>…</HeroMedia>
```

Funcionamiento: un degradado del dataset más uno de seis motivos SVG elegido por hash
del `seed`. El mismo id produce siempre la misma imagen, en cualquier dispositivo y
render.

Ventajas: cero peso de descarga, cero licencias, coherencia total. Cuando el backend
sirva imágenes reales, `GenerativeCover` queda como respaldo para cuando falten.

---

## 5. Reglas móviles

Ver [`mobile-architecture.md`](mobile-architecture.md) §5. En resumen: sin rebote del
documento, sin resaltado de toque, inputs de 16 px mínimo, `touch-action: manipulation`,
objetivos de 44 px, y `hover:` solo en dispositivos con puntero.

---

## 6. Movimiento

Transiciones de 150–320 ms con `cubic-bezier(0.22, 1, 0.36, 1)`. Las pantallas entran
con `animate-fade-up`; los elementos táctiles responden con `active:scale-[0.98]` en
lugar de efectos hover.

`prefers-reduced-motion` desactiva todo, y Configuración → Apariencia ofrece el mismo
interruptor manualmente.

---

## 7. Temas

Tres modos: claro, oscuro y sistema. `applyTheme()` alterna la clase `.dark` en el
elemento raíz y `syncStatusBar()` pone la barra de estado del sistema a juego. La
preferencia se guarda en `heseria.theme`.

El HTML arranca con `class="dark"` y `hydrateStores()` corre antes del primer render,
así que no hay destello de tema equivocado.

---

## 8. Accesibilidad

- Foco visible con `:focus-visible` en 2 px del color `ring`.
- Enlace «Saltar al contenido» al inicio del shell.
- `aria-label` en todo botón que solo muestra un icono.
- `aria-pressed` en interruptores visuales; `role="alert"` en errores de formulario.
- Contraste AA sobre `background` y `surface` en ambos temas.
- Los reproductores exponen controles nativos cuando hay medio real.
