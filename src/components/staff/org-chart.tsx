"use client";

/**
 * The staff hierarchy graph.
 *
 * Laid out with a Reingold–Tilford style tidy tree and drawn as SVG elbows
 * with HTML cards positioned over them, rather than pulling in a graph
 * library: the shape here is a tree, the cards need the app's own styling,
 * and neither is worth 200kB of dependency.
 *
 * Two things the layout has to survive, because real institutions produce
 * both: a chart with several roots (nobody has told the app who the Principal
 * is yet, so forty teachers all sit at the top), and one root with a hundred
 * leaves under it (every teacher reporting straight to the Principal). Deep
 * levels start collapsed for the first, and the whole canvas pans and zooms
 * for the second.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Crown,
  Maximize2,
  Minus,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { AvatarImage, initialsOf } from "@/components/ui/avatar-image";
import { cn } from "@/lib/utils";
import { TRACK_TONES } from "@/lib/staff/hierarchy-presets";
import type { OrgNode } from "@/lib/staff/hierarchy";

// Card geometry. Everything else is derived from these.
const NODE_W = 216;
const NODE_H = 88;
const H_GAP = 24;
const V_GAP = 64;
const CANVAS_PAD = 48;

/** Levels below the root that are open on first render. */
const DEFAULT_OPEN_DEPTH = 2;

interface Placed {
  node: OrgNode;
  x: number;
  y: number;
  depth: number;
  childIds: string[];
  hiddenCount: number;
}

interface Layout {
  placed: Placed[];
  byId: Map<string, Placed>;
  width: number;
  height: number;
}

/**
 * Assigns every visible node an (x, y).
 *
 * Leaves take the next free column and parents centre over their own children,
 * which keeps sibling subtrees in disjoint horizontal bands — so nothing can
 * overlap without needing a contour pass.
 */
