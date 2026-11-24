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
| Biblia | Búsqueda por palabra/frase y por referencia | `bible.search()`, `lib/reference.ts` | Parcial (no busca por referencia escrita) | **Mejorar** | — | «Juan 3:16», «1 cor 13», «salmo 23» abren el pasaje. Prueba `tests/reference.test.mjs` |
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
| Planes | 8 planes con progreso por día | `planProgress`, `Plans.tsx` | Parcial (sin pausar ni reiniciar) | **Mejorar** | — | Continuar, pausar, reanudar y empezar de nuevo |
| Radio | **Radio cristiana en vivo** | No existía | Inexistente | **Implementar** | Emisoras con permiso | `/radio`, `radios` (solo admin escribe, https obligatorio), reproductor único con reconexión (2-4-8-16-30 s), «Sin señal», temporizador de apagado, favoritos, historial, pantalla de bloqueo, sin adelantar en vivo. Admin → Radios con «Probar transmisión» y detección de duplicados |
| Radio | Emisoras de Zeno.fm propuestas | Red del entorno bloquea zeno.fm | **Bloqueada externamente** | No se precargó ninguna | Verificar fuente, stream y permiso | Catálogo vacío hasta que la administración las agregue |
| Podcasts | 8 programas, 1,570 episodios por RSS | `podcastFeeds`, `scripts/cargar-contenido.mjs` | Parcial (sin velocidad, sin guardar progreso, sin temporizador) | **Mejorar** | — | Velocidad 0.75–2×, retoma donde quedó, cola, temporizador de apagado |
| Música | Instrumentales originales al leer | `public/musica`, `ReadingMusic.tsx` | Completa | Conservar | — | — |
| Videos/TV | Videos y sermones publicados, YouTube/Vimeo incrustados | `lib/media-source.ts`, `MediaPlayer.tsx` | Parcial (sin canales en vivo; catálogo vacío) | Pendiente | Permisos por canal | — |
| Lector | EPUB/PDF/TXT con marcadores | Solo se adjuntan archivos (`Files.tsx`) | Inexistente | **Implementar** | epub.js + pdf.js (carga diferida) | `/lector`: abre archivos del teléfono (quedan solo en el dispositivo), recuerda la página, marcadores, tamaño de letra. Biblioteca administrada (`books`, licencia obligatoria). E2E: PDF página 1→2 y TXT |
| IA | Asistente bíblico | No existe | Inexistente | **Descartado** por decisión del propietario | — | Se retiró la pantalla, el servicio y el endpoint del Worker |
| Familia | Espacios, perfiles infantiles, actividades por edad | No existe | Inexistente | **Implementar** | Consentimiento del tutor según el país | `/familia`: código de invitación, tutores y miembros, perfiles infantiles con nombre/edad/avatar (sin foto, fecha ni contacto), 12 actividades bíblicas por edad con progreso. E2E correcto |
| Parejas | Vinculación, estudio compartido, Biblia sincronizada | No existe | Inexistente | **Implementar** | — | `/pareja`: código de un solo uso (7 días), notas compartidas, «Leer juntos» y seguimiento opcional mientras se lee, llamada y videollamada con la WebRTC existente (el navegador pide permiso; nada se graba), desvincular. E2E correcto |
| Llamadas | Voz y video 1 a 1 | `store/call.ts` (WebRTC, `getUserMedia` con permiso) | Parcial (STUN público; sin TURN) | Reutilizar para Parejas | Servidor TURN para redes cerradas | — |
| Comunidad | Feed, grupos, mensajes, reportes | `Community.tsx`, `Groups.tsx`, `Messages.tsx` | Completa | Conservar | — | Reportar en el chat (entrega anterior) |
| Iglesias | 420 iglesias de OpenStreetMap con mapa | `src/content/churches.json`, `Churches.tsx` | Parcial (sin solicitudes de corrección) | Pendiente | — | — |
| Notificaciones | Versículo del día (APK local, web por Worker) | `native/index.ts`, `workers/push` | Completa | Conservar | — | — |
| Cuentas | Registro, login, recuperar, borrar cuenta, exportar datos | `authService`, `exportMyData` | Completa | Conservar | — | — |
| Roles | 15 roles + superadmin | `lib/permissions.ts`, reglas | Completa | Conservar | — | Reglas probadas |
| Admin | Panel global, moderación, comentarios, fundación | `GlobalAdmin.tsx` | Completa | **Ampliar** | — | Nueva sección Radios |
| Licencias | Registro de procedencia/licencias | Solo aviso por versión bíblica | Inexistente | **Implementar** | — | Admin → Licencias: estado, usos (texto, sin conexión, voz, IA…), evidencia obligatoria para «concedida», importación de versiones bíblicas como pendientes |
| Fallas | Reporte automático | `lib/auto-report.ts`, `ErrorBoundary.tsx` | Completa | Conservar | — | — |
| UI | Colores con opacidad en modo desarrollo local | Recorrido con `vite --mode emu` | Defectuosa (solo en desarrollo) | Documentar | — | En la versión compilada se ve correcto (verificado: `oklab(... / 0.15)`) |

