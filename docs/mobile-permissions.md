# Permisos móviles

Principio: **no pedir nada hasta que el usuario haga algo que lo necesite.** Un permiso
solicitado al arrancar se deniega mucho más a menudo que uno pedido en contexto.

---

## 1. Estado actual

La app **no pide ningún permiso al iniciar**. Cada capacidad pide el suyo en el momento
en que se usa, y todas degradan con elegancia si se deniega:

| Permiso | Se pide al… | Si se deniega |
| --- | --- | --- |
| Notificaciones | tocar «Activar notificaciones push» en `/notifications` o en Configuración | La app funciona; solo no llegan avisos |
| Ubicación | abrir iglesias, eventos o voluntariado cercanos | Se usa Santiago como ubicación por defecto |
| Cámara | tocar «Cámara» en el compositor o en el chat | Queda la galería |
| Galería / fotos | adjuntar una imagen o subir contenido | Queda la cámara |
| Micrófono | grabar una nota de voz *(aún no implementado)* | — |

---

## 2. Android

Declarar en `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Notificaciones: obligatorio desde Android 13 (API 33) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Ubicación aproximada basta para «iglesias cerca de ti» -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- Cámara y multimedia -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<!-- Medios: Android 13+ usa permisos granulares -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
<uses-permission
  android:name="android.permission.READ_EXTERNAL_STORAGE"
  android:maxSdkVersion="32" />
```

Notas:

- `POST_NOTIFICATIONS` es de tiempo de ejecución desde Android 13. `registerPush()` ya
  lo solicita.
- Pide `ACCESS_COARSE_LOCATION` antes que la precisa: para mostrar iglesias cercanas
  sobra, y la gente la concede mucho más.
- Si al final no se implementa grabación de voz, **quita `RECORD_AUDIO`**. Los permisos
  declarados y no usados perjudican en la revisión de Play.

---

## 3. iOS

Añadir en `ios/App/App/Info.plist`. **El texto es visible para el usuario**, así que debe
explicar el beneficio, no el mecanismo:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Usamos tu ubicación para mostrarte iglesias, eventos y voluntariado cerca de ti.</string>

<key>NSCameraUsageDescription</key>
<string>Para que puedas tomar fotos y compartirlas con tu comunidad.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Para adjuntar fotos y videos a tus publicaciones y mensajes.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Para guardar en tu galería el contenido que descargues.</string>

<key>NSMicrophoneUsageDescription</key>
<string>Para grabar notas de voz en tus conversaciones.</string>
```

Capacidades a activar en Xcode:

- **Push Notifications**
- **Background Modes** → *Remote notifications* (y *Audio* si se implementa
  reproducción en segundo plano)
- **Associated Domains** → `applinks:heseria.app` (ver [`deep-links.md`](deep-links.md))

Apple rechaza binarios sin cadena de uso para un permiso declarado. Revísalo antes de
enviar.

---

## 4. Manejo de la denegación

Cada llamada de `src/native/index.ts` va envuelta en `try/catch` y devuelve una
alternativa segura. Ninguna pantalla se rompe si el usuario dice que no.

Cuando alguien deniega definitivamente, no insistas con un diálogo del sistema: no
volverá a aparecer. Lo correcto es un mensaje en la interfaz que explique qué se pierde
y ofrezca abrir los ajustes del sistema.

---

## 5. Privacidad en la ficha de la tienda

Ambas tiendas exigen declarar qué datos se recogen. Con lo que hay hoy:

| Dato | Uso | Vinculado a identidad |
| --- | --- | --- |
| Correo y nombre | Cuenta | Sí |
| Ubicación aproximada | Contenido cercano | No, si no se persiste |
| Fotos y videos | Contenido creado por el usuario | Sí |
| Identificadores de dispositivo | Notificaciones push | Sí |
| Datos de uso | Métricas de audiencia | Sí |

La sección de métricas (`/admin/audience`) registra qué usuario vio qué contenido. Eso
es **dato personal**: hay que declararlo, permitir su exportación y su borrado, y
mencionarlo en la política de privacidad. Ver el apartado de privacidad en
[`backend-integration.md`](backend-integration.md).
