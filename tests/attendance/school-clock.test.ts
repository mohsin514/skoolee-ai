import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schoolClock } from '../../src/lib/timetable/school-clock';
test('school date and lesson ordering cross midnight independently of device timezone', () => {
  const now = new Date('2026-10-25T20:30:00Z');
  assert.deepEqual(schoolClock(now, 'Asia/Karachi'), { day: '2026-10-26', minutes: 90 });
  assert.deepEqual(schoolClock(now, 'America/Los_Angeles'), { day: '2026-10-25', minutes: 810 });
});
test('midnight and daylight saving comparisons use hour 0 through 23', () => {
  assert.equal(schoolClock(new Date('2026-10-25T19:00:00Z'), 'Asia/Karachi').minutes, 0);
  assert.equal(schoolClock(new Date('2026-11-01T09:30:00Z'), 'America/Los_Angeles').minutes, 90);
});
