import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callbackDueByToday } from '../../src/lib/front-desk/callback-day';
test('callbacks use the school calendar across midnight and exclude tomorrow', () => {
  const now = new Date('2026-10-25T20:30:00Z');
  assert.equal(callbackDueByToday('2026-10-26T10:00:00Z', now, 'Asia/Dubai'), true);
  assert.equal(callbackDueByToday('2026-10-26T10:00:00Z', now, 'America/Los_Angeles'), false);
  assert.equal(callbackDueByToday('2026-10-26T20:00:00Z', now, 'Asia/Dubai'), false);
  assert.equal(callbackDueByToday('2026-10-24T00:00:00Z', now, 'Asia/Dubai'), true);
  assert.equal(callbackDueByToday('invalid', now, 'Asia/Dubai'), false);
});
test('a daylight saving transition still includes the complete school day', () => {
  assert.equal(callbackDueByToday('2026-11-02T07:59:00Z', new Date('2026-11-01T08:00:00Z'), 'America/Los_Angeles'), true);
  assert.equal(callbackDueByToday('2026-11-02T08:00:00Z', new Date('2026-11-01T08:00:00Z'), 'America/Los_Angeles'), false);
});
