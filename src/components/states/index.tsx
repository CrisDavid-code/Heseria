import { AlertTriangle, CloudOff, Inbox, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ empty */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && actionHref && (
        <Button asChild className="mt-5" size="sm">
          <Link to={actionHref}>{actionLabel}</Link>
        </Button>
      )}
      {actionLabel && !actionHref && onAction && (
        <Button className="mt-5" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ error */

export function ErrorState({
  title = "No pudimos cargar este contenido",
  description = "Revisa tu conexión e inténtalo otra vez. Si el problema sigue, vuelve en unos minutos.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-destructive/12 text-destructive">
        <AlertTriangle className="size-5" />
      </span>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          Intentar nuevamente
        </Button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- offline */

export function OfflineState({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/8 px-4 py-3 text-sm",
        className,
      )}
    >
      <CloudOff className="size-4 shrink-0 text-warning" />
      <p className="text-muted-foreground">
        Estás sin conexión. Mostramos el contenido que descargaste; los cambios se sincronizarán al
        volver.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- loading */

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      {label}
    </div>
  );
}

/* -------------------------------------------------------------- skeletons */

export function RailSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="rail" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 8, aspect = "aspect-square" }: { count?: number; aspect?: string }) {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className={cn("w-full rounded-xl", aspect)} />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Skeleton className="h-52 w-full rounded-2xl sm:h-72" />
      <div className="space-y-3">
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}

/**
 * Renders the right state for an async slice: loading, error, empty, or content.
 * Keeps every page consistent without repeating the same four branches.
 */
export function AsyncBoundary<T>({
  loading,
  error,
  data,
  reload,
  skeleton,
  empty,
  children,
}: {
  loading: boolean;
  error?: Error;
  data: T | undefined;
  reload?: () => void;
  skeleton?: React.ReactNode;
  empty?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (loading) return <>{skeleton ?? <LoadingState />}</>;
  if (error) return <ErrorState onRetry={reload} description={error.message} />;
  if (data === undefined || (Array.isArray(data) && data.length === 0)) {
    return <>{empty ?? <EmptyState title="Todavía no hay nada aquí" description="Vuelve pronto: estamos sumando contenido nuevo cada semana." />}</>;
  }
  return <>{children(data)}</>;
}
