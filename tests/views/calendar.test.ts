import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDay, groupCalendarRows, validWorkspaceView } from "../../src/lib/ui/workspace-views";
test("civil dates survive negative offsets, leap days and year boundaries", () => {
  for (const zone of ["America/Los_Angeles", "Asia/Karachi", "Pacific/Kiritimati"]) {
    assert.equal(calendarDay({value: "2024-02-29T00:00:00.000Z", kind: "date"}, zone), "2024-02-29");
    assert.equal(calendarDay({value: "2026-01-01", kind: "date"}, zone), "2026-01-01");
  }
});
test("instants use campus timezone through midnight and DST transitions", () => {
  assert.equal(calendarDay({value: "2026-01-01T00:30:00Z",kind:"instant"}, "America/Los_Angeles"), "2025-12-31");
  for (const value of ["2026-03-08T09:59:59Z", "2026-03-08T10:00:00Z", "2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z"]) {
    assert.equal(calendarDay({value,kind:"instant"}, "America/Los_Angeles"), value.slice(0,10));
  }
});
test("malformed, missing, offsetless and impossible dates stay undated", () => {
  for (const value of ["", "bad", "2025-02-29", "2026-02-30", new Date(NaN)]) assert.equal(calendarDay({value,kind:"date"}, "UTC"), null);
  assert.equal(calendarDay({value:"2026-02-30T00:30:00Z",kind:"instant"},"UTC"),null);
  assert.equal(calendarDay({value:42 as unknown as string,kind:"date"},"UTC"),null);
  assert.equal(calendarDay({value:"2026-01-01T00:30:00",kind:"instant"},"UTC"),null);
  assert.equal(calendarDay({value:"2026-01-01T00:30:00Z",kind:"instant"},"bad-zone"),null);
});
test("grouping retains each record, duplicate dates, input order and identity", () => {
  const rows = [{id:"a", date:"2026-03-02"},{id:"b",date:null},{id:"c",date:"2026-03-01"},{id:"d",date:"2026-03-02"}];
  const result = groupCalendarRows(rows, row => ({value:row.date,kind:"date"}), "UTC");
  assert.deepEqual(result.days.map(([day])=>day),["2026-03-01","2026-03-02"]);
  assert.equal(result.days[1][1][0], rows[0]);
  assert.deepEqual([...result.days.flatMap(([,items])=>items),...result.undated].map(r=>r.id).sort(), ["a","b","c","d"]);
  assert.deepEqual(rows.map(r=>r.id),["a","b","c","d"]);
});
test("presentation URLs reject unknown and non-string values",()=>{
  for(const value of ["cards","table","grid","calendar"]) assert.equal(validWorkspaceView(value),true);
  for(const value of [null,{},"toString","<script>",0]) assert.equal(validWorkspaceView(value),false);
});
