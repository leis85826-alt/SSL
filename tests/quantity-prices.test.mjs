import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{},document:{addEventListener(){}},RoadscapePlan:{appearance:{escape:String}}};
vm.runInNewContext(fs.readFileSync(new URL('../web/quantity-estimate.js',import.meta.url),'utf8'),context);
const fillCandidatePrices=q=>JSON.parse(JSON.stringify(context.window.RoadscapeQuantity.fillCandidatePrices(q)));
const row=(id,price=null)=>({id,price,unit:'株',category:'乔木',name:'植物'+id,quantity:10});
const candidate=(row_id,price,status='similar')=>({row_id,price,status,source_unit:'株',reason:'规格需复核',evidence:{source_id:row_id+'-'+price,fileName:'信息价.pdf',location:'第2页',quote:'单价'+price}});
test('bulk fills a review draft, preserves entered and zero prices, keeps missing prices blank',()=>{
 const q={ready:true,calculatedAt:'old',rows:[row('a'),row('b'),row('c',0),row('d',500),row('e')],agent:{kind:'match',result:{matches:[candidate('a',20),candidate('a',30,'exact'),candidate('b',0),candidate('c',100),candidate('d',100),{row_id:'e',status:'missing',price:null}]}}};
 assert.deepEqual(fillCandidatePrices(q),{filled:2,preserved:2,missing:1,conflicts:1,unresolved:0});
 assert.deepEqual(q.rows.map(r=>r.price),[30,0,0,500,null]);
 assert.equal(q.rows[0].priceReview.conflict,true);assert.equal(q.rows[0].priceEvidence.source_id,'a-30');
 assert.match(q.rows[0].priceSource,/候选待复核.*信息价.pdf.*第2页/);
 assert.equal(q.ready,false);assert.equal(q.calculatedAt,undefined);assert.equal(q.rows[0].quantity,10);
 assert.deepEqual(fillCandidatePrices(q),{filled:0,preserved:4,missing:1,conflicts:0,unresolved:0});
});
test('same-price repeated sources are not price conflicts; invalid/unmapped candidates never populate a row',()=>{
 const q={rows:[row('a'),row('b'),row('c')],agent:{kind:'match',result:{matches:[candidate('a',20),candidate('a',20),candidate('b',NaN),candidate('b',-1),candidate('c',2,'missing'),candidate('unknown',30)]}}};
 assert.deepEqual(fillCandidatePrices(q),{filled:1,preserved:0,missing:2,conflicts:0,unresolved:0});
 assert.deepEqual(q.rows.map(r=>r.price),[20,null,null]);
});

const api=context.window.RoadscapeQuantity;
test('only shrub area rows convert per-plant prices with editable density, with no double multiplication',()=>{
 const r={...row('s'),category:'灌木',unit:'㎡'};api.setCandidatePrice(r,candidate('s',1.2));
 assert.equal(r.density,64);assert.equal(r.priceInput.price,1.2);assert.equal(r.priceInput.unit,'株');assert.equal(r.price,76.8);
 r.density=36;api.refreshPrice(r);assert.equal(r.price,43.2);api.refreshPrice(r);assert.equal(r.price,43.2);
 r.priceInput={price:20,unit:'㎡'};api.refreshPrice(r);assert.equal(r.price,20);
 const tree={...row('tree'),density:64};api.setCandidatePrice(tree,candidate('tree',350));assert.equal(tree.price,350);
 tree.unit='㎡';api.refreshPrice(tree);assert.equal(tree.price,null);
 r.category='地被草坪';r.priceInput={price:1.2,unit:'株'};api.refreshPrice(r);assert.equal(r.price,null);
});
test('unknown units do not silently become area prices; legacy quoted units remain usable',()=>{
 const r={...row('s'),category:'灌木',unit:'㎡'};
 api.setCandidatePrice(r,{...candidate('s',1.2),source_unit:'',evidence:{quote:'单价1.2'}});assert.equal(r.price,null);assert.equal(r.priceInput.price,1.2);
 r.priceInput.unit='株';api.refreshPrice(r);assert.equal(r.price,76.8);
 api.setCandidatePrice(r,{...candidate('s',2),source_unit:undefined,evidence:{quote:'红叶石楠 株 单价2'}});assert.equal(r.price,128);
 assert.equal(api.candidateUnit({evidence:{quote:'每㎡64株'}}),'');
 r.density=0;api.refreshPrice(r);assert.equal(r.price,null);
});
test('manual override preserves raw source and old manual prices stay untouched',()=>{
 const r={...row('s'),category:'灌木',unit:'㎡'};api.setCandidatePrice(r,candidate('s',1.2));r.price=50;r.priceManual=true;
 assert.equal(api.priceInfo(r).price,50);assert.equal(r.priceInput.price,1.2);
 assert.equal(api.priceInfo({...row('old',10),category:'灌木',unit:'㎡'}).price,10);
 r.density=36;api.refreshPrice(r);assert.equal(r.price,43.2);assert.equal(r.priceManual,false);
});
