import assert from 'node:assert/strict';
import test from 'node:test';
import { campusRows, classPerformance } from '../../src/components/insights/metrics';

test('group collection uses money paid, excludes cancelled invoices and keeps zero academic scores',()=>{
  const [row]=campusRows([{id:'north',name:'North',currency:'PKR',invoiceSummary:{PARTIAL:{amount:100000,collected:25000},PAID:{amount:20000,collected:20000},CANCELLED:{amount:50000,collected:50000}},students:[{reportCards:[{percentage:0}]},{reportCards:[{percentage:80}]}]}]);
  assert.equal(row.billed,1200);assert.equal(row.collected,450);assert.equal(row.collectionRate,38);assert.equal(row.average,40);
});

test('legacy partial totals never masquerade as full collections',()=>{
  const [row]=campusRows([{id:'south',name:'South',currency:'PKR',invoiceSummary:{PARTIAL:{amount:100000},PAID:{amount:20000}}}]);
  assert.equal(row.collected,200);
});

test('class averages keep legitimate zero scores and ignore non-finite values',()=>{
 const [row]=classPerformance([{id:'g7',name:'7',students:[{reportCards:[{percentage:0}]},{reportCards:[{percentage:80}]},{reportCards:[{percentage:NaN}]}]}]);
 assert.equal(row.average,40);assert.equal(row.graded,2);
});
