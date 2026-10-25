# Navegación

La navegación se define en [`src/lib/nav.ts`](../src/lib/nav.ts). No hay sidebar
permanente: la navegación principal son **cinco pestañas inferiores**, cada una dueña
de su propia pila de pantallas.

---

## 1. Las cinco pestañas

| Pestaña | Ruta raíz | Subsecciones |
| --- | --- | --- |
| **Inicio** | `/home` | Para ti · Continuar viendo · Continuar escuchando · Recomendaciones |
| **Explorar** | `/explore` | Descubrir · Música · Podcasts · Sermones · Videos · Películas · Series · Cursos · Iglesias · Eventos · Ministerios |
| **Biblia** | `/bible` | Biblia · Devocionales · Planes · Oración |
| **Comunidad** | `/community` | Feed · Grupos · Mensajes · Eventos · Iglesias |
| **Biblioteca** | `/library` | Guardados · Música · Videos · Cursos · Historial · Descargas |

`tabForPath(pathname)` decide qué pestaña se ilumina, comparando contra la lista
`match` de cada pestaña. Así `/music/albums/al3` mantiene **Explorar** activa y
`/devotionals/d2` mantiene **Biblia**.

La pestaña Comunidad muestra un punto cuando hay notificaciones sin leer.

---

## 2. Navegación secundaria

Bajo la cabecera aparece una fila de píldoras desplazables con las subsecciones de la
pestaña activa. Se oculta automáticamente en pantallas de detalle (`hideSections`),
donde ocupar espacio con navegación lateral no tendría sentido.

---

## 3. Cabecera contextual

Cada pantalla declara su cabecera con el hook `useScreen`, igual que un
*navigation item* en nativo:

```tsx
useScreen({
  title: "Juan 3",
  back: true,          // muestra el chevron en lugar del avatar
  hideSections: true,  // oculta la sub-navegación
  immersive: false,    // true oculta toda la interfaz
  actions: <button …/>,// acciones contextuales a la derecha
});
```

El estado vive en [`src/store/screen.ts`](../src/store/screen.ts) y se restablece al
desmontar, de modo que ninguna pantalla hereda la cabecera de la anterior.

Composición de la cabecera:

- **Raíz de pestaña** → marca Heseria (solo en `/home`) o título · buscar ·
  notificaciones · avatar.
- **Pantalla de detalle** → chevron atrás · título · acciones.
- **Inmersiva** → sin cabecera (reproductor completo, conversación, llamada).

---

## 4. Lo que no está en las pestañas

Se llega desde la **hoja de cuenta** que abre el avatar:

- Perfil, Notificaciones, Mi iglesia, Fundación, Configuración
- Accesos rápidos de crecimiento: Devocionales, Planes, Oración, Mis cursos,
  Historial, Descargas
- **Gestión**: los portales que el rol permite (ver
  [`roles-permissions.md`](roles-permissions.md))
- **Modo demo**: cambio de rol

---

## 5. Volver atrás

Tres caminos, todos hacia el mismo sitio:

1. El chevron de la cabecera (`navigate(-1)`).
2. El **botón físico Atrás de Android**, capturado en `AppShell` con
   `onHardwareBack`; desde la raíz sale de la app.
3. El gesto de deslizar desde el borde en iOS, que el WebView resuelve solo.

---

## 6. Patrones móviles en vez de patrones de escritorio

| En vez de… | Se usa… |
| --- | --- |
| Sidebar permanente | Pestañas inferiores + hoja de cuenta |
| Modal centrado grande | `BottomSheetContent` (hoja inferior) |
| Menú desplegable pequeño | Hoja inferior con filas `SheetAction` |
| Tabla de administración | `AdminList`: lista táctil con búsqueda, filtros, orden, selección y paginación |
| Hover para revelar acciones | Acciones siempre visibles o pulsación larga |
| Panel lateral de filtros | Hoja inferior de filtros |

---

## 7. Añadir una pantalla

1. Crea el componente en `src/pages/<dominio>/`.
2. Llama a `usePageMeta(...)` y `useScreen(...)` al inicio.
3. Regístrala con `lazy()` y una `<Route>` en [`src/App.tsx`](../src/App.tsx).
4. Si debe pertenecer a una pestaña, añade su prefijo al `match` de esa pestaña en
   `src/lib/nav.ts`.
