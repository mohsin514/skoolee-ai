import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classPerformance } from '../../src/components/insights/metrics';
const result = (marks: unknown[]) => classPerformance([{ id: 'a', name: 'A', students: marks.map(percentage => ({ reportCards: [{ percentage }] })) }])[0];
test('zero marks count as graded and do not inflate the class average', () => {
  assert.equal(result([0, 100]).average, 50);
  assert.equal(result([0, 100]).graded, 2);
  assert.equal(result([0, 0]).average, 0);
});
test('ungraded and nonfinite marks do not become zero or corrupt averages', () => {
  assert.equal(result([null, undefined, NaN, Infinity, -1]).average, null);
  assert.equal(result([null, 0, 60, NaN]).average, 30);
});
