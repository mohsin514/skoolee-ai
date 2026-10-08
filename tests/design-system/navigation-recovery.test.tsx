import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationAccessNotice, NavigationAccessProvider, useNavigationAccess } from '../../src/components/nav/NavigationAccess';

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
