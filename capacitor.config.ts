import type { CapacitorConfig } from "@capacitor/cli";

/**
 * HESERIA — Native shell configuration (Android + iOS).
 *
 * `npm run build` produces dist/, which Capacitor copies into the native
 * projects. See docs/mobile-architecture.md for the full build and release flow.
 */
const config: CapacitorConfig = {
  appId: "app.heseria.mobile",
  appName: "Heseria",
  webDir: "dist",

  /**
   * La aplicación se sirve desde `http://localhost` dentro del WebView.
   *
   * Chromium trata `localhost` como origen seguro aunque el esquema sea http,
   * así que cámara, ubicación y almacenamiento siguen disponibles. La ventaja
   * es que las llamadas a un servidor de la red local por HTTP no se bloquean
   * como «contenido mixto» durante las pruebas; en producción la API va por
   * HTTPS, que desde este origen tampoco tiene restricción.
   */
  server: {
    androidScheme: "http",
  },

  // Portrait-first (spec §37). Video playback opts into landscape at runtime.
  android: {
    allowMixedContent: false,
    backgroundColor: "#0F1117",
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0F1117",
    // Lets the web layer paint under the status bar so we control safe areas.
    scrollEnabled: true,
  },

  plugins: {
    /**
     * La pantalla de apertura la retira la propia app cuando termina de
     * arrancar (`hideSplash()` en AppShell), no un temporizador: así nunca se
     * ve un salto ni una espera de más.
     */
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0F1117",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
      useDialog: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0F1117",
      overlaysWebView: true,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
