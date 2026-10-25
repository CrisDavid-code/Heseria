import {
  AlertTriangle, Check, FileAudio, FileVideo, Link2, Upload, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MediaPreview } from "@/components/media/MediaPlayer";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Field, Input, Progress, Textarea } from "@/components/ui/primitives";
import { haptic } from "@/native";
import {
  isPlayable, parseMediaUrl, PROVIDER_LABEL, type MediaSource,
} from "@/lib/media-source";
import { contentService } from "@/services";
import { useSession } from "@/store";
import { MEDIA_KIND_LABEL, type MediaKind } from "@/store/content";
import { cn, formatDuration } from "@/lib/utils";

const KIND_OPTIONS: { value: MediaKind; label: string }[] = (
  ["song", "album", "video", "sermon", "podcast"] as MediaKind[]
).map((k) => ({ value: k, label: MEDIA_KIND_LABEL[k] }));

/** Segundo campo: cambia de significado según el tipo de contenido. */
const SUBTITLE_LABEL: Record<MediaKind, string> = {
  song: "Artista",
  album: "Artista",
  movie: "Dirección",
  series: "Género",
  video: "Autor o canal",
  sermon: "Predicador",
  podcast: "Conductor",
};

const CATEGORIES: Record<MediaKind, string[]> = {
  song: ["Adoración", "Worship pop", "Gospel", "Hip hop cristiano", "Acústico", "Coral"],
  album: ["Adoración", "Worship pop", "Gospel", "Acústico", "Coral"],
  movie: ["Drama", "Familiar", "Documental", "Aventura"],
  series: ["Documental", "Formación", "Drama", "Comedia dramática"],
  video: ["Enseñanza", "Testimonios", "Predicaciones", "Música", "Entrevistas", "Jóvenes", "Niños", "Ministerios", "Creadores"],
  sermon: ["Fe", "Familia", "Esperanza", "Servicio", "Identidad", "Oración"],
  podcast: ["Devocional", "Liderazgo", "Familia", "Jóvenes", "Misiones", "Teología"],
};

const AUDIO_KINDS: MediaKind[] = ["song", "album", "podcast"];

type Phase = "form" | "subiendo" | "listo" | "error";