## 4. Seguridad verificada (emulador de Firestore)

`npm run test:rules`: **153 bien, 0 mal** (56 pruebas nuevas en esta entrega). Confirman que:

- Nadie lee ni escribe el diario de otra persona, **ni el superadmin**.
- Nadie ve los versículos que otro memoriza ni dónde está leyendo.
- Las anotaciones con un tipo inventado se rechazan, igual que los textos de más de 10,000 caracteres.
- Solo la administración agrega radios y libros, y la URL debe ser https.
- Una pareja se forma solo con un código válido y una sola vez; nadie de fuera (ni la administración) ve la pareja ni sus notas.
- Una familia solo la ven sus miembros; quien entra con código entra como miembro (no tutor) y solo un tutor crea o edita perfiles infantiles, que no aceptan campos de contacto.
- El registro de licencias es solo de la administración y no acepta estados inventados.

El contenido del diario no se envía a analítica, logs, IA ni notificaciones.

## 5. Pruebas ejecutadas en esta entrega

| Prueba | Resultado |
|---|---|
| `tsc -b --noEmit` | Sin errores |
| `npm run build` | Correcto |
| `npm run test:rules` | 153 bien, 0 mal |
| `npm test` (memorizar, referencias) | ok |
| Recorrido E2E (Chromium + emuladores de Auth y Firestore) | Correcto: registro, Juan 3, lectura en voz alta visible, memorizar y repasar, continuar leyendo, diario de oración con «Dios respondió» y radio vacía. Sin errores de página |
| Recorrido E2E 2 (dos cuentas) | Correcto: código de pareja, vinculación, nota compartida, pasaje sincronizado, familia con perfil infantil y progreso, ingreso por código como miembro sin permisos de tutor, lector PDF (página 1→2) y TXT. Sin errores de página |
| Lectura en voz alta **sonando** en un teléfono | **No probada** (no hay dispositivo en este entorno) |
| Radio con una transmisión real | **No probada** (no hay emisoras verificadas; la red del entorno bloquea zeno.fm) |

## 6. Bloqueos externos y licencias pendientes

1. **RVR1960, NTV, LBLA, DHH y TLA:** se necesita el permiso escrito de las Sociedades Bíblicas Unidas, Tyndale y Lockman para distribuirlas, usarlas sin conexión, leerlas en voz alta y usarlas con IA.
2. **Radios:** antes de activar cada emisora hay que confirmar su fuente oficial, la URL de transmisión y el permiso de reproducción. Las condiciones de Zeno.fm no se pudieron leer desde este entorno.
4. **Libros de dominio público:** la red del entorno bloquea Project Gutenberg; la biblioteca queda vacía hasta que la administración agregue libros verificados (Admin → Biblioteca).
5. **Familia:** faltan las reglas de consentimiento del tutor y de protección de menores según el país.
6. **Llamadas en redes cerradas:** hace falta un servidor TURN, que puede tener costo.
7. **iOS nativo:** hace falta una cuenta Apple Developer (99 USD al año) y una Mac o un CI con macOS.

