# Auditoría integral de HESERIA

Fecha: 24 de noviembre de 2026 · Repositorio: `CrisDavid-code/Heseria` · Rama de trabajo: `claude/skill-validation-app-adaptation-uff5md`

Este informe solo afirma lo que se verificó en el código, en las pruebas o en un recorrido real.
Estados: **Completa**, **Parcial**, **Visual solamente**, **Defectuosa**, **Inexistente**, **Bloqueada externamente**.

## 1. Arquitectura real

| Pieza | Lo que hay |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 + Tailwind 4, `react-router-dom` 7 (BrowserRouter) |
| Plataformas | **Web/PWA** (Firebase Hosting: heseria.web.app) y **APK Android** (Capacitor 8, compilado en CI). Proyecto **iOS** generado (Capacitor) pero **sin compilar ni publicar**: en iPhone se usa la PWA |
| Backend | **Firebase plan Spark**: Auth (correo y contraseña), Firestore base `(default)` en modo nativo, Hosting. Sin Cloud Functions ni Storage |
| Servidor auxiliar | Cloudflare Worker gratuito `heseria-push` (versículo del día por push web) |
| Seguridad de datos | `firestore.rules` + `tests/rules.test.mjs` contra el emulador |
| CI/CD | GitHub Actions: `CI` (build + reglas), `Publicar` (reglas, contenido, web, APK en la Release pública), `Servidor push` |
| Carpeta `server/` | Servidor Express anterior; **no lo usa la app** (se conserva como referencia) |

## 2. Estado inicial de las pruebas (antes de cambiar nada)

| Prueba | Resultado |
|---|---|
| `tsc -b` (tipos) | Sin errores |
| `npm run build` | Correcto |
| `npm run test:rules` (emulador) | **97 bien, 0 mal** |
| Linter | **No existe** en el proyecto (no hay configuración de ESLint) |
| Pruebas unitarias | No existían |

## 3. Matriz de auditoría

