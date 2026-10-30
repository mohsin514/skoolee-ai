import assert from "node:assert/strict";
import {test} from "node:test";
import {advanceVoiceActivity} from "../../src/lib/school-ai/voice";
test("voice waits for sustained speech and a real pause; silence never submits chat",()=>{let state={startedAt:0,lastSpeechAt:0,voicedMs:0};for(let i=100;i<=1000;i+=100){const r=advanceVoiceActivity(state,0,i);state=r.next;assert.equal(r.empty,true);}for(let i=1100;i<=1600;i+=100){const r=advanceVoiceActivity(state,.3,i);state=r.next;assert.equal(r.finish,false);}assert.equal(advanceVoiceActivity(state,0,2000).finish,false);const ended=advanceVoiceActivity(state,0,3000);assert.equal(ended.finish,true);assert.equal(ended.empty,false);});
