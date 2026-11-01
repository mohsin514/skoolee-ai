// SKAI-1449: a failed planner read is an error, never an empty list. A successful empty response stays the empty
// state, and 401 or 403 is treated as an access or session issue. The planner reads go through the shared
// classification, and no read maps its failure to an empty value.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkedJson, RequestFailure, requestFailure } from "../../src/lib/http/request-state";

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const kindOf = async (promise: Promise<unknown>) => { try { await promise; return null; } catch (error) { return requestFailure(error).kind; } };

test("a 500 is a server failure, not an empty result", async () => {
  assert.equal(await kindOf(checkedJson(response(500, { success: false, error: "boom" }))), "server");
});

test("a network failure is classified as offline, not as an empty result", async () => {
  assert.equal(requestFailure(new TypeError("fetch failed")).kind, "offline");
});

test("a 403 is an access issue and a 401 is a session issue", async () => {
  assert.equal(await kindOf(checkedJson(response(403, { success: false, error: "no" }))), "denied");
  assert.equal(await kindOf(checkedJson(response(401, { success: false, error: "no" }))), "session");
});

test("a successful empty response is a success with no failure", async () => {
  const body = await checkedJson(response(200, { success: true, data: { trips: [] } }));
  assert.deepEqual(body.data, { trips: [] });
});

test("a malformed success is a server failure, not an empty list", async () => {
  assert.ok(new RequestFailure("server") instanceof Error);
  assert.equal(await kindOf(checkedJson(new Response("not json", { status: 200 }))), "server");
});

test("the planner keeps each read separate and never maps a failure to an empty value", () => {
  const source = readFileSync("src/components/transport/transport.tsx", "utf8");
  const planner = source.slice(source.indexOf("export function TripsPlanner"), source.indexOf("// ─── Family"));
  assert.doesNotMatch(planner, /catch\(\(\) => setData\(\{ trips: \[\] \}\)\)/u);
  assert.doesNotMatch(planner, /\.catch\(\(\) => set(Routes|Staff)\(\[\]\)\)/u);
  assert.match(planner, /useFetch<\{ trips: TripRow\[\] \}>\(`\/api\/transport\/trips\?date=\$\{date\}`/u);
  assert.match(planner, /trips\.failure \? <ErrorState error=\{trips\.failure\} onRetry=\{trips\.refetch\}/u);
  assert.match(planner, /routeList\.failure \? /u);
  assert.match(planner, /staffList\.failure \? /u);
});
