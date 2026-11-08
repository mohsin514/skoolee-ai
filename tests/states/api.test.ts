import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, ValidationError, errorResponse } from "../../src/lib/api/scope";

test("shared API keeps status and field contracts while issuing opaque correlation IDs", async()=>{
  for(const error of [new ApiError("Not permitted",403),new ApiError("Changed",409),new ValidationError({title:["Required"]})]){
    const response=errorResponse(error);
    assert.equal(response.status,error.status);
    assert.match(response.headers.get("x-request-id")??"",/^[0-9a-f-]{36}$/);
    const body=await response.json();
    if(error instanceof ValidationError) assert.deepEqual(body.details,{title:["Required"]});
    else assert.equal(body.error,error.message);
  }
});
test("unexpected API failures log correlation metadata, never confidential exception content",async()=>{
  const calls:unknown[][]=[];const original=console.error;console.error=(...args:unknown[])=>{calls.push(args);};
  try{
    const response=errorResponse(new Error("private student medical details and SQL"),"Could not load");
    assert.equal(response.status,500);
    assert.deepEqual(await response.json(),{error:"Could not load"});
    assert.equal((calls[0][1] as {requestId:string}).requestId,response.headers.get("x-request-id"));
    assert.doesNotMatch(JSON.stringify(calls),/private|student|SQL/);
  }finally{console.error=original;}
});
