/**
 * HESERIA — Utilidades de red que no son Firebase.
 *
 * Con Firebase ya no hay un servidor propio al que apuntar ni tokens que
 * guardar: Firebase Auth se ocupa de la sesión. Aquí solo queda lo que la app
 * baja de internet por su cuenta, como el MP3 de un episodio de podcast.
 */
import { Capacitor } from "@capacitor/core";

/** Las imágenes y audios ya vienen como URL completa o `data:`. */
export function mediaUrl(path: string | undefined | null): string {
  return path ?? "";
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * Guarda en el teléfono un archivo de internet (un episodio de podcast).
 *
 * En el APK lo baja el sistema directo a Documentos: no pasa por CORS ni carga
 * el archivo entero en memoria. En el navegador se abre el enlace y lo baja él.
 * ponytail: `Filesystem.downloadFile` está marcado como obsoleto desde la 7.1;
 * cuando lo retiren, cambiar a @capacitor/file-transfer.
 */
export async function downloadToDevice(
  url: string,
  fileName: string,
  onProgress?: (percent: number) => void,
): Promise<{ where: "device" | "browser"; detail: string }> {
  const safe = fileName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "archivo";

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const handle = onProgress
      ? await Filesystem.addListener("progress", (p) => {
          if (p.contentLength > 0) onProgress(Math.round((p.bytes / p.contentLength) * 100));
        })
      : null;
    try {
      await Filesystem.downloadFile({
        url,
        path: `Heseria/${safe}`,
        directory: Directory.Documents,
        recursive: true,
        progress: Boolean(onProgress),
      });
    } finally {
      await handle?.remove();
    }
    return { where: "device", detail: `Documentos/Heseria/${safe}` };
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = safe;
  link.target = "_blank";
  link.rel = "noopener";
  link.click();
  return { where: "browser", detail: safe };
}
