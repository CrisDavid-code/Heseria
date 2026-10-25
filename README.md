# Heseria

**Un ecosistema digital para vivir, aprender, compartir y servir la fe.**

Aplicación cristiana para **Android, iOS y web instalable (PWA)**, con un único
código base (React + Capacitor) y **Firebase** (Auth + Firestore) como servidor.

```
Heseria
  ↓
Mobile first
  ↓
Android + iOS (Capacitor)  ·  Web instalable (PWA en Firebase Hosting)
  ↓
Firebase Auth + Firestore (reglas en firestore.rules)
```

---

## Estado

| Área | Estado |
| --- | --- |
| Navegación (5 pestañas + pilas internas) | Completa |
| Cuentas (correo y Google) y datos | Firebase Auth + Firestore, reglas probadas en emulador |
| **Biblia** | **8 versiones dentro de la app, sin conexión**: RVR1960 (principal), NTV, LBLA, DHH, TLA, RV1909, KJV y BPM |
| **PWA** | Manifest, íconos, service worker (abre sin red), invitación a instalar en Android/iPhone |
| **Sugerir función y reportar falla** | Con captura y datos del dispositivo, también sin sesión (`/feedback`); bandeja en Administración → Comentarios |
| Teléfonos viejos | Polyfills (Chrome 67+/iOS 14+), CSS sin `@layer`, aviso «actualiza tu navegador» |
| Logo e íconos | Desde `docs/marca/logo-heseria.png` con `scripts/make-logo.py` |
| CI | GitHub Actions: reglas, compilación web, APK descargable e iOS simulador |
| Aviso push con la app cerrada | Pendiente: credenciales FCM/APNs (el service worker ya muestra los avisos) |

---

## Puesta en marcha

```bash
npm install
npm run dev            # http://localhost:5173 contra Firebase de producción (.env.production)
npm run dev:emu        # contra los emuladores locales (npm run emulators en otra terminal)
```

### Scripts

| Script | Qué hace |
| --- | --- |
| `npm run build` | Compila TypeScript y genera `dist/` (web + precache del service worker) |
| `npm run typecheck` | Verifica tipos |
| `npm run test:rules` | Prueba `firestore.rules` en el emulador |
| `npm run cap:sync` | Compila y copia `dist/` a Android e iOS |
| `npm run android` / `npm run ios` | Sincroniza y abre Android Studio / Xcode |
| `npm run deploy:web` | Publica la PWA en Firebase Hosting |
| `npm run deploy:rules` | Publica las reglas de Firestore |
| `node scripts/build-bible-xmm.mjs` | Convierte los `.xmm` de `biblias/` a `public/biblia/` |
| `python3 scripts/make-logo.py` | Regenera íconos y pantallas de inicio desde el logo |

### Publicar para todos los dispositivos

El workflow **Publicar** (`.github/workflows/deploy.yml`) corre en cada push a `main` o a mano
(Actions → Publicar → Run workflow) y deja:

| Dispositivo | Cómo se instala |
| --- | --- |
| Android | https://github.com/CrisDavid-code/Heseria/releases/download/heseria-android/heseria.apk (se actualiza encima), o la PWA desde Chrome |
| iPhone / iPad | `https://heseria.web.app` en Safari → Compartir → «Agregar a pantalla de inicio» |
| Computadora | `https://heseria.web.app` (Chrome/Edge ofrecen «Instalar») |

Requisito único: el secreto de GitHub `FIREBASE_SERVICE_ACCOUNT_HESERIA` con la clave JSON de una
cuenta de servicio de **heseria-app** (Firebase → Configuración → Cuentas de servicio).
La app web de Firebase se crea sola la primera vez.

**Versículo del día por push en la web** (`workers/push`, Cloudflare Workers gratis): el workflow
**Servidor push** lo publica. Requiere los secretos `CLOUDFLARE_API_TOKEN` (plantilla «Edit
Cloudflare Workers») y `CLOUDFLARE_ACCOUNT_ID`. En el APK el aviso es local y no lo necesita.

---

## Arquitectura en una frase

```
Pantalla  →  Hook  →  Servicio  →  Firebase (Auth + Firestore)
```

Ninguna pantalla importa Firebase. Todo pasa por `src/services`; la autorización
real la imponen las reglas de `firestore.rules`.

