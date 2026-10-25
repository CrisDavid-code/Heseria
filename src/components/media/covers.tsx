import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { mediaUrl } from "@/services/api";
import { cn } from "@/lib/utils";
import { MotifArt, pickMotif, type MotifId } from "@/components/media/motifs";

/**
 * HESERIA — Portadas dibujadas.
 *
 * No se distribuye fotografía con licencia, así que cada portada se dibuja. Lo
 * que se dibuja **no es arbitrario**: el motivo se elige por el título y el tipo
 * de contenido, de modo que un sermón sobre el perdón lleva una cruz y un curso
 * lleva un libro abierto. Ver `motifs.tsx`.
 *
 * El mismo identificador da siempre la misma portada, en cualquier dispositivo.
 */

export interface GenerativeCoverProps {
  /** Identidad estable: la misma semilla da siempre la misma portada. */
  seed: string;
  /** Par de degradado de Tailwind, por ejemplo "from-cyan-500/70 to-blue-700/70". */
  gradient?: string;
  label?: string;
  icon?: LucideIcon;
  className?: string;
  rounded?: string;
  children?: ReactNode;
  /**
   * Título de lo que se ilustra. De aquí sale el motivo: si habla de perdón
   * saldrá una cruz; si habla de alabanza, notas musicales.
   */
  title?: string;
  /** Tipo de contenido, por si el título no dice nada: `song`, `course`… */
  kind?: string;
  /** Motivo concreto, cuando se quiere forzar uno. `"none"` deja el fondo liso. */
  motif?: MotifId | "none";
}

export function GenerativeCover({
  seed,
  gradient = "from-cyan-500/70 to-blue-700/70",
  label,
  icon: Icon,
  className,
  rounded = "rounded-xl",
  children,
  title,
  kind,
  motif,
}: GenerativeCoverProps) {
  // El texto que mejor describe la ficha: el título si viene, si no la etiqueta.
  const chosen = motif ?? pickMotif({ title: title ?? label, kind, seed });
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-gradient-to-br",
        gradient,
        rounded,
        className,
      )}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,rgba(255,255,255,0.22),transparent_60%)]" />
      {chosen !== "none" && <MotifArt motif={chosen} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
      {Icon && (
        <Icon className="absolute bottom-2.5 right-2.5 size-4 text-white/70" aria-hidden />
      )}
      {children}
    </div>
  );
}

/**
 * A cover with the title burned in. Used where the card has no separate caption
 * (hero tiles, playlist headers, movie posters).
 */
export function MediaCover({
  seed,
  gradient,
  title,
  subtitle,
  icon,
  className,
  rounded,
  kind,
  motif,
}: GenerativeCoverProps & { title: string; subtitle?: string }) {
  return (
    <GenerativeCover
      seed={seed}
      gradient={gradient}
      icon={icon}
      className={className}
      rounded={rounded}
      label={title}
      title={title}
      kind={kind}
      motif={motif}
    >
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="font-display text-sm font-semibold leading-tight text-white clamp-2 drop-shadow">
          {title}
        </p>
        {subtitle && <p className="mt-0.5 text-[0.7rem] text-white/75 clamp-2">{subtitle}</p>}
      </div>
    </GenerativeCover>
  );
}

/** Full-bleed banner for detail pages and the streaming hero. */
export function HeroMedia({
  seed,
  gradient,
  className,
  children,
  title,
  kind,
}: {
  seed: string;
  gradient?: string;
  className?: string;
  children?: ReactNode;
  title?: string;
  kind?: string;
}) {
  return (
    <GenerativeCover
      seed={seed}
      gradient={gradient}
      rounded="rounded-2xl"
      className={cn("min-h-52", className)}
      title={title}
      kind={kind}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-transparent" />
      {children}
    </GenerativeCover>
  );
}


/**
 * Avatar de una persona: su foto si la subió, y si no la portada generada a
 * partir de su identificador. Un mismo componente para toda la app, para que
 * cambiar la foto se note en todas partes.
 */
export function UserAvatar({
  user,
  className = "size-10",
  rounded = "rounded-full",
}: {
  user: { id: string; name: string; color: string; avatarUrl?: string };
  className?: string;
  rounded?: string;
}) {
  if (user.avatarUrl) {
    return (
      <img
        src={mediaUrl(user.avatarUrl)}
        alt={user.name}
        loading="lazy"
        className={cn("shrink-0 object-cover", rounded, className)}
      />
    );
  }
  return (
    <GenerativeCover
      seed={user.id}
      gradient={user.color}
      rounded={rounded}
      motif="none"
      className={cn("grid shrink-0 place-items-center", className)}
      label={user.name}
    >
      <span className="relative z-10 select-none font-display font-semibold leading-none text-white/90 [font-size:38%]">
        {initialsOf(user.name)}
      </span>
    </GenerativeCover>
  );
}

/** Las dos iniciales del nombre. "Ana María Coc" da "AC". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}
