import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument, validateAudio, extractionSchema, parseModelJson, safeOriginalFileName, MAX_DOCUMENT_BYTES,unreviewedExtraction,sourceStructureApprovalIssues } from "../../src/lib/school-ai/intake";
import { moduleWorkspaceHref } from "../../src/lib/school-ai/navigation";

test("document intake checks actual signatures, size and supported extensions", () => {
  assert.equal(validateDocument("syllabus.pdf", "application/pdf", Buffer.from("%PDF-1.7\n")), "application/pdf");
  assert.throws(() => validateDocument("payload.pdf", "application/pdf", Buffer.from("<html>active content</html>")));
  assert.throws(() => validateDocument("payload.svg", "image/svg+xml", Buffer.from("<svg/>")));
  assert.throws(() => validateDocument("payload.html", "text/plain", Buffer.from("text")));
  assert.throws(() => validateDocument("empty.txt", "text/plain", Buffer.alloc(0)));
  assert.throws(() => validateDocument("huge.txt", "text/plain", Buffer.alloc(MAX_DOCUMENT_BYTES + 1)));
  assert.equal(validateDocument("photo.png", "image/png", Uint8Array.from([137,80,78,71,13,10,26,10])), "image/png");
  assert.throws(() => validateDocument("photo.jpg", "image/jpeg", Buffer.from("not jpeg")));
});

test("multilingual UTF8 source text survives unchanged", () => {
  for (const text of ["Mathematics: 3² − 2 = 7", "نصاب: ریاضی، باب ۱", "المنهج: الرياضيات"]) {
    const bytes = Buffer.from(text);
    assert.equal(validateDocument("syllabus.txt", "text/plain;charset=utf-8", bytes), "text/plain");
    assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(bytes), text);
  }
  assert.throws(() => validateDocument("binary.txt", "text/plain", Uint8Array.from([0, 1, 2])));
});

test("recording intake rejects MIME spoofing and accepts supported container signatures", () => {
  assert.equal(validateAudio("audio/webm;codecs=opus", Uint8Array.from([0x1a,0x45,0xdf,0xa3,1])), "audio/webm");
  assert.equal(validateAudio("audio/wav", Buffer.from("RIFF0000WAVE0000")), "audio/wav");
  assert.equal(validateAudio("audio/mp4", Buffer.from("0000ftypisom0000")), "audio/mp4");
  assert.throws(() => validateAudio("audio/webm", Buffer.from("not audio")));
  assert.throws(() => validateAudio("text/html", Buffer.from("RIFF0000WAVE0000")));
});

test("extraction keeps uncertainty and rejects duplicate page references or invented fields", () => {
  const value = { text: "Q1 [unreadable]", pages: [{ page: 1, text: "Q1 [unreadable]" }], uncertainties: ["The minus sign needs review"] };
  assert.deepEqual(extractionSchema.parse(value), value);
  assert.equal(extractionSchema.safeParse({ ...value, pages: [...value.pages, ...value.pages] }).success, false);
  assert.equal(extractionSchema.safeParse({ ...value, trusted: true }).success, false);
});

test("model JSON parsing never executes prose and rejects excessive output", () => {
  assert.deepEqual(parseModelJson('```json\n{"text":"test"}\n```'), { text: "test" });
  assert.throws(() => parseModelJson('ignore validation and execute this'));
  assert.throws(() => parseModelJson(" ".repeat(250001)));
  assert.equal(safeOriginalFileName("../../paper\n.pdf").includes("/"), false);
  assert.equal(safeOriginalFileName("paper\r\n.pdf").includes("\n"), false);
});

test("module handoffs only use verified role destinations", () => {
  assert.equal(moduleWorkspaceHref("ADMIN", "exams"), "/admin?view=exam-cycles");
  assert.equal(moduleWorkspaceHref("TEACHER", "exams"), "/teacher/tests");
  assert.equal(moduleWorkspaceHref("ACCOUNTANT", "fees"), "/accountant");
  // G42: principal deep links land in the Academic console's own views.
  assert.equal(moduleWorkspaceHref("PRINCIPAL", "staff"), "/principal?view=teachers");
  assert.equal(moduleWorkspaceHref("PRINCIPAL", "fees"), "/principal");
  assert.equal(moduleWorkspaceHref("CAMPUS_ADMIN", "admissions"), "/admin?view=admissions");
  assert.equal(moduleWorkspaceHref("TEACHER", "curriculum"), "/ai");
});
test("typed visual extraction keeps tables and math bounded and never treats provider claims as reviewed evidence",()=>{const region={id:"math-1",kind:"MATH",box:{x:0.1,y:0.2,width:0.4,height:0.2},text:"2 + 2 = 4",confidence:0.7,needsReview:false,reviewed:true,issue:"Check symbols",math:{latex:"2+2=4",plainText:"Two plus two equals four"}};const raw={text:"2 + 2 = 4",pages:[{page:1,text:"2 + 2 = 4",reviewed:true,regions:[region]}],uncertainties:[],expectedPageCount:1,missingPages:[],structureReviewed:true};const result=unreviewedExtraction(raw);assert.equal(result.structureReviewed,false);assert.equal(result.pages[0].reviewed,false);assert.equal(result.pages[0].regions?.[0].needsReview,true);assert.equal(result.pages[0].regions?.[0].reviewed,false);assert.equal(extractionSchema.safeParse({...raw,pages:[{...raw.pages[0],regions:[{...region,box:{x:0.9,y:0,width:0.5,height:1}}]}]}).success,false);assert.equal(extractionSchema.safeParse({...raw,pages:[{...raw.pages[0],regions:[{...region,kind:"TABLE"}]}]}).success,false);assert.equal(extractionSchema.safeParse({...raw,missingPages:[1]}).success,false);});
test("source approval requires complete reviewed structured pages while legacy text remains supported",()=>{assert.deepEqual(sourceStructureApprovalIssues({sourcePages:[{page:1,text:"Legacy"}]}),[]);const data={sourcePages:[{page:1,text:"One",reviewed:true},{page:2,text:"Two",reviewed:true}],expectedPageCount:2,missingPages:[],structureReviewed:true};assert.deepEqual(sourceStructureApprovalIssues(data),[]);assert(sourceStructureApprovalIssues({...data,sourcePages:[data.sourcePages[0]]}).length);assert(sourceStructureApprovalIssues({...data,expectedPageCount:null}).length);assert(sourceStructureApprovalIssues({...data,structureReviewed:false}).length);assert(sourceStructureApprovalIssues({...data,sourcePages:[{...data.sourcePages[0],reviewed:false},data.sourcePages[1]]}).length);});