```
src/
  components/   UI reutilizable (ui, layout, cards, media, states, admin)
  pages/        Una carpeta por dominio
  layouts/      AppShell, AuthLayout y Boot (arranque y guardas)
  services/     firebase.ts, fb.ts, bible.ts + index.ts (un objeto por dominio)
  hooks/        useAsync, useAction, usePageMeta
  store/        Sesión, tema, reproductor, biblioteca, directorio, preferencias
  native/       Capa de capacidades nativas (Capacitor)
  types/        Tipos de dominio: el contrato con el servidor
  lib/          utils, i18n, nav, permissions, media-source

public/         biblia/ (8 versiones), manifest, sw.js e íconos de la PWA
biblias/        Biblias fuente en .xmm
server/         Servidor Express anterior (ya no lo usa la app; queda de referencia)
```

---

## Documentación

| Documento | Contenido |
| --- | --- |
| [`backend.md`](docs/backend.md) | **El servidor: base de datos, endpoints, permisos y lo pendiente** |
| [`architecture.md`](docs/architecture.md) | Capas, flujo de datos y decisiones |
| [`mobile-architecture.md`](docs/mobile-architecture.md) | Por qué Capacitor, cómo se empaqueta |
| [`navigation.md`](docs/navigation.md) | Pestañas, pilas y cabecera contextual |
| [`routes.md`](docs/routes.md) | Las rutas, una por una |
| [`design-system.md`](docs/design-system.md) | Tokens, tipografía, portadas generativas |
| [`components.md`](docs/components.md) | Catálogo de componentes |
| [`services.md`](docs/services.md) | Contrato de cada servicio |
| [`mock-data.md`](docs/mock-data.md) | El dataset con el que se siembra |
| [`content-distribution.md`](docs/content-distribution.md) | **Subir contenido y llegar a todos sin actualizar la app** |
| [`roles-permissions.md`](docs/roles-permissions.md) | 15 roles y sus permisos |
| [`native-integrations.md`](docs/native-integrations.md) | Cámara, ubicación, mapas, llamadas |
| [`deep-links.md`](docs/deep-links.md) | Esquema `heseria://` y universal links |
| [`push-notifications.md`](docs/push-notifications.md) | FCM y APNs |
| [`mobile-permissions.md`](docs/mobile-permissions.md) | Permisos por plataforma |
| [`backend-integration.md`](docs/backend-integration.md) | Qué queda por conectar |

---

## Repositorios

- **CrisDavid-code/Heseria** (este, público): el código. GitHub Actions es gratis e ilimitado.
- **CrisDavid-code/Heseria-App** (privado): historial anterior y respaldo de las Biblias con derechos
  de autor (RVR1960, NTV, LBLA, DHH, TLA). Esas cinco no se guardan aquí: el workflow las descarga
  de la web publicada antes de compilar (`scripts/descargar-biblias.mjs`).

## Avisos importantes

- **Biblia.** RVR1960, NTV, LBLA, DHH y TLA tienen derechos de autor (Sociedades
  Bíblicas Unidas, Tyndale y Lockman). La app muestra el aviso de cada una, pero
  **publicarla en tiendas o en la web requiere el permiso escrito de cada editorial**.
  RV1909, KJV y BPM son de dominio público.
- **Aportes.** Funcionan de punta a punta, pero **sin pasarela de pago**: el
  dinero se mueve por PayPal, transferencia o en persona, y la app registra,
  entrega comprobante y permite confirmar. El servidor rechaza cualquier dato de
  tarjeta. Configúralos en Administración → Fundación → Métodos.
- **Llamadas.** Son WebRTC real y el audio y el video van directos entre los dos
  teléfonos. En redes muy cerradas hace falta un servidor TURN.
- **Ubicación.** El GPS es real: la app pide el permiso al usarlo y calcula la
  distancia de verdad a cada congregación. Si lo deniegas o el GPS está apagado,
  lo dice y no inventa distancias.
- **Iglesias.** El catálogo son congregaciones **evangélicas de Guatemala** con
  coordenadas reales, pero **nombres inventados**: no se hace pasar por
  verificada la ficha de una iglesia que existe ni se publican sus datos de
  contacto sin que ella lo pida. Cuando abra el registro, cada congregación
  creará y confirmará la suya.
- **Medios de prueba.** El audio y el video se generan por código en
  `server/src/make-media.mjs`. Son obra original, sin derechos de terceros.
- **Cuentas de demostración.** Diez cuentas con contraseña conocida. Bórralas
  antes de publicar.
- **APK de depuración.** El que se genera con `assembleDebug` no está firmado
  para tienda y admite tráfico HTTP para poder probar en la red local.

---

## Licencia

Proyecto privado de Aguiteks. Todos los derechos reservados.
