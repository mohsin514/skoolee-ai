import { pathToFileURL } from 'node:url';

// No dotenv, credentials, cookies, database access, redirects or writes to the app.
export function targetOrigin(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a bare HTTPS origin (HTTP is allowed only on loopback).');
  }
  return url.origin;
}

// SKAI-867: expectedCommit (optional) is the approved commit; the deployed build must match it.
export async function smoke(origin, request = fetch, expectedCommit) {
  origin = targetOrigin(origin);
  const checks = [];
  for (const path of ['/login', '/api/auth/session', '/api/public/ready']) {
    try {
      const response = await request(`${origin}${path}`, {
        method: 'GET', redirect: 'manual', credentials: 'omit',
        headers: { Accept: path === '/login' ? 'text/html' : 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      const type = response.headers.get('content-type') ?? '';
      let passed;
      if (path === '/login') {
        const html = await response.text();
        passed = response.status === 200 && type.includes('text/html') &&
          /id=["']login-language["']/.test(html) && /id=["']password["']/.test(html);
      } else if (path === '/api/public/ready') {
        // Database reachable, and (when given) the exact approved commit is what is serving.
        const body = type.includes('application/json') ? await response.json() : null;
        const commitMatches = !expectedCommit || body?.build === String(expectedCommit).slice(0, 12);
        passed = response.status === 200 && body?.ok === true && body?.checks?.database === 'up' && commitMatches;
      } else {
        const body = type.includes('application/json') ? await response.json() : null;
        passed = response.status === 401 && body?.user === null &&
          body?.activeExamUrl === null &&
          /\bno-store\b/i.test(response.headers.get('cache-control') ?? '');
      }
      checks.push({ path, status: response.status, passed });
    } catch {
      // Do not serialize response bodies, headers, cookies or exception details.
      checks.push({ path, passed: false, error: 'Request timed out, failed, or returned invalid content.' });
    }
  }
  return {
    checkedAt: new Date().toISOString(), origin,
    scope: expectedCommit ? 'Public login, anonymous session denial, database readiness and deployed commit.' : 'Public login, anonymous session denial and database readiness; deployed commit not certified (no expected commit given).',
    passed: checks.every(check => check.passed), checks,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await smoke(process.argv[2], fetch, process.argv[3]);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.passed ? 0 : 1;
  } catch {
    console.error('Usage: node scripts/deployment/smoke.mjs https://confirmed-environment.example [expected-commit-sha]');
    process.exitCode = 1;
  }
}
