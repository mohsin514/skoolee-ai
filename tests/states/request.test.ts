import { test } from "node:test";
import assert from "node:assert/strict";
import { checkedJson, checkedListJson, failureForStatus, RequestFailure, requestFailure, resourceState, readRequest } from "../../src/lib/http/request-state";

test("HTTP outcomes precede parsing and never disclose server bodies", async () => {
  for (const [status, kind] of [[401,"session"],[403,"denied"],[404,"denied"],[400,"validation"],[422,"validation"],[409,"conflict"],[412,"conflict"],[408,"timeout"],[504,"timeout"],[429,"limited"],[502,"provider"],[503,"provider"],[500,"server"]] as const) {
    const response = new Response("<html>secret pupil and SQL details</html>", {status, headers:{"x-request-id":"ref_123"}});
    await assert.rejects(checkedJson(response), (error: unknown) => error instanceof RequestFailure && error.kind === kind && error.digest === "ref_123" && !error.message.includes("secret"));
    assert.equal(failureForStatus(status),kind);
  }
});
test("success envelope, invalid JSON, legacy failure and unsafe references", async () => {
  assert.deepEqual(await checkedJson(Response.json({success:true,data:[]})), {success:true,data:[]});
  assert.deepEqual(await checkedJson(Response.json({members:[]}), {envelope:false}), {members:[]});
  await assert.rejects(checkedJson(Response.json({members:[]})), RequestFailure);
  await assert.rejects(checkedJson(Response.json({success:false,error:"private"})), RequestFailure);
  await assert.rejects(checkedJson(new Response("not json")), RequestFailure);
  await assert.rejects(checkedJson(new Response("", {status:403,headers:{"x-request-id":"private@example.com"}})), (e:unknown) => e instanceof RequestFailure && e.digest === undefined);
});
test("states are exclusive with loading then denial/failure before emptiness", () => {
  assert.equal(resourceState({loading:true,failure:new RequestFailure("denied"),count:3}),"loading");
  assert.equal(resourceState({loading:false,failure:new RequestFailure("denied"),count:0}),"denied");
  assert.equal(resourceState({loading:false,failure:new RequestFailure("server"),count:0}),"failure");
  assert.equal(resourceState({loading:false,count:0}),"no-data");
  assert.equal(resourceState({loading:false,count:0,filtered:true}),"no-match");
  assert.equal(resourceState({loading:false,count:1,filtered:true}),"success");
  assert.equal(requestFailure(new DOMException("time", "TimeoutError")).kind,"timeout");
});

test("malformed successful collections are failures, never empty datasets", async()=>{
  for(const data of [null,{},"invalid",42]) await assert.rejects(checkedListJson(Response.json({success:true,data})),RequestFailure);
  assert.deepEqual((await checkedListJson(Response.json({success:true,data:[]}))).data,[]);
  await assert.rejects(checkedJson(Response.json(null),{envelope:false}),RequestFailure);
});

test("suppressed internal failures do not copy confidential diagnostics into logs", async () => {
  const { userMessage } = await import("../../src/lib/errors");
  const original = console.error, entries: unknown[][] = [];
  console.error = (...args: unknown[]) => { entries.push(args); };
  try {
    assert.equal(userMessage(new Error("PrismaClient secret pupil private-db-host")), "Something went wrong. Please try again.");
    assert.ok(!JSON.stringify(entries).includes("secret pupil"));
    assert.ok(!JSON.stringify(entries).includes("private-db-host"));
    assert.equal(new RequestFailure("provider").message, "A service is unavailable");
  } finally { console.error = original; }
});


test("reads work without newer AbortSignal statics and propagate cancellation", async () => {
  const any = Object.getOwnPropertyDescriptor(AbortSignal, "any");
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  Object.defineProperty(AbortSignal, "any", {value:undefined,configurable:true});
  Object.defineProperty(AbortSignal, "timeout", {value:undefined,configurable:true});
  try {
    const controller = new AbortController();
    let received: AbortSignal | null = null;
    const request = (async (_input, init) => {
      received = init?.signal as AbortSignal;
      assert.equal(init?.cache,"no-store");
      controller.abort();
      assert.equal(received.aborted,true);
      throw new DOMException("Aborted", "AbortError");
    }) as typeof fetch;
    await assert.rejects(readRequest("/synthetic", controller.signal, request), {name:"AbortError"});
    assert.equal((await readRequest("/synthetic",undefined,(async () => Response.json({success:true})) as typeof fetch)).status,200);
  } finally {
    if (any) Object.defineProperty(AbortSignal,"any",any); else Reflect.deleteProperty(AbortSignal,"any");
    if (timeout) Object.defineProperty(AbortSignal,"timeout",timeout); else Reflect.deleteProperty(AbortSignal,"timeout");
  }
});

test("paged selector reads reject a denied later page without returning a partial collection", async () => {
  const { loadListPages } = await import("../../src/lib/lists/load-pages");
  let calls = 0;
  const request = (async () => ++calls === 1 ? Response.json({success:true,data:[{id:"synthetic"}],pagination:{pages:2}}) : new Response("private diagnostic",{status:403})) as typeof fetch;
  await assert.rejects(loadListPages("/synthetic",new URLSearchParams(),request), (error:unknown) => error instanceof RequestFailure && error.kind === "denied");
  assert.equal(calls,2);
});
