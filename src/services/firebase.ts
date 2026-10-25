/**
 * HESERIA — Conexión con Firebase.
 *
 * Firebase es el servidor: la cuenta (Auth) y los datos (Firestore). No hay un
 * equipo encendido en ninguna parte; el APK habla directo con Google, así que
 * funciona igual en Guatemala que en cualquier lado y sin depender de un PC.
 *
 * La configuración web de Firebase **es pública** —va dentro de cualquier app
 * que use Firebase—. Lo que protege los datos son las reglas de
 * `firestore.rules`, no ocultar esta configuración.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
export const usingEmulators =
  import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";

/** Id de la base de datos de Firestore (modo nativo). Ver .env.production. */
const DATABASE = (import.meta.env.VITE_FIREBASE_DATABASE as string | undefined) || "(default)";

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;

if (isFirebaseConfigured) {
  app = initializeApp(config);
  // initializeAuth sin `popupRedirectResolver`: `getAuth()` se queda colgado
  // dentro del WebView de iOS (lección de Chambas GT).
  authInstance = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
  // Caché local persistente: lo ya visto se abre sin conexión.
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  }, DATABASE);
  if (usingEmulators) {
    connectAuthEmulator(authInstance, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(dbInstance, "127.0.0.1", 8080);
  }
}

// La app no monta las rutas que los usan si falta la configuración (ver Boot).
export const auth = authInstance as Auth;
export const db = dbInstance as Firestore;
