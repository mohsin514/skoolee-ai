import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoke, targetOrigin } from '../../scripts/deployment/smoke.mjs';

const login = () => new Response('<input id="password"><select id="login-language"></select>', {
  headers: { 'content-type': 'text/html' },
});
const denied = () => Response.json({ user: null, activeExamUrl: null }, {
  status: 401, headers: { 'cache-control': 'private, no-store' },
});

test('rejects credentials, queries, paths and unencrypted remote origins', () => {
  for (const url of ['http://example.com', 'https://user:secret@example.com',
    'https://example.com/?token=secret', 'https://example.com/login', 'https://example.com/#secret']) {
    assert.throws(() => targetOrigin(url));
  }
  assert.equal(targetOrigin('http://127.0.0.1:3952/'), 'http://127.0.0.1:3952');
});

test('checks both routes with anonymous GETs and no redirects', async () => {
  const paths = [];
  const result = await smoke('https://example.com', async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Cookie, undefined);
    paths.push(new URL(url).pathname);
    return url.endsWith('/login') ? login() : denied();
  });
  assert.equal(result.passed, true);
  assert.deepEqual(paths, ['/login', '/api/auth/session']);
});

test('fails on login redirects, generic HTML, or incorrect session outcomes', async () => {
  for (const bad of [() => new Response('', { status: 302 }),
    () => new Response('provider error', { headers: { 'content-type': 'text/html' } })]) {
    assert.equal((await smoke('https://example.com', async url => url.endsWith('/login') ? bad() : denied())).passed, false);
  }
  for (const bad of [() => Response.json({ user: null }, { status: 200 }),
    () => Response.json({ user: { id: 'synthetic' }, activeExamUrl: null }, { status: 401 }),
    () => Response.json({ user: null, activeExamUrl: null }, { status: 401 })]) {
    assert.equal((await smoke('https://example.com', async url => url.endsWith('/login') ? login() : bad())).passed, false);
  }
});

test('reports failures without exposing exception details', async () => {
  const report = await smoke('https://example.com', async () => { throw new Error('sensitive detail'); });
  assert.equal(report.passed, false);
  assert.equal(report.checks.length, 2);
  assert.equal(JSON.stringify(report).includes('sensitive detail'), false);
});
