/** URL state chooses presentation only. RoleShell and domain APIs still enforce access. */
export function workspaceViewFromSearch<T extends string>(search: string, allowed: readonly T[], fallback: T): T {
  const candidate = new URLSearchParams(search).get('view');
  return candidate !== null && allowed.includes(candidate as T) ? candidate as T : fallback;
}

export function workspaceViewUrl<T extends string>(href: string, next: T, allowed: readonly T[]): string | null {
  if (!allowed.includes(next)) return null;
  const url = new URL(href);
  url.searchParams.set('view', next);
  return `${url.pathname}${url.search}${url.hash}`;
}
