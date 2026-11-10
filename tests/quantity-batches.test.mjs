import test from 'node:test';
import assert from 'node:assert/strict';
import {planBatches,combineResults} from '../web/quantity-batches.mjs';
import {quantityInput,validateQuantityResult} from '../dist/cloudflare/model-worker.mjs';
const common={mode:'match',rows:[{id:'r1',name:'香樟',spec:'胸径15cm',unit:'株'}],region:'杭州',period:'2026-11'};
const doc=(id,text)=>({id:String(id),text,fileName:Number(id)%2?'信息价一.xlsx':'信息价二.pdf',location:'原文位置'});
test('all large-file passages survive batching within worker text, count and UTF8 limits',()=>{
 const docs=Array.from({length:2500},(_,i)=>doc(i,'香樟 胸径15cm 单价350元 '+ '文字'.repeat(90)));
 const batches=planBatches(docs,common);
 assert.ok(docs.reduce((s,d)=>s+d.text.length,0)>160000);assert.ok(batches.length>1);
 assert.deepEqual(batches.flat(),docs);
 for(const documents of batches){const payload={...common,documents};quantityInput(payload);assert.ok(Buffer.byteLength(JSON.stringify(payload))<=450000);assert.ok(documents.length<=400);}
});
test('oversized local workload is rejected before model calls',()=>{
 assert.throws(()=>planBatches(Array.from({length:16401},(_,i)=>doc(i,'短文')),common),/40批/);
 assert.throws(()=>planBatches([doc(1,'x'.repeat(4001))],common),/单段/);
});
test('conflicting prices from batches stay as separate candidates and false missing rows are removed',()=>{
 const candidate=(price,source)=>({row_id:'r1',status:'similar',price,evidence:{source_id:source,quote:'单价'+price}});
 const a=candidate(350,'a'),b=candidate(400,'b');
 const results=[{matches:[{row_id:'r1',status:'missing'},a]},{matches:[a,b]}];
 assert.deepEqual(combineResults('match',results,[...common.rows,{id:'r2'}]).matches,[a,b,{row_id:'r2',status:'missing',price:null,reason:'本次各批资料中未找到可靠单价候选，请人工查阅。'}]);
 assert.deepEqual(combineResults('extract',[{rows:[{name:'a'}]},{rows:[{name:'b'}]}]),{rows:[{name:'a'},{name:'b'}]});
});

test('empty extraction batch can be combined without inventing quantities',()=>{assert.deepEqual(validateQuantityResult({rows:[]},{mode:'extract',documents:[doc(1,'表头或说明，无明确数量')]}),{rows:[]});assert.deepEqual(combineResults('extract',[{rows:[]},{rows:[{name:'香樟',quantity:20}]}]),{rows:[{name:'香樟',quantity:20}]});});

test('batch aggregation keeps meaningful unresolved reasons and quotes without hiding a later valid price',()=>{
 const detail={row_id:'r1',status:'missing',price:null,reason:'资料期次不符，未确定价格列。',evidence:{source_id:'pdf-40',quote:'红叶石楠 株 0.84 0.91'}},priced={row_id:'r2',status:'similar',price:20,evidence:{source_id:'p',quote:'20'}};
 const results=[{matches:[{row_id:'r1',status:'missing',price:null,reason:'本批未找到。'},{row_id:'r2',status:'missing',price:null,reason:'本批未找到。'}]},{matches:[detail,priced]}];
 const merged=combineResults('match',results,[{id:'r1'},{id:'r2'}]).matches;assert.equal(merged.find(m=>m.row_id==='r1').reason,detail.reason);assert.equal(merged.find(m=>m.row_id==='r1').evidence.quote,detail.evidence.quote);assert.equal(merged.filter(m=>m.row_id==='r2').length,1);assert.equal(merged.find(m=>m.row_id==='r2').price,20);
});
