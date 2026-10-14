import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

type Control = { kind: string; attrs: Record<string, string> };
type Baseline = { file: string; controls: Control[]; requests: string[] };
const baseline = JSON.parse(readFileSync('tests/design-system/component-adoption/behavior-contracts.json','utf8')) as Baseline[];
const attributes = new Set(['value','defaultValue','checked','defaultChecked','onChange','onClick','onSubmit','type','disabled','min','max','minLength','maxLength','required','readOnly','ref','name','form','accept','multiple','pattern','step','autoComplete','inputMode','formAction','action','id','role','tabIndex','aria-label','aria-labelledby','aria-describedby','aria-invalid','aria-required','aria-checked','aria-selected','aria-current','onKeyDown']);
const aliases: Record<string,string> = {Button:'button',MotionButton:'button',FieldAction:'button',Input:'input',SystemInput:'input',Select:'select',SystemSelect:'select',Textarea:'textarea',SystemTextarea:'textarea',Checkbox:'input','motion.button':'button'};
function inspect(file: string) {
 const source = ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const controls: Control[] = []; const requests: string[] = []; const native: string[] = [];
 function visit(node: ts.Node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
   const tag=node.tagName.getText(source);
   const role=node.attributes.properties.find(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(source)==='role') as ts.JsxAttribute | undefined;
   const kind=tag==='div'&&role?.initializer?.getText(source)==='"button"'?'button':aliases[tag]||tag;
   if(['button','input','select','textarea'].includes(kind)) {
    const attrs: Record<string,string> = {};
    for(const attribute of node.attributes.properties) {
     if(ts.isJsxSpreadAttribute(attribute))attrs['spread'+Object.keys(attrs).length]=attribute.expression.getText(source).replace(/\s+/g,' ');
     if(ts.isJsxAttribute(attribute)&&attributes.has(attribute.name.getText(source)))attrs[attribute.name.getText(source)]=attribute.initializer?.getText(source).replace(/\s+/g,' ')||'true';
    }
    if(tag==='Checkbox')attrs.type='"checkbox"';
    controls.push({kind,attrs});
    if(['button','input','select','textarea','motion.button'].includes(tag)&&!(tag==='input'&&attrs.type==='"file"'))native.push(tag);
   }
  }
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='fetch')requests.push(node.getText(source).replace(/\s+/g,' '));
  ts.forEachChild(node,visit);
 }
 visit(source); return {controls,requests,native};
}
for(const before of baseline)test(`preserves request and native control contracts: ${before.file}`,()=>{
 const after=inspect(before.file);
 assert.deepEqual(after.native,[],'ordinary controls must use the shared components; native upload input is intentionally retained');
 assert.deepEqual(after.requests,before.requests,'request targets, methods and payload expressions changed');
 assert.equal(after.controls.length,before.controls.length,'control was lost or added without updating the scoped review');
 before.controls.forEach((control,index)=>{
  assert.equal(after.controls[index].kind,control.kind);
  for(const [name,value]of Object.entries(control.attrs))assert.equal(after.controls[index].attrs[name],value,`control ${index}: ${name}`);
 });
});
