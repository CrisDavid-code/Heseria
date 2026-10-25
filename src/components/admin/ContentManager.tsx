import { BarChart3, Eye, Plus, Trash2, Upload, XCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MediaIngestSheet } from "@/components/media/MediaIngest";
import { ContentMetricsSheet } from "@/pages/admin/Engagement";
import { Button } from "@/components/ui/button";
import { BottomSheet, BottomSheetContent, SheetAction } from "@/components/ui/overlays";
import { AdminList, type AdminRow } from "@/components/admin/AdminKit";
import { ListSkeleton } from "@/components/states";
import { PROVIDER_LABEL } from "@/lib/media-source";
import { contentService } from "@/services";
import { MEDIA_KIND_LABEL, useContent, type ContentItem, type MediaKind } from "@/store/content";
import { formatLength } from "@/lib/utils";

/**
 * Gestión del contenido añadido desde la app: subir, ver, publicar y eliminar.
 * Se reutiliza en los portales de artista, creador, iglesia y administración.
 */
export function ContentManager({
  kind,
  lockKind = false,
  emptyLabel = "Todavía no has añadido contenido. Sube un archivo o pega un enlace.",
  ctaLabel = "Añadir contenido",
}: {
  kind?: MediaKind;
  lockKind?: boolean;
  emptyLabel?: string;
  ctaLabel?: string;
}) {
  const navigate = useNavigate();
  const { items, loading, reload } = useContent(kind);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [active, setActive] = useState<ContentItem | null>(null);
  const [metricsFor, setMetricsFor] = useState<ContentItem | null>(null);

  const rows: AdminRow[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    subtitle: `${MEDIA_KIND_LABEL[i.kind]} · ${i.subtitle} · ${PROVIDER_LABEL[i.source.provider]}`,
    meta: i.durationSec ? formatLength(i.durationSec) : undefined,
    color: i.color,
    status:
      i.status === "publicado"
          ? { label: "Publicado", tone: "success" as const }
          : i.status === "procesando"
            ? { label: "Procesando", tone: "warning" as const }
            : i.status === "error"
              ? { label: "Error", tone: "danger" as const }
              : { label: "Borrador", tone: "default" as const },
  }));

  return (
    <div className="space-y-4">
      <Button full onClick={() => setIngestOpen(true)}>
        <Upload className="size-4" /> {ctaLabel}
      </Button>

      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <Plus className="mx-auto mb-3 size-5 text-muted-foreground" />
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">{emptyLabel}</p>
        </div>
      ) : (
        <AdminList
          rows={rows}
          filters={[
            { key: "pub", label: "Publicados", test: (r) => r.status?.label === "Publicado" },
            { key: "bor", label: "Borradores", test: (r) => r.status?.label === "Borrador" },
          ]}
          sorts={[{ key: "az", label: "Título (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) }]}
          onRowAction={(r) => setActive(items.find((i) => i.id === r.id) ?? null)}
        />
      )}

      <MediaIngestSheet
        open={ingestOpen}
        onOpenChange={setIngestOpen}
        defaultKind={kind ?? "video"}
        lockKind={lockKind}
        onCreated={() => {
          toast.success("Contenido publicado. Ya lo ve todo el mundo.");
          reload();
        }}
      />

      <BottomSheet open={active !== null} onOpenChange={(v) => !v && setActive(null)}>
        <BottomSheetContent
          title={active?.title ?? ""}
          description={active ? `${MEDIA_KIND_LABEL[active.kind]} · ${active.category}` : undefined}
        >
          {active && (
            <div className="space-y-0.5">
              <SheetAction
                icon={Eye}
                label="Ver contenido"
                onClick={() => {
                  navigate(`/content/${active.id}`);
                  setActive(null);
                }}
              />
              <SheetAction
                icon={BarChart3}
                label="Ver métricas"
                description="Quiénes lo vieron y quiénes no"
                onClick={() => {
                  setMetricsFor(active);
                  setActive(null);
                }}
              />
              {active.status === "publicado" ? (
                <SheetAction
                  icon={XCircle}
                  label="Despublicar"
                  description="Deja de mostrarse en el catálogo"
                  onClick={async () => {
                    await contentService.unpublish(active.id);
                    reload();
                    toast.success("Contenido despublicado");
                    setActive(null);
                  }}
                />
              ) : (
                <SheetAction
                  icon={CheckCircle2}
                  label="Publicar"
                  onClick={async () => {
                    await contentService.publish(active.id);
                    reload();
                    toast.success("Contenido publicado");
                    setActive(null);
                  }}
                />
              )}
              <SheetAction
                icon={Trash2}
                label="Eliminar"
                destructive
                onClick={async () => {
                  await contentService.remove(active.id);
                  toast.success("Contenido eliminado");
                  setActive(null);
                }}
              />
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>

      {metricsFor && (
        <ContentMetricsSheet
          contentId={metricsFor.id}
          title={metricsFor.title}
          open={metricsFor !== null}
          onOpenChange={(v) => !v && setMetricsFor(null)}
        />
      )}
    </div>
  );
}