function layoutTree(
  nodes: OrgNode[],
  collapsed: Set<string>,
  filterIds: Set<string> | null
): Layout {
  const visible = filterIds ? nodes.filter((n) => filterIds.has(n.id)) : nodes;
  const present = new Set(visible.map((n) => n.id));

  const childrenOf = new Map<string, string[]>();
  const nodeById = new Map(visible.map((n) => [n.id, n]));

  for (const node of visible) {
    // A manager filtered out of view makes their report a root here, so the
    // filtered chart is still a forest rather than a set of orphans.
    const parentId = node.managerId && present.has(node.managerId) ? node.managerId : null;
    if (!parentId) continue;
    const list = childrenOf.get(parentId) ?? [];
    list.push(node.id);
    childrenOf.set(parentId, list);
  }

  // Most senior first inside a level, then alphabetically — so the same chart
  // comes out the same way twice.
  const sortIds = (ids: string[]) =>
    [...ids].sort((a, b) => {
      const na = nodeById.get(a)!;
      const nb = nodeById.get(b)!;
      const la = na.designation?.level ?? 999;
      const lb = nb.designation?.level ?? 999;
      if (la !== lb) return la - lb;
      return na.fullName.localeCompare(nb.fullName);
    });

  const roots = sortIds(
    visible.filter((n) => !(n.managerId && present.has(n.managerId))).map((n) => n.id)
  );
  // The head of the institution anchors the chart, whoever else has no manager.
  roots.sort((a, b) => Number(nodeById.get(b)!.isInstitutionHead) - Number(nodeById.get(a)!.isInstitutionHead));

  const placed: Placed[] = [];
  const byId = new Map<string, Placed>();
  let cursor = 0;
  let maxDepth = 0;

  const walk = (id: string, depth: number): number => {
    const node = nodeById.get(id);
    if (!node) return cursor;
    maxDepth = Math.max(maxDepth, depth);

    const childIds = sortIds(childrenOf.get(id) ?? []);
    const isCollapsed = collapsed.has(id);

    let x: number;
    if (childIds.length === 0 || isCollapsed) {
      x = cursor;
      cursor += NODE_W + H_GAP;
    } else {
      const xs = childIds.map((childId) => walk(childId, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }

    const entry: Placed = {
      node,
      x,
      y: depth * (NODE_H + V_GAP),
      depth,
      childIds,
      hiddenCount: isCollapsed ? countSubtree(childIds, childrenOf) : 0,
    };
    placed.push(entry);
    byId.set(id, entry);
    return x;
  };

  for (const rootId of roots) walk(rootId, 0);

  return {
    placed,
    byId,
    width: Math.max(cursor - H_GAP, NODE_W) + CANVAS_PAD * 2,
    height: (maxDepth + 1) * NODE_H + maxDepth * V_GAP + CANVAS_PAD * 2,
  };
}

function countSubtree(ids: string[], childrenOf: Map<string, string[]>): number {
  let total = 0;
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    total += 1;
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return total;
}

/** Every id from `startIds` up to the root, so a search hit can be revealed. */
function ancestorsOf(nodes: Map<string, OrgNode>, startIds: string[]) {
  const found = new Set<string>();
  for (const start of startIds) {
    let cursor = nodes.get(start)?.managerId ?? null;
    let guard = 0;
    while (cursor && guard < 64 && !found.has(cursor)) {
      found.add(cursor);
      cursor = nodes.get(cursor)?.managerId ?? null;
      guard += 1;
    }
  }
  return found;
}

export interface OrgChartProps {
  nodes: OrgNode[];
  dottedEdges: Array<{ userId: string; managerId: string; kind: string; label: string | null }>;
  departments: Array<{ id: string; name: string; kind: string; parentId: string | null }>;
  selectedId?: string | null;
  onSelect: (node: OrgNode) => void;
}

export function OrgChart({ nodes, dottedEdges, departments, selectedId, onSelect }: OrgChartProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [track, setTrack] = useState<string>("");
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showDotted, setShowDotted] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const seeded = useRef(false);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Collapse deep branches on the first render only. Doing it on every change
  // would fight the user every time they expand something.
  useEffect(() => {
    if (seeded.current || nodes.length === 0) return;
    seeded.current = true;
    const depthOf = (node: OrgNode) => {
      let depth = 0;
      let cursor = node.managerId;
      let guard = 0;
      while (cursor && guard < 64) {
        depth += 1;
        cursor = nodeMap.get(cursor)?.managerId ?? null;
        guard += 1;
      }
      return depth;
    };
    const deep = nodes.filter((n) => depthOf(n) >= DEFAULT_OPEN_DEPTH && n.directReportCount > 0);
    if (deep.length) setCollapsed(new Set(deep.map((n) => n.id)));
  }, [nodes, nodeMap]);

  const filterIds = useMemo(() => {
    if (!departmentId && !track) return null;

    // A unit filter includes everything nested under it — picking a faculty
    // shows its departments' staff too.
    const unitIds = new Set<string>();
    if (departmentId) {
      const stack = [departmentId];
      while (stack.length) {
        const id = stack.pop()!;
        if (unitIds.has(id)) continue;
        unitIds.add(id);
        for (const dept of departments) if (dept.parentId === id) stack.push(dept.id);
      }
    }

    const matched = nodes.filter(
      (n) =>
        (!departmentId || (n.department && unitIds.has(n.department.id))) &&
        (!track || n.designation?.track === track)
    );
    // Keep the managers above a match, so the filtered chart still reads as a
    // chain of command rather than a scatter of cards.
    const keep = new Set(matched.map((n) => n.id));
    for (const id of ancestorsOf(nodeMap, [...keep])) keep.add(id);
    return keep;
  }, [departmentId, track, nodes, departments, nodeMap]);

  const layout = useMemo(() => layoutTree(nodes, collapsed, filterIds), [nodes, collapsed, filterIds]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return new Set<string>();
    return new Set(
      nodes
        .filter(
          (n) =>
            n.fullName.toLowerCase().includes(term) ||
            n.email.toLowerCase().includes(term) ||
            (n.designation?.name ?? n.designationLabel ?? "").toLowerCase().includes(term) ||
            (n.department?.name ?? "").toLowerCase().includes(term) ||
            (n.employeeCode ?? "").toLowerCase().includes(term)
        )
        .map((n) => n.id)
    );
  }, [query, nodes]);

  // A hit inside a collapsed branch is useless — open the way down to it.
  useEffect(() => {
    if (matches.size === 0) return;
    const reveal = ancestorsOf(nodeMap, [...matches]);
    setCollapsed((prev) => {
      if (![...reveal].some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of reveal) next.delete(id);
      return next;
    });
  }, [matches, nodeMap]);

  const centreOn = useCallback(
    (id: string) => {
      const target = layout.byId.get(id);
      const box = viewport.current;
      if (!target || !box) return;
      setPan({
        x: box.clientWidth / 2 - (target.x + CANVAS_PAD + NODE_W / 2) * scale,
        y: box.clientHeight / 3 - (target.y + CANVAS_PAD) * scale,
      });
    },
    [layout, scale]
  );

  const fit = useCallback(() => {
    const box = viewport.current;
    if (!box || layout.width === 0) return;
    const next = Math.min(1, Math.max(0.25, Math.min(box.clientWidth / layout.width, box.clientHeight / layout.height)));
    setScale(next);
    setPan({ x: (box.clientWidth - layout.width * next) / 2, y: 24 });
  }, [layout]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("[data-card]")) return;
    dragState.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    setPan({ x: drag.panX + (event.clientX - drag.x), y: drag.panY + (event.clientY - drag.y) });
  };

  const endDrag = () => {
    dragState.current = null;
  };

  const dottedPaths = useMemo(() => {
    if (!showDotted) return [];
    return dottedEdges
      .map((edge) => {
        const from = layout.byId.get(edge.managerId);
        const to = layout.byId.get(edge.userId);
        if (!from || !to) return null;
        const x1 = from.x + CANVAS_PAD + NODE_W / 2;
        const y1 = from.y + CANVAS_PAD + NODE_H / 2;
        const x2 = to.x + CANVAS_PAD + NODE_W / 2;
        const y2 = to.y + CANVAS_PAD + NODE_H / 2;
        const bow = Math.max(40, Math.abs(x2 - x1) / 3);
        return { key: `${edge.managerId}-${edge.userId}`, d: `M ${x1} ${y1} C ${x1 + bow} ${y1}, ${x2 - bow} ${y2}, ${x2} ${y2}`, label: edge.label };
      })
      .filter(Boolean) as Array<{ key: string; d: string; label: string | null }>;
  }, [dottedEdges, layout, showDotted]);

  const unplaced = nodes.filter((n) => !n.managerId && !n.isInstitutionHead).length;

  return (
    <div className="space-y-3">
      {/* ── Controls ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches.size > 0) centreOn([...matches][0]);
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Find a name, rank, department or staff code…"
            className="w-full rounded-xl border border-[#cfc2d6]/40 bg-white py-2.5 pl-9 pr-8 text-xs font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink-muted focus:border-[#8127cf]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-muted hover:bg-[#f3f4f9] hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded-xl border border-[#cfc2d6]/40 bg-white px-3 py-2.5 text-xs font-bold text-ink outline-none focus:border-[#8127cf]"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.parentId ? "— " : ""}
              {d.name}
            </option>
          ))}
        </select>

        <select
          value={track}
          onChange={(e) => setTrack(e.target.value)}
          className="rounded-xl border border-[#cfc2d6]/40 bg-white px-3 py-2.5 text-xs font-bold text-ink outline-none focus:border-[#8127cf]"
        >
          <option value="">All tracks</option>
          {Object.entries(TRACK_TONES).map(([key, tone]) => (
            <option key={key} value={key}>
              {tone.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-xl border border-[#cfc2d6]/40 bg-white p-1">
          <button type="button" onClick={() => setScale((s) => Math.max(0.25, s - 0.1))} className="rounded-lg p-1.5 text-ink-muted hover:bg-[#f3f4f9] hover:text-ink" aria-label="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center text-[10px] font-black tabular-nums text-ink-muted">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScale((s) => Math.min(1.6, s + 0.1))} className="rounded-lg p-1.5 text-ink-muted hover:bg-[#f3f4f9] hover:text-ink" aria-label="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={fit} className="rounded-lg p-1.5 text-ink-muted hover:bg-[#f3f4f9] hover:text-ink" aria-label="Fit to screen">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-black uppercase tracking-wide text-ink-subtle">
        {Object.entries(TRACK_TONES).map(([key, tone]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.hex }} />
            {tone.label}
          </span>
        ))}
        <label className="flex cursor-pointer items-center gap-1.5 normal-case">
          <input type="checkbox" checked={showDotted} onChange={(e) => setShowDotted(e.target.checked)} className="accent-[#8127cf]" />
          <span className="font-black uppercase tracking-wide">Show secondary lines</span>
        </label>
        {query ? <span className="normal-case text-[#8127cf]">{matches.size} match{matches.size === 1 ? "" : "es"}</span> : null}
      </div>

      {unplaced > 0 ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
          {unplaced} staff {unplaced === 1 ? "member has" : "members have"} no reporting line yet, so they sit at the top of the chart. Open a card and set who they report to.
        </p>
      ) : null}

      {/* ── Canvas ───────────────────────────────────────── */}
      <div
        ref={viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-[620px] cursor-grab touch-none overflow-hidden rounded-2xl border border-[#cfc2d6]/40 bg-[#fafaff] active:cursor-grabbing"
        style={{
          backgroundImage: "radial-gradient(#cfc2d6 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Users className="h-8 w-8 text-ink-muted" />
            <p className="text-sm font-black text-ink">No staff on this campus yet</p>
            <p className="max-w-xs text-xs font-semibold text-ink-muted">Invite teachers and staff, then set their rank and who they report to — the chart builds itself from that.</p>
          </div>
        ) : (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, width: layout.width, height: layout.height }}
          >
            <svg width={layout.width} height={layout.height} className="pointer-events-none absolute left-0 top-0">
              {layout.placed.map((parent) =>
                collapsed.has(parent.node.id)
                  ? null
                  : parent.childIds.map((childId) => {
                      const child = layout.byId.get(childId);
                      if (!child) return null;
                      const x1 = parent.x + CANVAS_PAD + NODE_W / 2;
                      const y1 = parent.y + CANVAS_PAD + NODE_H;
                      const x2 = child.x + CANVAS_PAD + NODE_W / 2;
                      const y2 = child.y + CANVAS_PAD;
                      const mid = y1 + V_GAP / 2;
                      return (
                        <path
                          key={`${parent.node.id}-${childId}`}
                          d={`M ${x1} ${y1} V ${mid} H ${x2} V ${y2}`}
                          fill="none"
                          stroke="#cfc2d6"
                          strokeWidth={1.5}
                          strokeLinejoin="round"
                        />
                      );
                    })
              )}
              {dottedPaths.map((path) => (
                <path
                  key={path.key}
                  d={path.d}
                  fill="none"
                  // Matches TRACK_TONES.ADMINISTRATIVE. At 75% opacity the old
                  // cyan-600 landed at 2.64:1 on the canvas — under the 3:1 that
                  // WCAG asks of a graphic you need to read the chart by.
                  stroke="#0e7490"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  opacity={0.75}
                />
              ))}
            </svg>

            {layout.placed.map((entry) => (
              <OrgCard
                key={entry.node.id}
                entry={entry}
                collapsed={collapsed.has(entry.node.id)}
                dimmed={matches.size > 0 && !matches.has(entry.node.id)}
                selected={selectedId === entry.node.id}
                onToggle={() => toggle(entry.node.id)}
                onSelect={() => onSelect(entry.node)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgCard({
  entry,
  collapsed,
  dimmed,
  selected,
  onToggle,
  onSelect,
}: {
  entry: Placed;
  collapsed: boolean;
  dimmed: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const { node } = entry;
  const tone = node.designation ? TRACK_TONES[node.designation.track as keyof typeof TRACK_TONES] : null;
  // Two different jobs, so two different colours. The rail down the left of the
  // card is decoration and may be a pale tint; the rank label is text and has to
  // stay readable — #cfc2d6 is a border tint at ~1.9:1 on white, which made
  // "No rank set" invisible on every card of a campus that has no ladder yet.
  const rail = tone?.hex ?? "#cfc2d6";
  const rank = node.designation?.shortName || node.designation?.name || node.designationLabel;
  const headship = node.headOf[0];
  const isLeaving = ["RESIGNED", "RETIRED", "TERMINATED", "NOTICE_PERIOD"].includes(node.employmentStatus);

  return (
    <div
      data-card
      className="absolute"
      style={{ left: entry.x + CANVAS_PAD, top: entry.y + CANVAS_PAD, width: NODE_W, height: NODE_H }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group flex h-full w-full items-center gap-2.5 rounded-2xl border bg-white px-3 text-left shadow-sm transition-all hover:shadow-md",
          selected ? "border-[#8127cf] ring-2 ring-[#8127cf]/20" : "border-[#cfc2d6]/50",
          dimmed && "opacity-30"
        )}
        style={{ borderLeftWidth: 4, borderLeftColor: rail }}
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f3f4f9] text-[11px] font-black text-ink-muted">
          {node.avatarUrl ? (
            <AvatarImage src={node.avatarUrl} name={node.fullName} />
          ) : (
            initialsOf(node.fullName)
          )}
          {node.isInstitutionHead ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#8127cf] text-white">
              <Crown className="h-2.5 w-2.5" />
            </span>
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className="truncate text-[13px] font-black leading-tight text-ink">{node.fullName}</span>
            {node.dueForReview ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[9px] font-black text-amber-700" title="Has served the usual time in this rank">
                DUE
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              "mt-0.5 block truncate text-[10px] font-black uppercase tracking-wide",
              !tone && "text-ink-subtle"
            )}
            style={tone ? { color: tone.hex } : undefined}
          >
            {rank || "No rank set"}
          </span>
          <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold text-ink-muted">
            {headship ? (
              <span className="truncate text-[#8127cf]">
                {headship.isActing ? "Acting head" : "Head"} · {headship.name}
              </span>
            ) : (
              <span className="truncate">{node.department?.name || "No department"}</span>
            )}
          </span>
        </span>

        {isLeaving ? (
          <span className="absolute right-2 top-2 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-rose-600">
            {node.employmentStatus === "NOTICE_PERIOD" ? "Notice" : "Left"}
          </span>
        ) : null}
      </button>

      {entry.childIds.length > 0 ? (
        <button
          type="button"
          onClick={onToggle}
          className="absolute -bottom-3 left-1/2 z-10 flex h-6 -translate-x-1/2 items-center gap-1 rounded-full border border-[#cfc2d6]/60 bg-white px-2 text-[10px] font-black text-ink-muted shadow-sm transition-colors hover:border-[#8127cf] hover:text-[#8127cf]"
          aria-label={collapsed ? `Show ${entry.hiddenCount} below ${node.fullName}` : `Hide the team below ${node.fullName}`}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {collapsed ? entry.hiddenCount : entry.childIds.length}
        </button>
      ) : null}
    </div>
  );
}
