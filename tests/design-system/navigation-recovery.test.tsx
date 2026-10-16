import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
// Match Next's client boundary: locale actions are server references in the app,
// and must not execute during a pure shared-component rendering test.
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('tsx'))('esbuild');
const compiled = buildSync({ entryPoints: [resolve('src/components/nav/NavigationAccess.tsx')], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', alias: { '@/app/actions/locale': resolve('tests/design-system/foundation-b/locale-action.ts') } }).outputFiles[0].text;
const loaded = { exports: {} as typeof import('../../src/components/nav/NavigationAccess') };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, require);
const { NavigationAccessNotice, NavigationAccessProvider, useNavigationAccess } = loaded.exports;

function ProtectedPortal({ failed }: { failed: boolean }) {
  const access = useNavigationAccess();
  const denied = !access.allowsHref('/parent/fees');
  return <>
    <NavigationAccessNotice denied={denied} fallback={failed ? <button type="button">Try Again</button> : undefined} />
    {!denied && <p>Fee records</p>}
  </>;
}

test('a failed externally loaded access map exposes recovery while keeping records closed', () => {
  const html = renderToStaticMarkup(<NavigationAccessProvider access={null}><ProtectedPortal failed /></NavigationAccessProvider>);
  assert.match(html, /Try Again/);
  assert.doesNotMatch(html, /Checking workspace access/);
  assert.doesNotMatch(html, /Fee records/);
});

test('retry loading stays closed until the supplied map explicitly permits the route', () => {
  const pending = renderToStaticMarkup(<NavigationAccessProvider access={null}><ProtectedPortal failed={false} /></NavigationAccessProvider>);
  assert.match(pending, /Checking workspace access/);
  assert.doesNotMatch(pending, /Fee records/);
  const denied = renderToStaticMarkup(<NavigationAccessProvider access={{ fees: false }}><ProtectedPortal failed={false} /></NavigationAccessProvider>);
  assert.match(denied, /not available with your current access/);
  assert.doesNotMatch(denied, /Fee records/);
  const ready = renderToStaticMarkup(<NavigationAccessProvider access={{ fees: true }}><ProtectedPortal failed={false} /></NavigationAccessProvider>);
  assert.match(ready, /Fee records/);
  assert.doesNotMatch(ready, /Checking workspace access/);
});
