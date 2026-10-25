# Arquitectura

## 1. La regla que ordena todo

```
Pantalla  →  Hook  →  Servicio  →  Implementación
```

- Una **pantalla** nunca importa datos. Llama a un hook.
- Un **hook** (`useAsync`, `useAction`) gestiona carga, error y recarga.
- Un **servicio** define un contrato tipado y devuelve promesas.
- La **implementación** llama al servidor por HTTP. El contrato no cambió al
  hacerlo: solo cambió de dónde salen los datos.

Esa disciplina se respetó en las 109 rutas: ninguna página llama a `fetch`. Es
lo que hace que conectar el backend no obligue a rehacer la interfaz.

---

## 2. Estructura

```
src/
  components/
    ui/          primitivas: button, primitives, overlays, controls
    layout/      AppHeader, BottomTabs, Player, Brand
    cards/       tarjetas de dominio reutilizables
    media/       portadas generativas, reproductores, mapas, ingesta
    states/      loading, empty, error, offline, skeletons
    admin/       AdminKit (KPIs, gráficos, listas) y ContentManager
  pages/         una carpeta por dominio
  layouts/       AppShell (marco móvil) y AuthLayout
  services/      api.ts (cliente HTTP) + un objeto por dominio
  hooks/         useAsync, useAction, usePageMeta
  store/         sesión, tema, player, biblioteca, notificaciones,
                 preferencias, screen, content, broadcast, engagement
  native/        capa de capacidades nativas (Capacitor)
  types/         tipos de dominio: el contrato con el backend
  store/         sesión, tema, reproductor, biblioteca, directorio
  lib/           utils, i18n, nav, permissions, media-source
```

---

## 3. Estado global

Sin librería externa. Cada store es un observable a nivel de módulo leído con
`useSyncExternalStore`:

| Store | Contenido | Persiste |
| --- | --- | --- |
| `themeStore` | claro / oscuro / sistema | sí |
| `sessionStore` | usuario, rol, persona demo | sí |
| `playerStore` | cola, reproducción, volumen, favoritos | no |
| `libraryStore` | guardados por tipo | sí |
| `notificationStore` | centro de notificaciones | no |
| `preferencesStore` | idioma, offline, Biblia, accesibilidad | sí |
| `screenStore` | chrome de la pantalla actual | no |
| `contentStore` | contenido añadido desde la app | sí |
| `broadcastStore` | campañas y reglas automáticas | sí |
| `engagementStore` | vistas y sesiones | sí |

Ventajas: sin árbol de providers, sin renders en cascada, y cada componente se suscribe
solo a lo que lee.

---

## 4. Enrutado

`react-router-dom` con `createBrowserRouter` clásico en [`src/App.tsx`](../src/App.tsx).
Cada ruta se carga con `React.lazy`, así que el arranque descarga poco.

Tres niveles:

1. **Público** — `/`, `/login`, `/register`, `/forgot-password`, `/onboarding`.
2. **Aplicación** — todo dentro de `<AppShell />`.
3. **404** — comodín.

Ver [`navigation.md`](navigation.md) y [`routes.md`](routes.md).

---

## 5. Datos asíncronos

```tsx
const sermons = useAsync(() => sermonService.list(), []);

<AsyncBoundary {...sermons} skeleton={<GridSkeleton />}>
  {(items) => items.map((s) => <SermonCard key={s.id} sermon={s} />)}
</AsyncBoundary>
```

`useAsync` descarta respuestas obsoletas, de modo que cambiar filtros rápido no provoca
carreras. `AsyncBoundary` resuelve las cuatro ramas —cargando, error, vacío, contenido—
en un solo sitio, y por eso todas las pantallas se comportan igual.

---

## 6. Capa nativa

Todo lo que toca el dispositivo pasa por [`src/native/index.ts`](../src/native/index.ts),
que detecta si corre en dispositivo o en navegador y elige plugin o alternativa web. Es
también la lista de tareas nativas pendientes: cada `TODO(backend)` marca un punto de
integración. Ver [`native-integrations.md`](native-integrations.md).

---

## 7. Decisiones y por qué

| Decisión | Motivo |
| --- | --- |
| Capacitor en vez de React Native | Conserva todo el trabajo y aun así produce apps reales. Coste: la UI es web en un WebView. Ver [`mobile-architecture.md`](mobile-architecture.md). |
| Stores propios en vez de Redux o Zustand | Tres funciones bastan; menos dependencias que mantener. |
| `useAsync` en vez de React Query | El proyecto no necesita caché ni invalidación todavía. Si el backend lo exige, se sustituye dentro del hook. |
| Portadas generativas | Sin licencias de imagen, sin peso de descarga, y coherentes en todo el catálogo. |
| Tipos como contrato | El backend se adapta a los tipos, no al revés. Evita que un cambio de modelo obligue a tocar pantallas. |
| Mocks deterministas | Sin `Math.random`: la misma entrada siempre produce la misma salida, así las capturas y las pruebas son estables. |

---

## 8. Qué no hay

No hay backend, base de datos, autenticación real, almacenamiento, streaming, pagos,
WebRTC, push reales, mapas, IA ni moderación automática. Todo eso está detrás de las
interfaces de servicio y documentado en
[`backend-integration.md`](backend-integration.md).
