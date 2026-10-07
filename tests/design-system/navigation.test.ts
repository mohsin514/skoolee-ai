import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableNavigation, isNavigationActive } from '../../src/lib/navigation/items';
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
