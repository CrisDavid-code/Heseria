import { ArrowUpDown, ChevronRight, Filter, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { GenerativeCover } from "@/components/media/covers";
import { Button } from "@/components/ui/button";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Badge, Chip, Input, Stat } from "@/components/ui/primitives";
import { cn, timeAgo } from "@/lib/utils";
import type { Kpi } from "@/services";

/* ------------------------------------------------------------------- kpis */

export function KpiRow({ kpis }: { kpis: Kpi[] | undefined }) {
  if (!kpis) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {kpis.map((k) => (
        <Stat key={k.label} label={k.label} value={k.value} delta={k.delta} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- quick actions */

export function QuickActions({
  actions,
}: {
  actions: { label: string; href?: string; onClick?: () => void; icon: typeof Plus }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {actions.map((a) =>
        a.href ? (
          <Link
            key={a.label}
            to={a.href}
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-3.5 text-center transition-colors active:bg-secondary"
          >
            <a.icon className="size-4 text-primary" />
            <span className="text-[0.7rem] leading-tight">{a.label}</span>
          </Link>
        ) : (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-3.5 text-center transition-colors active:bg-secondary"
          >
            <a.icon className="size-4 text-primary" />
            <span className="text-[0.7rem] leading-tight">{a.label}</span>
          </button>
        ),
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- charts */

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
];

function ChartFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="surface-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-4 h-48">{children}</div>
    </section>
  );
}

export function TrendChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: { label: string; value: number; secondary?: number }[] | undefined;
}) {
  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
          <defs>
            <linearGradient id="hs-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#hs-area)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function BarsChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: { label: string; value: number }[] | undefined;
}) {
  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {(data ?? []).map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function BreakdownChart({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[] | undefined;
}) {
  return (
    <ChartFrame title={title}>
      <div className="flex h-full items-center gap-4">
        <ResponsiveContainer width="55%" height="100%">
          <PieChart>
            <Pie data={data ?? []} dataKey="value" innerRadius={38} outerRadius={64} paddingAngle={2}>
              {(data ?? []).map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <ul className="flex-1 space-y-1.5">
          {(data ?? []).map((d, i) => (
            <li key={d.label} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.label}</span>
              <span className="shrink-0 tabular-nums">{d.value} %</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------- admin list */

export interface AdminRow {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  color?: string;
  status?: { label: string; tone: "default" | "primary" | "success" | "warning" | "danger" };
  href?: string;
}

/**
 * The mobile replacement for an admin table (spec §44, §81): search, filter
 * chips, sorting, selection and pagination — as a touch list, not a grid.
 */
export function AdminList({
  rows,
  filters,
  sorts,
  emptyLabel = "No hay registros que coincidan.",
  onRowAction,
  pageSize = 12,
  selectable = false,
}: {
  rows: AdminRow[];
  filters?: { key: string; label: string; test: (r: AdminRow) => boolean }[];
  sorts?: { key: string; label: string; compare: (a: AdminRow, b: AdminRow) => number }[];
  emptyLabel?: string;
  onRowAction?: (row: AdminRow) => void;
  pageSize?: number;
  selectable?: boolean;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [sortOpen, setSortOpen] = useState(false);

  const processed = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const term = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.title.toLowerCase().includes(term) ||
          (r.subtitle ?? "").toLowerCase().includes(term),
      );
    }
    if (filter) {
      const f = filters?.find((x) => x.key === filter);
      if (f) out = out.filter(f.test);
    }
    if (sort) {
      const s = sorts?.find((x) => x.key === sort);
      if (s) out = [...out].sort(s.compare);
    }
    return out;
  }, [rows, q, filter, sort, filters, sorts]);

  const pages = Math.max(1, Math.ceil(processed.length / pageSize));
  const visible = processed.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar"
            aria-label="Buscar en la lista"
            className="h-11 rounded-full pl-10"
          />
        </div>
        {sorts && sorts.length > 0 && (
          <Button
            variant="outline"
            className="h-11 shrink-0"
            onClick={() => setSortOpen(true)}
            aria-label="Ordenar"
          >
            <ArrowUpDown className="size-4" />
          </Button>
        )}
      </div>

      {filters && filters.length > 0 && (
        <div className="scroll-x -mx-4 flex gap-2 px-4">
          <Chip
            active={filter === null}
            onClick={() => {
              setFilter(null);
              setPage(1);
            }}
          >
            Todos
          </Chip>
          {filters.map((f) => (
            <Chip
              key={f.key}
              active={filter === f.key}
              onClick={() => {
                setFilter(filter === f.key ? null : f.key);
                setPage(1);
              }}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{processed.length} registros</span>
        {selectable && selected.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="font-medium text-primary"
          >
            {selected.length} seleccionados · limpiar
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border">
          {visible.map((r) => {
            const inner = (
              <>
                {selectable && (
                  <span
                    role="checkbox"
                    aria-checked={selected.includes(r.id)}
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected((prev) =>
                        prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id],
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        setSelected((prev) =>
                          prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id],
                        );
                      }
                    }}
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded border",
                      selected.includes(r.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {selected.includes(r.id) && <span className="text-[0.6rem]">✓</span>}
                  </span>
                )}
                <GenerativeCover
                  seed={r.id}
                  gradient={r.color}
                  className="size-10 shrink-0"
                  rounded="rounded-lg"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  {r.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
                  )}
                </span>
                {r.status && (
                  <Badge variant={r.status.tone} className="shrink-0">
                    {r.status.label}
                  </Badge>
                )}
                {r.meta && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.meta}</span>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </>
            );

            return (
              <li key={r.id} className="border-b border-border last:border-0">
                {r.href ? (
                  <Link
                    to={r.href}
                    className="flex items-center gap-3 px-3.5 py-3 transition-colors active:bg-secondary"
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRowAction?.(r)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-secondary"
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            Página {page} de {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}

      {sorts && (
        <BottomSheet open={sortOpen} onOpenChange={setSortOpen}>
          <BottomSheetContent title="Ordenar por">
            <div className="space-y-0.5">
              {sorts.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSort(sort === s.key ? null : s.key);
                    setSortOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left text-sm transition-colors active:bg-secondary",
                    sort === s.key && "text-primary",
                  )}
                >
                  <SlidersHorizontal className="size-4" />
                  <span className="flex-1">{s.label}</span>
                  {sort === s.key && <span className="text-xs">Activo</span>}
                </button>
              ))}
            </div>
          </BottomSheetContent>
        </BottomSheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- section nav */

export function AdminSections({
  links,
}: {
  links: { label: string; href: string; icon: typeof Plus; description?: string }[];
}) {
  return (
    <ul className="overflow-hidden rounded-2xl border border-border">
      {links.map((l) => (
        <li key={l.href} className="border-b border-border last:border-0">
          <Link
            to={l.href}
            className="flex items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-secondary"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
              <l.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{l.label}</span>
              {l.description && (
                <span className="block truncate text-xs text-muted-foreground">{l.description}</span>
              )}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- activity */

export function RecentActivity({
  items,
}: {
  /** `at` es una marca de tiempo ISO; `time` un texto ya formateado. */
  items: { id: string; text: string; time?: string; at?: string; color?: string }[] | undefined;
}) {
  if (!items?.length) return null;
  return (
    <section className="surface-card p-4">
      <h3 className="text-sm font-semibold">Actividad reciente</h3>
      <ol className="mt-3 space-y-3">
        {items.map((a) => (
          <li key={a.id} className="flex gap-3">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{a.text}</span>
              <span className="block text-xs text-muted-foreground">
                {a.time ?? (a.at ? timeAgo(a.at) : "")}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export { Filter };
