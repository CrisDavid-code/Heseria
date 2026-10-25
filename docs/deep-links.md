# Enlaces profundos

Un enlace debe abrir la pantalla exacta dentro de la app, venga de una notificación, de
un mensaje compartido o del navegador.

---

## 1. Cómo funciona hoy

[`src/native/index.ts`](../src/native/index.ts) expone dos piezas:

```ts
onDeepLink((path) => navigate(path));   // escucha, montado en AppShell
parseDeepLink(url);                     // normaliza a una ruta interna
shareUrl("/bible/juan/3");              // construye el enlace para compartir
```

`parseDeepLink` acepta las dos formas y devuelve la ruta del router:

```
heseria://bible/juan/3            →  /bible/juan/3
https://heseria.app/bible/juan/3  →  /bible/juan/3
```

`AppShell` ya escucha y navega. En el navegador no hay eventos de deep link, así que la
función devuelve un limpiador vacío.

---

## 2. Esquema

```
heseria://home
heseria://bible/juan/3
heseria://devotionals/d1
heseria://plans/pn1
heseria://prayer
heseria://music/artists/ar1
heseria://music/albums/al2
heseria://music/playlists/pl1
heseria://podcasts/pd1
heseria://sermons/sm1
heseria://videos/v3
heseria://movies/mv2
heseria://series/se1
heseria://courses/co1
heseria://churches/c1
heseria://groups/g1
heseria://events/e1
heseria://ministries/m3
heseria://profile/u4
heseria://foundation/cases/fc1
heseria://content/ct-1730000000000
```

Toda ruta del router es un destino válido; ver [`routes.md`](routes.md).

---

## 3. Lo que falta configurar

### 3.1 Esquema personalizado (`heseria://`)

**Android** — en `android/app/src/main/AndroidManifest.xml`, dentro de la actividad
principal:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="heseria" />
</intent-filter>
```

**iOS** — en Xcode, *Info → URL Types*, con identificador `app.heseria.mobile` y esquema
`heseria`.

### 3.2 Enlaces universales (`https://heseria.app/...`)

Es lo que hace que un enlace compartido por WhatsApp abra la app en vez del navegador.
Requiere alojar dos archivos en el dominio, y eso es trabajo de backend.

**Android — App Links.** Servir en
`https://heseria.app/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.heseria.mobile",
    "sha256_cert_fingerprints": ["<huella SHA-256 del certificado de firma>"]
  }
}]
```

Y añadir al `intent-filter` `android:autoVerify="true"` con
`<data android:scheme="https" android:host="heseria.app" />`.

**iOS — Universal Links.** Servir en
`https://heseria.app/.well-known/apple-app-site-association` (sin extensión, con
`Content-Type: application/json`):

```json
{
  "applinks": {
    "details": [{
      "appIDs": ["<TEAM_ID>.app.heseria.mobile"],
      "components": [{ "/": "/*" }]
    }]
  }
}
```

Y activar la capacidad *Associated Domains* con `applinks:heseria.app`.

---

## 4. Enlaces desde notificaciones

El payload de push lleva `href`, que es una ruta interna. Al tocar la notificación:

```ts
PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
  const href = notification.data?.href;
  if (href) navigate(href);
});
```

Ese listener todavía hay que conectarlo cuando exista el backend de push. Ver
[`push-notifications.md`](push-notifications.md).

---

## 5. Compartir

`share()` usa la hoja nativa del sistema, la Web Share API o el portapapeles, en ese
orden. Las URL se construyen siempre con `shareUrl(path)` para que apunten al dominio
público y, una vez configurados los enlaces universales, abran la app directamente.

Ya se comparte desde: versículos, devocionales, sermones, videos, películas, series,
artistas, álbumes, playlists, publicaciones, perfiles, eventos, casos de la fundación y
contenido añadido.

---

## 6. Página de respaldo

Cuando alguien sin la app instalada abra un enlace, el dominio debe mostrar una página
con el contenido y botones a ambas tiendas. Sin eso, los enlaces compartidos se pierden
justo con quienes aún no son usuarios.