| Módulo | Función | Evidencia | Estado inicial | Acción | Dependencias | Resultado |
|---|---|---|---|---|---|---|
| Biblia | RVR1960 como versión principal | `services/bible.ts` (`DEFAULT_VERSION = "rvr1960"`), 8 versiones en `public/biblia` | Completa | Conservar | **Licencia de SBU pendiente** | Sin cambios |
| Biblia | Libros, AT/NT, capítulos, versículos | `BibleIndex.tsx`, `BibleChapter.tsx` | Completa | Conservar | — | Recorrido E2E: Juan 3 abre |
| Biblia | Búsqueda por palabra/frase | `bible.search()` (texto RVR1960) | Parcial (no busca por referencia escrita) | Pendiente | — | — |
| Biblia | Resaltados, notas, guardados | `users/{uid}/marks`, reglas solo-dueño | Completa | Conservar | — | Reglas probadas |
| Biblia | Comparar versiones | `StudyTools.tsx` | Completa | Conservar | Licencias de cada versión | — |
| Biblia | **Continuar leyendo** | No existía | Inexistente | **Implementar** | — | `readingStateService` + tarjeta en Biblia. E2E: aparece «Continuar leyendo» |
| Biblia | **Lectura en voz alta** | No existía | Inexistente | **Implementar** | Plugin nativo en APK; licencia de lectura en voz alta de RVR1960 pendiente | `useSpeech` + `SpeechBar`: versículo por versículo, resalta el que suena, pausa, anterior/siguiente, velocidad. E2E: botón visible |
| Biblia | Tamaño de texto, modo lectura | `BibleChapter.tsx` | Completa | Conservar | — | — |
| Biblia | Compartir cita / imagen | `VerseShare.tsx`, `lib/verse-image.ts` (fondos y plantillas, exporta PNG) | Completa | Conservar | — | — |
| Biblia | Diccionario, concordancia, referencias cruzadas, mapas | No existen | Inexistente | Pendiente | **Fuentes con licencia** | — |
| Memorización | Guardar, ocultar palabras, pistas, repaso espaciado | No existía | Inexistente | **Implementar** | — | `/memorizar`, `users/{uid}/memory`, prueba `tests/memorize.test.mjs`. E2E: «Lo recordé» sube a nivel 1/5 |
| Diario | **Diario espiritual** | No existía | Inexistente | **Implementar** | — | `/diario` (pestaña Espiritual): crear, editar, borrar, referencias, etiquetas, favoritos, búsqueda |
| Diario | **Diario de oración privado** | Solo había peticiones comunitarias (`prayers`) | Inexistente | **Implementar** | — | `/diario` (pestaña Oración): «Dios respondió» con fecha. E2E correcto. Reglas: ni el superadmin lo lee |
| Oración comunitaria | Peticiones públicas/de iglesia | `prayers` + reglas de visibilidad | Completa | Conservar | — | — |
| Devocionales | Catálogo (31), detalle, completar | `src/content/devotionals.json`, `Devotionals.tsx` | Completa | **Mejorar** | — | Se agregó lectura en voz alta |
| Devocionales | Series 7/21/30, recordatorios propios | — | Inexistente | Pendiente | — | — |
| Planes | 8 planes con progreso por día | `planProgress`, `Plans.tsx` | Parcial (sin pausar ni cambiar ritmo) | Pendiente | — | — |
| Radio | **Radio cristiana en vivo** | No existía | Inexistente | **Implementar** | Emisoras con permiso | `/radio`, `radios` (solo admin escribe, https obligatorio), reproductor único con reconexión (2-4-8-16-30 s), «Sin señal», temporizador de apagado, favoritos, historial, pantalla de bloqueo, sin adelantar en vivo. Admin → Radios con «Probar transmisión» y detección de duplicados |
| Radio | Emisoras de Zeno.fm propuestas | Red del entorno bloquea zeno.fm | **Bloqueada externamente** | No se precargó ninguna | Verificar fuente, stream y permiso | Catálogo vacío hasta que la administración las agregue |
| Podcasts | 8 programas, 1,570 episodios por RSS | `podcastFeeds`, `scripts/cargar-contenido.mjs` | Parcial (sin velocidad, sin guardar progreso, sin temporizador) | Pendiente | — | — |
| Música | Instrumentales originales al leer | `public/musica`, `ReadingMusic.tsx` | Completa | Conservar | — | — |
| Videos/TV | Videos y sermones publicados, YouTube/Vimeo incrustados | `lib/media-source.ts`, `MediaPlayer.tsx` | Parcial (sin canales en vivo; catálogo vacío) | Pendiente | Permisos por canal | — |
| Lector | EPUB/PDF/TXT con marcadores | Solo se adjuntan archivos (`Files.tsx`) | Inexistente | Pendiente | Biblioteca (epub.js/pdf.js) y libros con licencia | — |
| IA | Asistente bíblico | No existe | Inexistente | Pendiente | **Clave de proveedor** (se guardaría en el Worker, nunca en la app) | — |
| Familia | Espacios, perfiles infantiles, control parental | No existe | Inexistente | Pendiente (bloque siguiente) | Consentimiento del tutor | — |
| Parejas | Vinculación, estudio compartido, Biblia sincronizada | No existe | Inexistente | Pendiente | — | — |
| Llamadas | Voz y video 1 a 1 | `store/call.ts` (WebRTC, `getUserMedia` con permiso) | Parcial (STUN público; sin TURN) | Reutilizar para Parejas | Servidor TURN para redes cerradas | — |
| Comunidad | Feed, grupos, mensajes, reportes | `Community.tsx`, `Groups.tsx`, `Messages.tsx` | Completa | Conservar | — | Reportar en el chat (entrega anterior) |
| Iglesias | 420 iglesias de OpenStreetMap con mapa | `src/content/churches.json`, `Churches.tsx` | Parcial (sin solicitudes de corrección) | Pendiente | — | — |
| Notificaciones | Versículo del día (APK local, web por Worker) | `native/index.ts`, `workers/push` | Completa | Conservar | — | — |
| Cuentas | Registro, login, recuperar, borrar cuenta, exportar datos | `authService`, `exportMyData` | Completa | Conservar | — | — |
| Roles | 15 roles + superadmin | `lib/permissions.ts`, reglas | Completa | Conservar | — | Reglas probadas |
| Admin | Panel global, moderación, comentarios, fundación | `GlobalAdmin.tsx` | Completa | **Ampliar** | — | Nueva sección Radios |
| Licencias | Registro de procedencia/licencias | Solo aviso por versión bíblica | Inexistente | Pendiente | — | — |
| Fallas | Reporte automático | `lib/auto-report.ts`, `ErrorBoundary.tsx` | Completa | Conservar | — | — |
| UI | Colores con opacidad en modo desarrollo local | Recorrido con `vite --mode emu` | Defectuosa (solo en desarrollo) | Documentar | — | En la versión compilada se ve correcto (verificado: `oklab(... / 0.15)`) |

