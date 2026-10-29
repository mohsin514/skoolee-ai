import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, checkRoutes } from '../../scripts/deployment/csp-nonce-check.mjs';

const csp = "default-src 'self'; script-src 'self' 'nonce-abc123' 'strict-dynamic'";

test('passes when every script carries the header nonce', () => {
  const html = '<script nonce="abc123" src="/_next/static/a.js"></script><script nonce="abc123">self.__next_f=[]</script>'
    + '<script type="application/ld+json">{}</script>';
  assert.equal(checkPage(html, csp).ok, true);
});

test('fails on prerendered pages whose scripts lack the nonce (SKAI-951 regression)', () => {
  const html = '<script src="/_next/static/a.js" async=""></script><script nonce="abc123">x</script>';
  const r = checkPage(html, csp);
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1);
  assert.equal(checkPage('<script nonce="stale">x</script>', csp).ok, false);
  assert.equal(checkPage('<script nonce="abc123">x</script>', "script-src 'self'").ok, false);
});

// Live check against a running production build: CSP_BASE_URL=http://127.0.0.1:3000
test('every public route hydrates under the nonce CSP', { skip: !process.env.CSP_BASE_URL }, async () => {
  const results = await checkRoutes(process.env.CSP_BASE_URL);
  assert.deepEqual(results.filter((r) => !r.ok).map((r) => [r.route, r.problems[0]]), []);
});
