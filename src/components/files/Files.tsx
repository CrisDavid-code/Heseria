/**
 * HESERIA — Archivos: verlos, bajarlos y subirlos.
 *
 * Una descarga no es un enlace: el archivo vive en trozos dentro de Firestore
 * y las reglas solo los entregan a quien puede verlo (material de un curso a
 * quien lo cursa), así que se reúne aquí y después se guarda. En el teléfono eso significa escribirlo en Documentos y ofrecer la
 * hoja del sistema; en el navegador, un enlace de descarga de toda la vida.
 * `saveFile` se encarga de esa diferencia.
 */
import {
  Download,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Paperclip,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/states";
import { useAsync } from "@/hooks/useAsync";
import { isNative, saveFile } from "@/native";
import { fileService, type FileScope, type StoredFile } from "@/services";
import { useSession } from "@/store";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------- util */

/** El tamaño en algo que se lea: 2,4 MB antes que 2516582 bytes. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Un icono que diga de un vistazo qué clase de archivo es. */
export function iconFor(mime: string): LucideIcon {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv") {
    return FileSpreadsheet;
  }
  if (mime.includes("zip") || mime.includes("epub")) return FileArchive;
  return FileText;
}

/** Lo que se puede abrir dentro de la app sin bajarlo. */
function isViewable(mime: string): boolean {
  return (
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/") ||
    mime === "application/pdf"
  );
}

/* ------------------------------------------------------------ descarga */

/**
 * Baja el archivo y lo guarda. Devuelve `true` si acabó en el teléfono o en la
 * carpeta de descargas.
 */
export async function downloadStoredFile(
  file: StoredFile,
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  const blob = await fileService.blob(file.id, onProgress);
  const result = await saveFile(blob, file.name);

  if (result.where === "failed") {
    toast.error("No pudimos guardar el archivo.");
    return false;
  }
  toast.success(
    result.where === "device"
      ? `Guardado en Documentos como ${result.detail}`
      : `Descargado: ${result.detail}`,
  );
  return true;
}

/**
 * Abre el archivo para verlo, sin guardarlo.
 *
 * No se puede poner la URL en un `<a href>`: esa petición saldría sin la
 * cabecera de sesión y el servidor la rechazaría. Se trae el contenido y se
 * abre desde la memoria del navegador; en el teléfono se guarda y se deja que
 * lo abra la app que corresponda.
 */
export async function openStoredFile(file: StoredFile): Promise<void> {
  const blob = await fileService.blob(file.id);

  if (isNative()) {
    await saveFile(blob, file.name, { share: true });
    return;
  }

  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  // Se libera después de que el visor lo haya leído.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ------------------------------------------------------------ una ficha */

export function FileRow({
  file,
  onRemove,
  className,
}: {
  file: StoredFile;
  /** Si se pasa, aparece el botón de borrar (solo para quien lo subió). */
  onRemove?: (file: StoredFile) => void;
  className?: string;
}) {
  const Icon = iconFor(file.mime);
  const [percent, setPercent] = useState<number | null>(null);
  const { user } = useSession();
  const mine = user != null && file.ownerId === user.id;

  async function download() {
    setPercent(0);
    try {
      await downloadStoredFile(file, setPercent);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos bajar el archivo.");
    } finally {
      setPercent(null);
    }
  }

  return (
    <div
      className={cn("flex items-center gap-3 rounded-xl border border-border p-3", className)}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
        <Icon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatBytes(file.size)}
          {percent != null && percent > 0 ? ` · ${percent} %` : ""}
        </span>
      </span>

      {isViewable(file.mime) && (
        <button
          type="button"
          onClick={() => {
            void openStoredFile(file).catch((err: Error) => toast.error(err.message));
          }}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Ver
        </button>
      )}

      <button
        type="button"
        onClick={() => void download()}
        disabled={percent != null}
        aria-label={`Descargar ${file.title}`}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        {percent != null ? (
          <span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        ) : (
          <Download className="size-4" />
        )}
      </button>

      {onRemove && mine && (
        <button
          type="button"
          onClick={() => onRemove(file)}
          aria-label={`Eliminar ${file.title}`}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- subida */

export function FileUploadButton({
  scope,
  scopeId,
  visibility = "public",
  accept,
  label = "Subir archivo",
  onUploaded,
  variant = "outline",
  full,
  courseId,
}: {
  scope: FileScope;
  scopeId: string;
  /** Curso al que pertenece (para lo que solo ven los matriculados). */
  courseId?: string;
  visibility?: StoredFile["visibility"];
  accept?: string;
  label?: string;
  onUploaded?: (file: StoredFile) => void;
  variant?: "outline" | "primary" | "secondary";
  full?: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [percent, setPercent] = useState<number | null>(null);

  async function send(file: File) {
    setPercent(0);
    try {
      const stored = await fileService.upload(file, {
        scope,
        scopeId,
        title: file.name,
        visibility,
        courseId,
        onProgress: setPercent,
      });
      toast.success(`${stored.title} quedó publicado`);
      onUploaded?.(stored);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setPercent(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void send(file);
        }}
      />
      <Button
        variant={variant}
        full={full}
        loading={percent != null}
        onClick={() => input.current?.click()}
      >
        <Paperclip className="size-4" />
        {percent != null && percent > 0 ? `Subiendo… ${percent} %` : label}
      </Button>
    </>
  );
}

/* --------------------------------------------------------------- lista */

/**
 * Los archivos publicados en un curso, un grupo o una iglesia, con su botón de
 * subir cuando la persona puede publicar ahí.
 */
export function FileLibrary({
  scope,
  scopeId,
  title,
  emptyText = "Todavía no hay archivos aquí.",
  canUpload = false,
  visibility = "public",
  uploadLabel,
  accept,
  className,
  courseId,
}: {
  scope: FileScope;
  scopeId: string;
  /** Curso al que pertenece el material de una lección. */
  courseId?: string;
  title?: string;
  emptyText?: string;
  canUpload?: boolean;
  visibility?: StoredFile["visibility"];
  uploadLabel?: string;
  accept?: string;
  className?: string;
}) {
  const files = useAsync(
    () => fileService.list(scope, scopeId, visibility, courseId),
    [scope, scopeId, visibility, courseId],
  );

  async function remove(file: StoredFile) {
    try {
      await fileService.remove(file.id);
      toast.success("Archivo eliminado");
      files.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  return (
    <section className={className}>
      {title && <h2 className="mb-2.5 text-section font-semibold">{title}</h2>}

      {files.loading ? (
        <ListSkeleton />
      ) : files.data && files.data.length > 0 ? (
        <div className="space-y-2">
          {files.data.map((f) => (
            <FileRow key={f.id} file={f} onRemove={remove} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {emptyText}
        </p>
      )}

      {canUpload && (
        <div className="mt-3">
          <FileUploadButton
            scope={scope}
            scopeId={scopeId}
            visibility={visibility}
            courseId={courseId}
            accept={accept}
            label={uploadLabel ?? "Subir archivo"}
            onUploaded={() => files.reload()}
            full
          />
        </div>
      )}
    </section>
  );
}
