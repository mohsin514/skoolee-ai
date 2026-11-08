import test from "node:test";
import assert from "node:assert/strict";
import { assessmentFixture } from "./assessment-fixture";
import { validateScriptResponseProposal } from "../../src/lib/school-ai/script-response";
const paper=assessmentFixture("subject","class").paper;
const proposal=()=>({answers:[{questionId:"q1",response:"a1",sourceQuote:"4"},{questionId:"q3",response:"I combine the quantities.",sourceQuote:"I combine the quantities."}],unmatchedQuestionIds:["q2"],uncertainties:["Second response is unreadable."]});
test("script mappings retain exact learner evidence and explicitly account for every unanswered question",()=>{const value=proposal();assert.deepEqual(validateScriptResponseProposal(value,paper,"4\nI combine the quantities."),value);});
test("script mappings reject invented answers, wrong choice evidence, duplicate IDs and omitted unresolved questions",()=>{const source="4\nI combine the quantities.";for(const value of [{...proposal(),answers:[...proposal().answers,{questionId:"q1",response:"a1",sourceQuote:"4"}]},{...proposal(),unmatchedQuestionIds:[]},{...proposal(),answers:[{questionId:"q1",response:"a2",sourceQuote:"4"},proposal().answers[1]]},{...proposal(),answers:[proposal().answers[0],{questionId:"q3",response:"Invented solution",sourceQuote:"I combine the quantities."}]},{...proposal(),answers:[proposal().answers[0],{questionId:"q3",response:"Invented solution",sourceQuote:"Invented solution"}]}])assert.throws(()=>validateScriptResponseProposal(value,paper,source));});
