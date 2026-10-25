/**
 * HESERIA — Foto de perfil y de portada.
 *
 * Antes de subir nada, la imagen se reduce y se recorta en el propio teléfono.
 * Así no se manda una foto de doce megapíxeles para mostrarla a 96 píxeles: es
 * más rápido, gasta menos datos y ocupa menos en el servidor.
 */
import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet, BottomSheetContent, SheetAction } from "@/components/ui/overlays";
import { authService } from "@/services";
import { haptic } from "@/native";
import { sessionStore } from "@/store";

/** Lado máximo de cada tipo de imagen, en píxeles. */
const MAX_SIDE = { avatar: 512, cover: 1280 };
const ASPECT = { avatar: 1, cover: 16 / 9 };

/**
 * Reduce y recorta la imagen al formato que toca, y la devuelve como JPEG.
 * Se hace con un canvas, sin librerías.
 */
async function prepare(file: File, kind: "avatar" | "cover"): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const aspect = ASPECT[kind];

  // Recorte centrado a la proporción deseada.
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (sw / sh > aspect) sw = sh * aspect;
  else sh = sw / aspect;
  const sx = (bitmap.width - sw) / 2;
  const sy = (bitmap.height - sh) / 2;

  const targetW = Math.min(MAX_SIDE[kind], Math.round(sw));
  const targetH = Math.round(targetW / aspect);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, targetW, targetH);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86),
  );
  if (!blob) return file;
  return new File([blob], `${kind}.jpg`, { type: "image/jpeg" });
}

export function PhotoPicker({
  kind,
  hasPhoto,
  children,
  className,
}: {
  kind: "avatar" | "cover";
  hasPhoto: boolean;
  /** Lo que se ve y se pulsa: el avatar o la portada actual. */
  children: React.ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const label = kind === "avatar" ? "foto de perfil" : "portada";

  async function onChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setOpen(false);
    try {
      const prepared = await prepare(file, kind);
      const { user } = await authService.uploadPhoto(kind, prepared);
      sessionStore.set({ user });
      haptic("success");
      toast.success(`Tu ${label} está lista.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `No se pudo subir la ${label}.`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setOpen(false);
    try {
      const { user } = await authService.removePhoto(kind);
      sessionStore.set({ user });
      toast.success(`Quitamos tu ${label}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo quitar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        aria-label={hasPhoto ? `Cambiar ${label}` : `Añadir ${label}`}
        className={className}
      >
        {children}
        <span
          className={
            kind === "avatar"
              ? "absolute bottom-0 right-0 grid size-7 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground"
              : "absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
          }
        >
          {busy ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Camera className={kind === "avatar" ? "size-3.5" : "size-4"} />
          )}
        </span>
      </button>

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={onChosen}
        aria-hidden
        tabIndex={-1}
      />

      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent
          title={kind === "avatar" ? "Foto de perfil" : "Portada"}
          description={
            kind === "avatar"
              ? "Se recorta en cuadrado y se reduce antes de subirla."
              : "Se recorta en formato apaisado y se reduce antes de subirla."
          }
        >
          <div className="space-y-0.5">
            <SheetAction
              icon={Camera}
              label={hasPhoto ? "Elegir otra imagen" : "Elegir una imagen"}
              onClick={() => input.current?.click()}
            />
            {hasPhoto && (
              <SheetAction
                icon={Trash2}
                label={`Quitar ${label}`}
                destructive
                onClick={() => void remove()}
              />
            )}
          </div>
          <Button variant="ghost" full className="mt-3" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}
