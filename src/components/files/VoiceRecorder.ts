/**
 * HESERIA — Nota de voz.
 *
 * Usa `MediaRecorder`, que existe tanto en el navegador como en el WebView de
 * Android y de iOS, así que no hace falta un plugin nativo: el permiso de
 * micrófono lo pide el propio navegador la primera vez.
 *
 * Se elige el formato que el aparato sepa grabar, no uno fijo: Chrome graba
 * WebM/Opus y Safari graba MP4/AAC, y forzar uno solo deja fuera a media
 * plataforma.
 */

/** Formatos por orden de preferencia: tamaño pequeño y compatibilidad amplia. */
const FORMATS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

function pickFormat(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return FORMATS.find((f) => MediaRecorder.isTypeSupported(f));
}

export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export interface Recording {
  blob: Blob;
  /** Duración en segundos, redondeada. */
  seconds: number;
  /** Nombre sugerido, con la extensión que corresponda al formato. */
  fileName: string;
}

export interface ActiveRecording {
  /** Corta la grabación y devuelve el audio. */
  stop(): Promise<Recording>;
  /** Corta y tira lo grabado: la persona se arrepintió. */
  cancel(): void;
}

/**
 * Empieza a grabar. Lanza si no hay permiso de micrófono o si el aparato no
 * sabe grabar audio; quien llama decide qué decirle a la persona.
 */
export async function startRecording(): Promise<ActiveRecording> {
  if (!canRecord()) {
    throw new Error("Este dispositivo no permite grabar audio desde la app.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickFormat();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  /** Soltar el micrófono apaga el indicador del sistema: importa que se vea. */
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  return {
    stop() {
      return new Promise<Recording>((resolve, reject) => {
        recorder.onstop = () => {
          release();
          const type = recorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunks, { type });
          if (blob.size === 0) {
            reject(new Error("No se grabó nada. Mantén pulsado mientras hablas."));
            return;
          }
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          resolve({
            blob,
            seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
            fileName: `nota-de-voz-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`,
          });
        };
        recorder.stop();
      });
    },
    cancel() {
      recorder.onstop = () => release();
      if (recorder.state !== "inactive") recorder.stop();
      else release();
    },
  };
}
