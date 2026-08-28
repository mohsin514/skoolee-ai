"use client";

/**
 * The pieces every insight panel is built from.
 *
 * Three dashboards render these, so the rules live here once: hairline chrome,
 * thin marks, a legend whenever there are two or more series, and a table view
 * behind every chart — a tooltip is allowed to enhance a value, never to be the
 * only way to read it.
 */

import { useId, useMemo, useState, type ReactNode } from "react";
import { BarChart3, Table2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { INK, compact } from "./palette";

/* ─── Card shell ─────────────────────────────────────────── */

export interface TableTwin {
  columns: string[];
  /** Cells are pre-formatted: the table is the accessible copy of what the
   *  chart shows, not a second place to re-derive numbers. */
  rows: (string | number)[][];
}

interface InsightCardProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  /** Renders beside the title — a filter, a link, a count. */
  actions?: ReactNode;
  /** Supplying this adds the chart/table toggle. */
  table?: TableTwin;
  className?: string;
  /** Entrance stagger, in ms. */
  delay?: number;
  children: ReactNode;
}

export function InsightCard({
  icon: Icon,
  title,
  subtitle,
  actions,
  table,
  className,
  delay = 0,
  children,
}: InsightCardProps) {
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "sk-rise group/card relative flex flex-col overflow-hidden rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5",
        "shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]",
        "transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]",
        className,
      )}
      style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm">
              <Icon className="h-4.5 w-4.5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 id={headingId} className="truncate text-sm font-black tracking-tight text-[#1f1a23]">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {table ? (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              title={showTable ? "Show chart" : "Show the numbers as a table"}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/15"
            >
              {showTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
              <span className="sr-only">{showTable ? "Show chart" : "Show table"}</span>
            </button>
          ) : null}
        </div>
      </header>

      <div className="min-w-0 flex-1">
        {showTable && table ? <DataTable {...table} /> : children}
      </div>
    </section>
  );
}