export function MediaIngestSheet({
  open,
  onOpenChange,
  defaultKind = "video",
  lockKind = false,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultKind?: MediaKind;
  lockKind?: boolean;
  onCreated?: () => void;
}) {
  const { user } = useSession();
  const fileInput = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"link" | "file">("link");
  const [kind, setKind] = useState<MediaKind>(defaultKind);
  const [link, setLink] = useState("");
  const [source, setSource] = useState<MediaSource | null>(null);
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [minutes, setMinutes] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<{ source?: string; title?: string; category?: string }>({});

  useEffect(() => {
    setKind(defaultKind);
  }, [defaultKind]);

  // Detecta el proveedor mientras se escribe el enlace.
  useEffect(() => {
    if (tab !== "link") return;
    if (!link.trim()) {
      setSource(null);
      return;
    }
    const id = window.setTimeout(() => setSource(parseMediaUrl(link)), 300);
    return () => window.clearTimeout(id);
  }, [link, tab]);

  const audioExpected = AUDIO_KINDS.includes(kind);

  const providerWarning = useMemo(() => {
    if (!source) return null;
    if (source.provider === "unknown") {
      return "No reconocimos el enlace. Aceptamos YouTube, Spotify, Vimeo y enlaces directos a .mp4, .webm, .mp3, .m4a o .m3u8.";
    }
    // Con Spotify y YouTube no alojamos nada: hay que decir qué implica.
    if (source.provider === "spotify") {
      return "Se incrustará el reproductor de Spotify. La canción completa solo suena para quien tenga Premium y sesión iniciada; el resto escucha 30 segundos. No se podrá descargar para escuchar sin conexión.";
    }
    if (source.provider === "youtube" || source.provider === "vimeo") {
      return "Se incrustará su reproductor oficial. Si la persona dueña del video tiene desactivada la incrustación, no se verá dentro de la app, y no se podrá descargar.";
    }
    if (audioExpected && source.provider !== "direct-audio") {
      return "Para música y podcasts se espera un enlace de audio directo (.mp3, .m4a). Se guardará igualmente, pero el reproductor global no podrá tomarlo.";
    }
    if (source.provider === "hls") {
      return "HLS se reproduce de forma nativa en iOS y Safari. En Android hará falta hls.js, que llegará con el streaming real.";
    }
    return null;
  }, [source, audioExpected]);

  function reset() {
    setTab("link");
    setLink("");
    setSource(null);
    setChosenFile(null);
    setTitle("");
    setSubtitle("");
    setDescription("");
    setCategory("");
    setMinutes("");
    setPhase("form");
    setProgress(0);
    setErrors({});
    setChosenFile(null);
  }

  function pickFile() {
    fileInput.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // La URL local solo sirve para la vista previa; al publicar se sube el
    // archivo al servidor y la ficha apunta a la URL definitiva.
    const url = URL.createObjectURL(file);
    setChosenFile(file);
    setSource({
      kind: "file",
      url,
      provider: file.type.startsWith("audio") ? "direct-audio" : "direct-video",
      fileName: file.name,
      sizeMb: Number((file.size / 1024 / 1024).toFixed(1)),
    });
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    haptic("light");
  }

  function validate() {
    const found: typeof errors = {};
    if (!source) found.source = "Añade un enlace o selecciona un archivo.";
    else if (!isPlayable(source)) found.source = "Esta fuente no se puede reproducir todavía.";
    if (title.trim().length < 2) found.title = "Escribe un título.";
    if (!category) found.category = "Elige una categoría.";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit() {
    if (!validate() || !source) return;
    setPhase("subiendo");
    setProgress(0);
    try {
      await contentService.create(
        {
          file: chosenFile ?? undefined,
          kind,
          title: title.trim(),
          subtitle: subtitle.trim() || SUBTITLE_LABEL[kind],
          description: description.trim(),
          category,
          durationSec: Math.max(0, Number(minutes) || 0) * 60,
          source,
          ownerId: user.id,
        },
        setProgress,
      );
      setPhase("listo");
      haptic("success");
      onCreated?.();
    } catch (err) {
      setPhase("error");
      toast.error(err instanceof Error ? err.message : "No pudimos publicar el contenido.");
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <BottomSheetContent
        title="Añadir contenido"
        description="Sube un archivo o pega un enlace para publicarlo en Heseria."
        fullScreen
      >
        <div className="mx-auto max-w-md pb-4">
          {phase === "listo" ? (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-success/15 text-success">
                <Check className="size-8" strokeWidth={2.5} />
              </span>
              <h2 className="mt-5 font-display text-lg font-semibold">Contenido publicado</h2>
              <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
                “{title}” ya está disponible en {MEDIA_KIND_LABEL[kind].toLowerCase()}s.
              </p>
              <div className="mt-6 flex w-full gap-2.5">
                <Button variant="outline" className="flex-1" onClick={reset}>
                  Añadir otro
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    onOpenChange(false);
                    reset();
                  }}
                >
                  Listo
                </Button>
              </div>
            </div>
          ) : phase === "subiendo" ? (
            <div className="py-10 text-center">
              <p className="font-display text-lg font-semibold">
                {source?.kind === "file" ? "Subiendo archivo" : "Validando enlace"}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">{title}</p>
              <div className="mt-6">
                <Progress value={progress} label={`${progress} %`} />
                <p className="mt-2 text-xs tabular-nums text-muted-foreground">{progress} %</p>
              </div>
              <p className="mt-6 text-xs text-muted-foreground">
                Subida simulada. Con el backend conectado, el archivo irá al almacenamiento y se
                transcodificará.
              </p>
            </div>
          ) : (
            <>
              {/* Origen */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTab("link");
                    setSource(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-colors",
                    tab === "link"
                      ? "border-primary bg-primary/12 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  <Link2 className="size-4" /> Enlace
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("file");
                    setSource(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-colors",
                    tab === "file"
                      ? "border-primary bg-primary/12 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  <Upload className="size-4" /> Archivo
                </button>
              </div>

              {tab === "link" ? (
                <Field
                  label="Enlace del contenido"
                  htmlFor="ing-link"
                  required
                  error={errors.source}
                  hint="YouTube, Vimeo, o un enlace directo a .mp4, .webm, .mp3, .m4a o .m3u8."
                >
                  <Input
                    id="ing-link"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://…"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-invalid={Boolean(errors.source)}
                  />
                </Field>
              ) : (
                <div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="audio/*,video/*"
                    onChange={onFileChosen}
                    className="sr-only"
                    aria-label="Seleccionar archivo"
                  />
                  {source?.kind === "file" ? (
                    <div className="flex items-center gap-3 rounded-xl border border-border p-3.5">
                      {source.provider === "direct-audio" ? (
                        <FileAudio className="size-5 shrink-0 text-primary" />
                      ) : (
                        <FileVideo className="size-5 shrink-0 text-primary" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{source.fileName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {source.sizeMb} MB
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSource(null)}
                        aria-label="Quitar archivo"
                        className="tap-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={pickFile}
                      className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 transition-colors active:bg-secondary"
                    >
                      <Upload className="size-5 text-muted-foreground" />
                      <span className="text-sm font-medium">Seleccionar archivo</span>
                      <span className="text-xs text-muted-foreground">Audio o video del dispositivo</span>
                    </button>
                  )}
                  {errors.source && (
                    <p role="alert" className="mt-1.5 text-xs text-destructive">
                      {errors.source}
                    </p>
                  )}
                </div>
              )}

              {/* Vista previa */}
              {source && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="primary">{PROVIDER_LABEL[source.provider]}</Badge>
                    {isPlayable(source) && <Badge variant="success">Reproducible</Badge>}
                  </div>
                  <MediaPreview source={source} title={title || "Vista previa"} />
                  {providerWarning && (
                    <p className="mt-2 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/8 p-2.5 text-xs text-muted-foreground">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      {providerWarning}
                    </p>
                  )}
                </div>
              )}

              {/* Metadatos */}
              <div className="mt-5 space-y-4">
                {!lockKind && (
                  <Field label="Tipo de contenido">
                    <SimpleSelect
                      value={kind}
                      onValueChange={(v) => {
                        setKind(v as MediaKind);
                        setCategory("");
                      }}
                      options={KIND_OPTIONS}
                      ariaLabel="Tipo de contenido"
                    />
                  </Field>
                )}

                <Field label="Título" htmlFor="ing-title" required error={errors.title}>
                  <Input
                    id="ing-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Por ejemplo: Tu fidelidad"
                    aria-invalid={Boolean(errors.title)}
                  />
                </Field>

                <Field label={SUBTITLE_LABEL[kind]} htmlFor="ing-subtitle">
                  <Input
                    id="ing-subtitle"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder={SUBTITLE_LABEL[kind]}
                  />
                </Field>

                <Field label="Categoría" required error={errors.category}>
                  <SimpleSelect
                    value={category}
                    onValueChange={setCategory}
                    options={CATEGORIES[kind].map((c) => ({ value: c, label: c }))}
                    placeholder="Elige una categoría"
                    ariaLabel="Categoría"
                  />
                </Field>

                <Field
                  label="Duración (minutos)"
                  htmlFor="ing-duration"
                  hint={
                    minutes
                      ? `Se mostrará como ${formatDuration(Number(minutes) * 60)}`
                      : "Opcional. Se detectará automáticamente con el backend."
                  }
                >
                  <Input
                    id="ing-duration"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="0"
                  />
                </Field>

                <Field label="Descripción" htmlFor="ing-desc">
                  <Textarea
                    id="ing-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="¿De qué trata este contenido?"
                  />
                </Field>
              </div>

              <div className="mt-6 flex gap-2.5">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    onOpenChange(false);
                    reset();
                  }}
                >
                  Cancelar
                </Button>
                <Button className="flex-[2]" size="lg" onClick={submit}>
                  Publicar
                </Button>
              </div>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                Al publicar confirmas que tienes los derechos necesarios sobre este contenido.
              </p>
            </>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
