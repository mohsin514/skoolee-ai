/**
 * Org-chart geometry.
 *
 * Kept apart from the component because it is pure: nodes in, coordinates out.
 * That makes the one part of the chart that can silently go wrong — overlapping
 * cards, a subtree laid out on top of its sibling — directly testable without
 * rendering anything.
 */

import type { OrgNode } from "@/lib/staff/hierarchy";

// Card geometry. Everything else is derived from these.
export const NODE_W = 216;
export const NODE_H = 88;
export const H_GAP = 24;
export const V_GAP = 64;
export const CANVAS_PAD = 48;

/** Levels below the root that are open on first render. */
export const DEFAULT_OPEN_DEPTH = 2;

export interface Placed {
  node: OrgNode;
  x: number;
  y: number;
  depth: number;
  childIds: string[];
  hiddenCount: number;
}

export interface Layout {
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
export function layoutTree(
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
