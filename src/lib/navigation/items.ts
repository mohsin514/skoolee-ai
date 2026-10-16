/** Presentation availability is not authorization. Callers supply server-derived access. */
export interface NavigationTarget {
  href?: string;
  active?: boolean;
  available?: boolean;
}

export function isNavigationActive(item: NavigationTarget, pathname: string): boolean {
  if (item.active !== undefined) return item.active;
  const path = item.href?.split(/[?#]/)[0];
  if (!path) return false;
  // Console roots are landing pages, not ancestors that stay selected everywhere.
  return pathname === path || (path.split('/').filter(Boolean).length > 1 && pathname.startsWith(`${path}/`));
}

export function availableNavigation<T extends NavigationTarget & { children?: T[] }>(items: T[]): T[] {
  return items.flatMap((item) => {
    if (item.available === false) return [];
    if (!item.children) return [item];
    const children = availableNavigation(item.children);
    return children.length ? [{ ...item, children }] : [];
  });
}

/** Search only supplied, available destinations; a matching group reveals its available children. */
export function searchNavigation<T extends NavigationTarget & { label: string; children?: T[] }>(items: T[], query: string): T[] {
  const normalized = query.trim().normalize('NFKC').toLocaleLowerCase();
  return availableNavigation(items).flatMap(item => {
    if (!normalized || item.label.normalize('NFKC').toLocaleLowerCase().includes(normalized)) return [item];
    if (!item.children) return [];
    const children = searchNavigation(item.children, query);
    return children.length ? [{ ...item, children }] : [];
  });
}
