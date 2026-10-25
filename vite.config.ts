import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import legacy from "@vitejs/plugin-legacy";
import path from "node:path";

/** precache.json: todos los archivos del build, para que el service worker abra la web sin red. */
const precacheList = (): Plugin => ({
  name: "precache-list",
  apply: "build",
  generateBundle(_, bundle) {
    this.emitFile({
      type: "asset",
      fileName: "precache.json",
      source: JSON.stringify(Object.keys(bundle).filter((f) => !f.endsWith(".map"))),
    });
  },
});

// Navegadores mínimos: Chrome 67 (Android 8 con WebView actualizado) y Safari 14 (iOS 14+).
// Firestore usa BigInt, que no existe antes; en navegadores más viejos index.html pide actualizar.
const TARGETS = ["chrome >= 67", "edge >= 79", "firefox >= 68", "safari >= 14", "ios_saf >= 14", "samsung >= 9"];

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Solo polyfills (Array.at, Object.hasOwn…); sin bundle legacy: Firestore no corre sin BigInt.
    legacy({ modernTargets: TARGETS, modernPolyfills: true, renderLegacyChunks: false }),
    precacheList(),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 5173, host: true },
  // El SDK de Firestore pesa ~600 kB; en la app móvil se carga desde el dispositivo.
  build: { chunkSizeWarningLimit: 1400 },
});
