import { Link } from "react-router-dom";
import { GenerativeCover } from "@/components/media/covers";
import { Badge } from "@/components/ui/primitives";
import { PROVIDER_LABEL } from "@/lib/media-source";
import { useContent, type MediaKind } from "@/store/content";
import { formatLength } from "@/lib/utils";

/**
 * Muestra el contenido que la propia comunidad añadió (por archivo o enlace)
 * junto al catálogo sembrado, para que lo publicado sea inmediatamente
 * visible y reproducible desde su sección correspondiente.
 */
export function AddedContentSection({
  kind,
  title = "Añadido recientemente",
  aspect = "aspect-video",
}: {
  kind: MediaKind | MediaKind[];
  title?: string;
  aspect?: string;
}) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const { items: all } = useContent();
  const items = all.filter((i) => kinds.includes(i.kind) && i.status === "publicado");

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-section font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Publicado desde la aplicación</p>
        </div>
      </div>
      <div className="rail">
        {items.map((i) => (
          <Link key={i.id} to={`/content/${i.id}`} className="group min-w-0">
            <div className="relative">
              <GenerativeCover
                seed={i.id}
                gradient={i.color}
                className={`${aspect} w-full transition-transform group-active:scale-[0.98]`}
                label={i.title}
              />
              <Badge
                variant="primary"
                className="absolute left-2 top-2 border border-white/20 bg-black/55 text-white"
              >
                {PROVIDER_LABEL[i.source.provider] ?? "Enlace"}
              </Badge>
            </div>
            <p className="mt-2 truncate text-sm font-medium">{i.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {i.subtitle}
              {i.durationSec > 0 && ` · ${formatLength(i.durationSec)}`}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
