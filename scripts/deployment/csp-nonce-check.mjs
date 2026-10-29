// SKAI-951 regression guard: every page must carry the per-request CSP nonce on
// every <script> tag, or the strict CSP blocks hydration (prerendered pages
// ship nonce-less scripts). Usage: node scripts/deployment/csp-nonce-check.mjs http://127.0.0.1:3000
export const PUBLIC_ROUTES = ['/', '/login', '/register', '/pricing', '/privacy', '/security', '/ai-governance'];

export function checkPage(html, csp) {
  const problems = [];
  const nonce = /'nonce-([^']+)'/.exec(csp || '')?.[1];
  if (!nonce) return { ok: false, problems: ['no nonce in content-security-policy header'] };
  // Data blocks (application/ld+json, application/json) never execute, so CSP ignores them.
  const scripts = (html.match(/<script\b[^>]*>/gi) || [])
    .filter((tag) => !/\btype="application\/(ld\+)?json"/i.test(tag));
  if (!scripts.length) problems.push('no <script> tags found');
  for (const tag of scripts) {
    const n = /\bnonce="([^"]*)"/.exec(tag)?.[1];
    if (n !== nonce) problems.push(`script without matching nonce: ${tag.slice(0, 120)}`);
  }
  return { ok: problems.length === 0, problems, scripts: scripts.length };
}

export async function checkRoutes(base, routes = PUBLIC_ROUTES, fetchImpl = fetch) {
  const results = [];
  for (const route of routes) {
    const res = await fetchImpl(new URL(route, base), { redirect: 'manual', headers: { accept: 'text/html' } });
    const r = res.status >= 300 && res.status < 400
      ? { ok: true, problems: [], skipped: `redirect ${res.status}` }
      : checkPage(await res.text(), res.headers.get('content-security-policy'));
    results.push({ route, status: res.status, ...r });
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await checkRoutes(process.argv[2] || 'http://127.0.0.1:3000');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.route} ${r.status} scripts=${r.scripts ?? '-'} ${r.skipped || ''} ${r.problems.slice(0, 2).join(' | ')}`);
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
