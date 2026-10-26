import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "../../src/components/shared-admin/workspace";
const rows = [{id:"a",name:"Synthetic A",date:"2026-01-01"},{id:"b",name:"Synthetic B",date:null}];
for(const view of ["table","grid","calendar"] as const) test(`${view} preserves identity, actions, selections and denied controls`,()=>{
  const html=renderToStaticMarkup(<DataTable view={view} rows={rows} rowKey={r=>r.id} selected={new Set(["a"])} onToggleSelect={()=>{}}
    onRowClick={()=>{}} getCalendarDate={r=>({value:r.date,kind:"date"})}
    columns={[{key:"name",label:"Name",render:r=>r.name},{key:"action",label:"Action",render:r=><button disabled={r.id==="b"}>Review {r.id}</button>}]}/>);
  for(const value of ["Synthetic A","Synthetic B","Open Synthetic A","Deselect Synthetic A","Select Synthetic B"]) assert.ok(html.includes(value));
  assert.match(html, /<button disabled="">Review b<\/button>/);
  assert.equal((html.match(/Review a/g)||[]).length,1);
  if(view==="calendar") assert.match(html,/No valid date/);
});
