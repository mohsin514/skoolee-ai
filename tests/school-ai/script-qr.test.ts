import test from "node:test";
import assert from "node:assert/strict";
import { scriptCodeFromQr } from "../../src/lib/school-ai/script-qr";
test("script QR parsing accepts only one bounded code without interpreting identity or visiting URLs",()=>{
 assert.equal(scriptCodeFromQr([" abc.def.ghi "]),"abc.def.ghi");
 assert.equal(scriptCodeFromQr(["abc.def.ghi","abc.def.ghi"]),"abc.def.ghi");
 for(const input of [[],["https://example.invalid"],["abc.def.ghi","jkl.mno.pqr"],["abc.def.ghi","unknown"],[`${"a".repeat(3000)}.b.c`],["a.b.c\n<script>"]])assert.throws(()=>scriptCodeFromQr(input));
});