/** The WCAG-clean twin of a chart. Numbers align, so they get tabular figures. */
export function DataTable({ columns, rows }: TableTwin) {
  if (rows.length === 0) return <EmptyChart label="Nothing to tabulate yet" />;
  return (
    <div className="max-h-[300px] overflow-auto custom-scrollbar rounded-2xl border border-[#cfc2d6]/25">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 bg-[#fbf0fe]">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={cn(
                  "px-3 py-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle",
                  i > 0 && "text-right",
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-[#cfc2d6]/20">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={cn(
                    "px-3 py-2 text-xs font-bold text-[#1f1a23]",
                    c > 0 && "text-right [font-variant-numeric:tabular-nums]",
                  )}
                >
                  {typeof cell === "number" ? cell.toLocaleString() : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Tooltip ────────────────────────────────────────────── */

interface VizTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  /** Appended to every value — "%", " students". */
  unit?: string;
  /** Overrides the value rendering entirely. */
  format?: (value: number, name: string, entry: any) => string;
  /** Replaces the header line. */
  titleFor?: (label: any, payload: any[]) => string;
}

export function VizTooltip({ active, payload, label, unit = "", format, titleFor }: VizTooltipProps) {
  if (!active || !payload?.length) return null;
  const heading = titleFor ? titleFor(label, payload) : String(label ?? "");
  return (
    <div className="pointer-events-none rounded-2xl border border-[#cfc2d6]/30 bg-white/95 px-3 py-2 shadow-[0_10px_28px_-6px_rgba(31,26,35,0.22)] backdrop-blur">
      {heading ? (
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-ink-subtle">{heading}</p>
      ) : null}
      <ul className="space-y-1">
        {payload.map((entry: any, i: number) => {
          const value = typeof entry.value === "number" ? entry.value : Number(entry.value) || 0;
          const name = entry.name ?? entry.dataKey ?? "";
          return (
            <li key={`${name}-${i}`} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: entry.color || entry.payload?.fill || INK.muted }}
              />
              <span className="text-[11px] font-bold text-ink-muted">{name}</span>
              <span className="ml-auto text-[11px] font-black text-[#1f1a23] [font-variant-numeric:tabular-nums]">
                {format ? format(value, String(name), entry) : `${value.toLocaleString()}${unit}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─── Legend ─────────────────────────────────────────────── */

export interface LegendItem {
  label: string;
  color: string;
  value?: number | string;
}

/** Present whenever a chart carries two or more series — identity is never
 *  left to colour-matching alone. */
export function SeriesLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">{item.label}</span>
          {item.value !== undefined ? (
            <span className="text-[10px] font-black text-[#1f1a23] [font-variant-numeric:tabular-nums]">
              {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ─── Figures ────────────────────────────────────────────── */

/**
 * The one number a view leads with. Proportional figures, the same sans as
 * everything else — a display face here reads as decoration.
 */
export function HeroFigure({
  value,
  label,
  caption,
  accent,
  children,
}: {
  value: string;
  label: string;
  caption?: string;
  accent?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-white/55">{label}</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <span className="text-5xl font-black leading-none tracking-tight text-white sm:text-6xl">{value}</span>
        {accent}
      </div>
      {caption ? <p className="mt-3 text-[11px] font-bold leading-relaxed text-white/55">{caption}</p> : null}
      {children}
    </div>
  );
}

/**
 * A labelled proportion bar. The fill carries severity; the track is a lighter
 * step of the same colour so the state reads across the whole bar.
 */
export function Meter({
  value,
  max,
  label,
  valueLabel,
  color = "#8127cf",
  onDark = false,
}: {
  value: number;
  max: number;
  label: string;
  valueLabel?: string;
  color?: string;
  onDark?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "truncate text-[10px] font-black uppercase tracking-wider",
            onDark ? "text-white/55" : "text-ink-subtle",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "shrink-0 text-[11px] font-black [font-variant-numeric:tabular-nums]",
            onDark ? "text-white" : "text-[#1f1a23]",
          )}
        >
          {valueLabel ?? `${Math.round(pct)}%`}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: onDark ? "rgba(255,255,255,0.16)" : `${color}22` }}
        role="img"
        aria-label={`${label}: ${valueLabel ?? `${Math.round(pct)}%`}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

/**
 * A single proportion, drawn as an arc. Used where the number *is* the chart
 * and a one-bar bar chart would be the wrong form.
 */
export function RadialGauge({
  value,
  label,
  sublabel,
  color = "#8127cf",
  size = 148,
}: {
  /** 0–100. */
  value: number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  // Three quarters of a turn, opening downward, so the label sits in the gap.
  const arc = circumference * 0.75;
  const filled = arc * (clamped / 100);

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${Math.round(clamped)} percent`}
        className="-rotate-[225deg]"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`${color}1f`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.2,0.7,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-black leading-none tracking-tight text-[#1f1a23]">
          {Math.round(clamped)}
          <span className="text-lg">%</span>
        </span>
        <span className="mt-1 px-4 text-[9px] font-black uppercase leading-tight tracking-wider text-ink-subtle">
          {label}
        </span>
        {sublabel ? <span className="mt-0.5 text-[9px] font-bold text-ink-faint">{sublabel}</span> : null}
      </div>
    </div>
  );
}

/** A 12-point trend, drawn small enough to sit inside a tile. */
export function Sparkline({
  points,
  color = "#8127cf",
  width = 96,
  height = 28,
  label,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
  label: string;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const step = width / (points.length - 1);
    const coords = points.map((p, i) => {
      const x = i * step;
      const y = height - 2 - ((p - min) / span) * (height - 4);
      return [x, y] as const;
    });
    return {
      line: coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      area: `${coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} L${width},${height} L0,${height} Z`,
      last: coords[coords.length - 1],
    };
  }, [points, width, height]);

  if (!path) return null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <path d={path.area} fill={color} opacity={0.1} />
      <path d={path.line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* Surface ring keeps the end-dot legible where it crosses the line. */}
      <circle cx={path.last[0]} cy={path.last[1]} r={4} fill={color} stroke={INK.surface} strokeWidth={2} />
    </svg>
  );
}

/**
 * Label · value · optional delta · optional trend. The contract from the
 * design system, so every tile across the three dashboards reads the same.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  trendColor,
  meter,
  tone = "brand",
  onClick,
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  trend?: number[];
  trendColor?: string;
  meter?: { value: number; max: number; color?: string; label?: string };
  tone?: "brand" | "good" | "warning" | "critical" | "dark";
  onClick?: () => void;
  delay?: number;
}) {
  const toneChip: Record<string, string> = {
    brand: "bg-[#fbf0fe] text-[#8127cf]",
    good: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
    dark: "bg-[#1f1a23] text-white",
  };
  const toneGlow: Record<string, string> = {
    brand: "bg-[#8127cf]/18",
    good: "bg-emerald-500/18",
    warning: "bg-amber-500/18",
    critical: "bg-rose-500/18",
    dark: "bg-[#1f1a23]/18",
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-ink-subtle">{label}</p>
          {/* A long word ("Enterprise") does not fit the tile at 3xl and was
              getting clipped by the icon, so the type steps down instead. */}
          <p
            className={cn(
              "font-black leading-none tracking-tight text-[#1f1a23]",
              typeof value === "string" && value.length > 8 ? "text-xl" : "text-3xl",
            )}
          >
            {typeof value === "number" ? compact(value) : value}
          </p>
          {sub ? <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{sub}</p> : null}
        </div>
        <div className="relative shrink-0">
          <div
            className={cn(
              "absolute -inset-2 rounded-xl opacity-0 blur-lg transition-opacity duration-500 group-hover/tile:opacity-100",
              toneGlow[tone],
            )}
          />
          <div className={cn("relative flex h-11 w-11 items-center justify-center rounded-2xl", toneChip[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
      {trend && trend.length > 1 ? (
        <div className="mt-3">
          <Sparkline points={trend} color={trendColor ?? "#8127cf"} label={`${label} trend`} width={120} />
        </div>
      ) : null}
      {meter ? (
        <div className="mt-4">
          <Meter
            value={meter.value}
            max={meter.max}
            label={meter.label ?? "Used"}
            color={meter.color ?? "#8127cf"}
          />
        </div>
      ) : null}
    </>
  );

  const className = cn(
    "sk-rise group/tile rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5",
    "shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all",
    onClick &&
      "w-full cursor-pointer text-left hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/15",
  );
  const style = delay > 0 ? { animationDelay: `${delay}ms` } : undefined;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={style}>
        {body}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

/* ─── Empty ──────────────────────────────────────────────── */

export function EmptyChart({ label = "No data for this period yet" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#cfc2d6]/40 bg-[#fbf0fe]/25 px-4 py-8 text-center">
      <BarChart3 className="h-6 w-6 text-[#cfc2d6]" />
      <p className="text-[11px] font-bold text-ink-subtle">{label}</p>
    </div>
  );
}
