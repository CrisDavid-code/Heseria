import { StrictMode } from "react";
import { Capacitor } from "@capacitor/core";
import { listenForInstall } from "@/lib/install";
import { watchErrors } from "@/lib/auto-report";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { ErrorBoundary } from "@/layouts/ErrorBoundary";
import { hydrateStores } from "@/store";
import "@/styles.css";

// Tema y perfil en caché antes del primer pintado, para que no haya un
// destello del tema equivocado. La sesión la recupera Firebase enseguida,
// en BootGate.
hydrateStores();
listenForInstall();
watchErrors();

// Versión web instalable (PWA). Dentro del APK/iOS no hace falta: los archivos ya van en la app.
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}

const container = document.getElementById("root");
if (!container) throw new Error("No se encontró el elemento #root");

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
