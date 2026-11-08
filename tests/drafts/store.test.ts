import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftKey, DRAFT_TTL, readDraft, conflictingFields, mergeDraft, permittedValues } from '../../src/lib/drafts/store';
const now = 100000;
const draft = { schema: 1, savedAt: now, expiresAt: now + DRAFT_TTL, baseline: { name: 'Old', city: 'A' }, values: { name: 'Draft', city: 'A' } };
function storage(raw: string): Storage {
  const map = new Map([['key', raw]]);
  return { getItem: k => map.get(k) ?? null, setItem: (k,v) => { map.set(k,v); }, removeItem: k => { map.delete(k); }, clear: () => map.clear(), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
}
test('session, school, record and schema isolate keys', () => {
  assert.notEqual(draftKey('account-a:school-a:login-a','record',1),draftKey('account-a:school-a:login-b','record',1));
  assert.notEqual(draftKey('a','record',1),draftKey('a','record',2));
  assert.notEqual(draftKey('a','record',1),draftKey('a','other',1));
});
test('expiry, schema change and malformed drafts purge instead of recovering', () => {
  for (const [raw,schema,time] of [[JSON.stringify(draft),1,now+DRAFT_TTL], [JSON.stringify(draft),2,now], ['{',1,now], [JSON.stringify({...draft,savedAt:now+1}),1,now]] as const) {
    const s=storage(raw);assert.equal(readDraft(s,'key',schema,['name'],time),null);assert.equal(s.length,0);
  }
});
test('only allowlisted fields are persisted and recovered', () => {
  assert.deepEqual(permittedValues({ name:'A',medicalNotes:'secret',password:'secret' },['name']),{name:'A'});
  const s=storage(JSON.stringify({...draft,values:{...draft.values,medicalNotes:'secret'}}));
  assert.deepEqual(readDraft(s,'key',1,['name'],now)?.values,{name:'Draft'});
});
test('concurrent updates require explicit per-field decisions and preserve untouched server fields', () => {
  const current={name:'Server',city:'B'};
  assert.deepEqual(conflictingFields(draft,current),['name']);
  assert.throws(()=>mergeDraft(draft,current,{}),/Resolve/);
  assert.deepEqual(mergeDraft(draft,current,{name:'draft'}),{name:'Draft',city:'B'});
  assert.deepEqual(mergeDraft(draft,current,{name:'server'}),current);
  assert.deepEqual(conflictingFields(draft,{name:'Draft',city:'B'}),[]);
});