## 7. Estado de los bloques

| Bloque | Estado |
|---|---|
| 1. Podcasts, referencia bíblica, planes, fin de botones falsos | Completo |
| 2. HESERIA Parejas | Completo |
| 3. HESERIA Familia | Completo (falta revisión legal del consentimiento) |
| 4. Registro de licencias | Completo |
| 5. Asistente IA | Descartado por decisión del propietario |
| 6. Lector EPUB/PDF/TXT | Completo; biblioteca vacía hasta cargar libros verificados |

Siguientes pasos sugeridos: diccionario y concordancia con fuentes con licencia, series de devocionales con recordatorios, solicitudes de corrección de iglesias, servidor TURN para llamadas.

## 8. Ronda de mejoras (pedidas por el propietario)

| Pedido | Qué se hizo | Verificación |
|---|---|---|
| Menús repetidos | Biblioteca ya no repite sus pestañas; el encabezado marca solo la pestaña activa (antes las marcaba todas); Explorar sin la cuadrícula que duplicaba el menú | E2E: una sola pestaña activa |
| Quitar Música | Fuera rutas `/music` y `/artist`, menús, accesos rápidos, Explorar, Biblioteca, perfil y buscador. Se conservan los instrumentales para leer | E2E: `/music` no existe |
| Videollamada en pareja | Sin recorte (no se fuerza 16:9 y se usa el zoom más abierto si la cámara lo permite), video completo con opción de llenar, «Leer juntos» dentro de la llamada con el capítulo sincronizado y notas compartidas. Se quitó el botón «Altavoz» que no hacía nada | Compila; la llamada real necesita dos teléfonos |
| Podcasts | Cola con toda la lista: anterior/siguiente pasan de episodio (sin dar la vuelta), lista de episodios para saltar, nota con el minuto que queda en Mi diario, controles en la pantalla de bloqueo | Compila |
| Voz natural | Se elige la voz más natural del teléfono (neuronales/Google en red/«Enhanced») y se puede cambiar y probar en Configuración → Lectura en voz alta; en Android, botón para instalar las voces de Google | `tests/voices.test.mjs` |
| Búsqueda de libros | «Apocalipsis», «apoc», «genesis» muestran el libro sin elegir testamento; Enter abre sus capítulos | E2E |
| Varios versículos | Selección múltiple (Juan 3:16-17), barra compacta abajo que no tapa la lectura: resaltar, guardar, nota, compartir, copiar, escuchar, memorizar | E2E |
| Iglesias cercanas | Además del directorio, búsqueda en vivo en OpenStreetMap alrededor de la ubicación (hasta 300 resultados); ficha con teléfono, correo y sitio como enlaces y «Ver en Google Maps» (horarios, fotos y reseñas). Sin datos inventados | Compila; Overpass desde el navegador del usuario |
| Radios | Directorio abierto Radio Browser (verifica las transmisiones a diario): Radio Viva 95.3, Peniel, Santa Sion, TGN, Ministerios Revelación y emisoras cristianas de habla hispana; búsqueda por nombre en todo el directorio. Se excluyen católicas y transmisiones sin https | E2E: aparece Radio Viva |
| Sermones libres | 185 predicaciones en español de archive.org de una lista cerrada de predicadores que publican con licencia Creative Commons o dominio público; cada una con autor, licencia y enlace a la fuente | `scripts/sermones-libres.mjs --probar` |
| Corazones y conteos | Corazón rojo en todo lo que se marca; «Estoy orando» con conteo y estado real (se puede quitar); versículo del día con «Amén» y conteo de compartidos | `test:rules` 157 bien |
| Recordatorio de lectura | El botón de la campana abre Configuración → Recordatorios; en la app se elige la hora | E2E |

**No resuelto:** Radio Ilumina no está en el directorio abierto y no se encontró su transmisión oficial; se puede agregar en Administración → Radios cuando se tenga la URL de la emisora.
