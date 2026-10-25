/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección del servidor de la API compilada en el paquete. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
