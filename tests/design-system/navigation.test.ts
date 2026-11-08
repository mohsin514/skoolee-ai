import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableNavigation, isNavigationActive, searchNavigation } from '../../src/lib/navigation/items';
import { moduleForHref, moduleForView } from '../../src/lib/navigation/modules';

test('route matching respects segment boundaries, roots and explicit local view state', () => {
  assert.equal(isNavigationActive({ href: '/parent' }, '/parent/results'), false);
  assert.equal(isNavigationActive({ href: '/teacher/reports' }, '/teacher/reports-old'), false);
  assert.equal(isNavigationActive({ href: '/teacher/reports?draft=1' }, '/teacher/reports/42'), true);
  assert.equal(isNavigationActive({ href: '/teacher/reports', active: false }, '/teacher/reports'), false);
});
test('unavailable children and empty groups disappear without mutating the source', () => {
  const source = [{ available: true, children: [{ available: false }] }, { available: true }, { available: false }];
  assert.deepEqual(availableNavigation(source), [{ available: true }]);
  assert.equal(source.length, 3);
});
test('modules use stable view and route identifiers, with operations mapped to their own permissions', () => {
  assert.equal(moduleForHref('/parent/results?token=synthetic'), 'reports');
  assert.equal(moduleForHref('/messages'), null);
  assert.equal(moduleForView('transport'), 'transport');
  assert.equal(moduleForView('inventory'), 'inventory');
  assert.equal(moduleForView('grading-rules'), 'exams');
});


test('workspace search never resurrects denied children, including matching groups', () => {
  type Entry = { label: string; available?: boolean; children?: Entry[] };
  const source: Entry[] = [{ label: 'Learning', children: [{ label: 'Reports' }, { label: 'Restricted reports', available: false }] }, { label: 'Fees', available: false }];
  assert.deepEqual(searchNavigation(source, 'learning'), [{ label: 'Learning', children: [{ label: 'Reports' }] }]);
  assert.deepEqual(searchNavigation(source, 'report'), [{ label: 'Learning', children: [{ label: 'Reports' }] }]);
  assert.deepEqual(searchNavigation(source, 'fees'), []);
  assert.equal(source[0].children?.length, 2);
});
test('workspace search supports translated labels and case-insensitive whitespace-trimmed matching', () => {
  const items = [{ label: 'Attendance' }, { label: 'التقارير' }, { label: 'رپورٹس' }];
  assert.deepEqual(searchNavigation(items, '  ATTEND  '), [items[0]]);
  assert.deepEqual(searchNavigation(items, 'تقارير'), [items[1]]);
  assert.deepEqual(searchNavigation(items, 'رپورٹ'), [items[2]]);
});

test('workspace URL parsing rejects forged values and preserves unrelated scope parameters', async () => {
  const { workspaceViewFromSearch, workspaceViewUrl } = await import('../../src/lib/navigation/workspace-view');
  const allowed = ['dashboard', 'reports'] as const;
  assert.equal(workspaceViewFromSearch('?view=reports', allowed, 'dashboard'), 'reports');
  assert.equal(workspaceViewFromSearch('?view=platform-secrets', allowed, 'dashboard'), 'dashboard');
  assert.equal(workspaceViewFromSearch('?view=Reports', allowed, 'dashboard'), 'dashboard');
  assert.equal(workspaceViewUrl('https://school.example/teacher?campus=north#tasks', 'reports', allowed), '/teacher?campus=north&view=reports#tasks');
  assert.equal(workspaceViewUrl('https://school.example/teacher', 'forged', allowed as readonly string[]), null);
});