## 4. Seguridad verificada (emulador de Firestore)

`npm run test:rules`: **111 bien, 0 mal**. Las 14 pruebas nuevas confirman que:

- Nadie lee ni escribe el diario de otra persona, **ni el superadmin**.
- Nadie ve los versículos que otro memoriza ni dónde está leyendo.
- Las anotaciones con un tipo inventado se rechazan, igual que los textos de más de 10,000 caracteres.
- Solo la administración agrega radios, y la URL debe ser https.

El contenido del diario no se envía a analítica, logs, IA ni notificaciones.

## 5. Pruebas ejecutadas en esta entrega

| Prueba | Resultado |
|---|---|
| `tsc -b --noEmit` | Sin errores |
| `npm run build` | Correcto |
| `npm run test:rules` | 111 bien, 0 mal |
| `node tests/memorize.test.mjs` | ok |
| Recorrido E2E (Chromium + emuladores de Auth y Firestore) | Correcto: registro, Juan 3, lectura en voz alta visible, memorizar y repasar, continuar leyendo, diario de oración con «Dios respondió» y radio vacía. Sin errores de página |
| Lectura en voz alta **sonando** en un teléfono | **No probada** (no hay dispositivo en este entorno) |
| Radio con una transmisión real | **No probada** (no hay emisoras verificadas; la red del entorno bloquea zeno.fm) |

## 6. Bloqueos externos y licencias pendientes

1. **RVR1960, NTV, LBLA, DHH y TLA:** se necesita el permiso escrito de las Sociedades Bíblicas Unidas, Tyndale y Lockman para distribuirlas, usarlas sin conexión, leerlas en voz alta y usarlas con IA.
2. **Radios:** antes de activar cada emisora hay que confirmar su fuente oficial, la URL de transmisión y el permiso de reproducción. Las condiciones de Zeno.fm no se pudieron leer desde este entorno.
3. **Asistente IA:** falta la clave del proveedor, que se guardaría como secreto del Worker, y una decisión de presupuesto.
4. **Familia:** faltan las reglas de consentimiento del tutor y de protección de menores según el país.
5. **Llamadas en redes cerradas:** hace falta un servidor TURN, que puede tener costo.
6. **iOS nativo:** hace falta una cuenta Apple Developer (99 USD al año) y una Mac o un CI con macOS.

## 7. Siguientes bloques (en orden de prioridad)

1. **Podcasts:** velocidad, guardar el progreso y temporizador. Búsqueda en la Biblia por referencia escrita. Pausar y cambiar el ritmo de los planes.
2. **HESERIA Parejas:** invitación privada, notas privadas y compartidas, Biblia sincronizada, reutilizando las llamadas WebRTC existentes.
3. **HESERIA Familia:** espacio privado, perfiles infantiles sin datos de contacto y actividades por edad.
4. **Registro de licencias y atribuciones** en el panel de administración.
5. **Asistente IA** con el proveedor y los controles de costo definidos.
6. **Lector EPUB/PDF** con libros de dominio público.
