# Arquitectura móvil

Heseria es, ante todo, una **aplicación para Android e iOS**. La web puede existir
después como producto complementario, pero no es lo que define este código.

---

## 1. Por qué Capacitor

Se evaluaron dos caminos para llegar a apps reales en ambas tiendas:

| | React Native / Expo | **Capacitor (elegido)** |
| --- | --- | --- |
| UI | Nativa real | WebView dentro de un contenedor nativo |
| Reutilización del trabajo | Nula: obliga a reescribir todos los componentes | Total |
| APIs nativas | Sí | Sí (cámara, push, ubicación, share, ficheros…) |
| Publicación en App Store / Play | Sí | Sí |
| Un solo código base | Sí | Sí |

Se eligió **Capacitor** porque conserva íntegro el design system, los componentes, las
pantallas y la capa de servicios ya construidos, y aun así produce proyectos
`android/` e `ios/` reales que se compilan a `.apk`/`.aab` y `.ipa`.

**La contrapartida, dicha con claridad:** la capa visual sigue siendo tecnología web
renderizada en un WebView. Es una app publicable y con acceso nativo, pero no es UI
nativa como React Native. Si en el futuro se prioriza el rendimiento gráfico extremo
sobre la velocidad de iteración, migrar a React Native implicaría reescribir la capa
de presentación conservando `types/`, `services/`, `store/` y `mocks/` tal cual.

---

## 2. Cómo se empaqueta

```
src/  →  npm run build  →  dist/  →  npx cap sync  →  android/  ios/
```

`capacitor.config.ts` define el identificador `app.heseria.mobile`, el color de fondo
del arranque y la configuración de splash, status bar, teclado y push.

```bash
npm run cap:sync      # build + copia a los proyectos nativos
npm run android       # + abre Android Studio
npm run ios           # + abre Xcode
```

Los proyectos nativos ya están generados en el repositorio. Tras cambiar código web
basta con `npm run cap:sync`; solo hace falta volver a abrir el IDE cuando cambian
plugins nativos o permisos.

---

## 3. El marco de la aplicación

`src/layouts/AppShell.tsx` es el equivalente al *navigation controller* de una app
nativa:

```
┌─────────────────────────────┐
│ AppHeader   (fijo, pt-safe) │  título contextual, atrás, acciones
├─────────────────────────────┤
│                             │
│ <Outlet/>  (único scroll)   │  la pantalla actual
│                             │
├─────────────────────────────┤
│ MiniPlayer  (fijo)          │  persiste entre pantallas
│ BottomTabs  (fijo, pb-safe) │  navegación principal
└─────────────────────────────┘
```

Puntos clave:

- **El documento no hace scroll.** Solo la columna de contenido tiene
  `overflow-y-auto`, así la cabecera, el reproductor y las pestañas nunca se mueven.
- **Cada navegación vuelve arriba**, como al apilar una pantalla nueva.
- **El botón físico Atrás de Android** recorre el historial y sale de la app desde la
  raíz (`onHardwareBack`).
- **Modo inmersivo:** una pantalla puede ocultar toda la interfaz (`immersive: true`)
  para el reproductor completo, la conversación de chat o una llamada.

---

## 4. Safe areas

Los tokens `--safe-top`, `--safe-bottom`, `--safe-left` y `--safe-right` leen
`env(safe-area-inset-*)`. En el navegador valen `0px`; en dispositivo respetan notch,
Dynamic Island, barra de estado y barra de gestos.

Utilidades: `pt-safe`, `pb-safe`, `px-safe`, `top-safe`.

- La cabecera usa `pt-safe`.
- La barra de pestañas usa `pb-safe`.
- Las hojas inferiores añaden `var(--safe-bottom)` a su padding.
- El compositor del chat también, para no quedar bajo la barra de gestos.

---

## 5. Reglas móviles del design system

En `src/styles.css`, dentro de `@layer base`:

- `overscroll-behavior: none` — sin rebote del documento, como en nativo.
- `-webkit-tap-highlight-color: transparent` — sin flash azul al tocar.
- `user-select: none` en el chrome; el contenido de lectura recupera la selección con
  `[data-selectable]` (Biblia, devocionales, publicaciones, mensajes).
- `font-size: max(16px, …)` en inputs — iOS hace zoom por debajo de 16 px.
- `touch-action: manipulation` en botones y enlaces — elimina el retardo de 300 ms.
- `--tap: 2.75rem` y la utilidad `tap-target` garantizan objetos táctiles de 44 px.
- Tailwind 4 aplica `hover:` solo bajo `@media (hover: hover)`, así que ningún estado
  hover se queda pegado tras un toque.

---

## 6. Orientación

La app está pensada en **vertical**. Los reproductores de video ofrecen pantalla
completa, que en dispositivo puede rotar a horizontal. Para forzar el bloqueo global
hay que declararlo en los proyectos nativos:

- Android: `android:screenOrientation="portrait"` en `AndroidManifest.xml`.
- iOS: desmarcar landscape en *Deployment Info* de Xcode.

Queda a criterio del equipo nativo, porque bloquearlo impide el video horizontal.

---

## 7. Rendimiento en gama media

- Cada ruta se carga con `React.lazy`, así que la pantalla inicial descarga poco.
- Sin imágenes de mapa de bits: las portadas son SVG generativo (ver
  [`design-system.md`](design-system.md)).
- Un único `setInterval` global mueve el reproductor, en lugar de uno por componente.
- Los stores usan `useSyncExternalStore` con selectores, evitando renders en cascada.
- `prefers-reduced-motion` desactiva animaciones, y hay un ajuste manual equivalente.

---

## 8. Qué falta para producción

Lo que sigue pendiente vive en [`backend-integration.md`](backend-integration.md) y
[`native-integrations.md`](native-integrations.md). En resumen: backend, base de datos,
autenticación real, almacenamiento, streaming, pagos, WebRTC, push, mapas, IA y
moderación automática.
