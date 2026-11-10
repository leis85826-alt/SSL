import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{},document:{addEventListener(){}},RoadscapePlan:{appearance:{escape:String}}};
vm.runInNewContext(fs.readFileSync(new URL('../web/quantity-estimate.js',import.meta.url),'utf8'),context);
const fillCandidatePrices=q=>JSON.parse(JSON.stringify(context.window.RoadscapeQuantity.fillCandidatePrices(q)));
const row=(id,price=null)=>({id,price,name:'植物'+id,quantity:10});
const candidate=(row_id,price,status='similar')=>({row_id,price,status,reason:'规格需复核',evidence:{source_id:row_id+'-'+price,fileName:'信息价.pdf',location:'第2页',quote:'单价'+price}});
test('bulk fills a review draft, preserves entered and zero prices, keeps missing prices blank',()=>{
 const q={ready:true,calculatedAt:'old',rows:[row('a'),row('b'),row('c',0),row('d',500),row('e')],agent:{kind:'match',result:{matches:[candidate('a',20),candidate('a',30,'exact'),candidate('b',0),candidate('c',100),candidate('d',100),{row_id:'e',status:'missing',price:null}]}}};
 assert.deepEqual(fillCandidatePrices(q),{filled:2,preserved:2,missing:1,conflicts:1});
 assert.deepEqual(q.rows.map(r=>r.price),[30,0,0,500,null]);
 assert.equal(q.rows[0].priceReview.conflict,true);assert.equal(q.rows[0].priceEvidence.source_id,'a-30');
 assert.match(q.rows[0].priceSource,/候选待复核.*信息价.pdf.*第2页/);
 assert.equal(q.ready,false);assert.equal(q.calculatedAt,undefined);assert.equal(q.rows[0].quantity,10);
 assert.deepEqual(fillCandidatePrices(q),{filled:0,preserved:4,missing:1,conflicts:0});
});
test('same-price repeated sources are not price conflicts; invalid/unmapped candidates never populate a row',()=>{
 const q={rows:[row('a'),row('b'),row('c')],agent:{kind:'match',result:{matches:[candidate('a',20),candidate('a',20),candidate('b',NaN),candidate('b',-1),candidate('c',2,'missing'),candidate('unknown',30)]}}};
 assert.deepEqual(fillCandidatePrices(q),{filled:1,preserved:0,missing:2,conflicts:0});
 assert.deepEqual(q.rows.map(r=>r.price),[20,null,null]);
});
