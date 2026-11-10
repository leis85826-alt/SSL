import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import worker from '../worker/cloudflare-entry.js';
import {quantityInput,validateQuantityResult} from '../dist/cloudflare/model-worker.mjs';
const origin='https://quantity-test.example',env={ROADSCAPE_SESSION_SECRET:randomBytes(32).toString('hex')},apiKey=randomBytes(24).toString('hex');
const req=(path,method='GET',body,cookie='')=>new Request(origin+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const payload=()=>({mode:'match',documents:[{id:'source-1',fileName:'杭州信息价.xlsx',location:'苗木 · 第3行',text:'香樟 胸径15cm 单价350元/株'}],rows:[{id:'row-1',name:'香樟',spec:'胸径15cm',unit:'株'}]});
const answer=()=>({matches:[{row_id:'row-1',status:'exact',source_unit:'株',price:350,reason:'规格和单位一致，地区和期次需人工核对。',evidence:{source_id:'source-1',quote:'香樟 胸径15cm 单价350元/株'}}]});
async function configured(){const first=await worker.fetch(req('/api/model/config'),env),browser=first.headers.getSetCookie().find(c=>c.startsWith('__Host-roadscape-browser=')).split(';')[0];const response=await worker.fetch(req('/api/model/config','POST',{apiKey,model:'saved-quantity-model'},browser),env);assert.equal(response.status,200);return browser+'; '+response.headers.getSetCookie().find(c=>c.startsWith('__Host-roadscape-model=')).split(';')[0];}
const events=async r=>(await r.text()).trim().split('\n').map(JSON.parse);
test('requires documents and bounded valid rows before model dispatch',()=>{assert.throws(()=>quantityInput({mode:'extract',documents:[]}));const p=payload();p.rows=[null];assert.throws(()=>quantityInput(p));assert.throws(()=>quantityInput({...payload(),documents:[...payload().documents,...payload().documents]}));});
test('evidence binds each candidate to exact source text and original numeric price',()=>{const p=payload(),a=answer(),r=validateQuantityResult(a,p);assert.equal(r.matches[0].evidence.fileName,'杭州信息价.xlsx');assert.equal(r.matches[0].status,'similar');a.matches[0].price=351;assert.throws(()=>validateQuantityResult(a,p));a.matches[0].price=350;a.matches[0].evidence.quote='捏造报价350';assert.throws(()=>validateQuantityResult(a,p));});
test('unknown references and duplicated row IDs rejected, missing rows remain missing',()=>{const p=payload();assert.equal(validateQuantityResult({matches:[]},p).matches[0].price,null);const a=answer();a.matches.push({...a.matches[0]});assert.throws(()=>validateQuantityResult(a,p));a.matches=[{...a.matches[0],row_id:'not-a-row'}];assert.throws(()=>validateQuantityResult(a,p));});
test('standard quantities also require quoted source values',()=>{const p={mode:'extract',documents:[{id:'s',fileName:'标准段.csv',location:'第2行',text:'侧分带 香樟 胸径15cm 株 20'}]},a={rows:[{part:'侧分带',name:'香樟',spec:'胸径15cm',unit:'株',quantity:20,evidence:{source_id:'s',quote:'侧分带 香樟 胸径15cm 株 20'}}]};assert.equal(validateQuantityResult(a,p).rows[0].quantity,20);a.rows[0].quantity=21;assert.throws(()=>validateQuantityResult(a,p));});
test('quantity endpoint reuses saved model/key and returns grounded candidate without applying price',async()=>{const cookie=await configured(),old=global.fetch;let calls=0;global.fetch=async(url,opts)=>{calls++;assert.ok(String(url).endsWith('/chat/completions'));assert.equal(opts.headers.Authorization,'Bearer '+apiKey);const body=JSON.parse(opts.body);assert.equal(body.model,'saved-quantity-model');assert.ok(body.messages[0].content.includes('待分析数据'));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer())}}]}),{headers:{'Content-Type':'application/json'}});};try{const out=await events(await worker.fetch(req('/api/model/quantity','POST',payload(),cookie),env));const result=out.find(e=>e.type==='result').data;assert.equal(result.matches[0].price,350);assert.equal(result.model,'saved-quantity-model');assert.equal(calls,1);}finally{global.fetch=old;}});
test('fabricated model price returns error and does not retry',async()=>{const cookie=await configured(),old=global.fetch;let calls=0;global.fetch=async()=>{calls++;const a=answer();a.matches[0].price=999;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(a)}}]}),{headers:{'Content-Type':'application/json'}});};try{const out=await events(await worker.fetch(req('/api/model/quantity','POST',payload(),cookie),env));assert.ok(out.some(e=>e.type==='error'));assert.ok(!out.some(e=>e.type==='result'));assert.equal(calls,1);}finally{global.fetch=old;}});
test('unauthenticated quantity request cannot dispatch upstream',async()=>{const r=await worker.fetch(req('/api/model/quantity','POST',payload()),env);assert.equal(r.status,401);});

test('price matching preserves original per-plant unit and raw amount for local density conversion',()=>{
 const p=payload();p.region='杭州';p.period='2026-11';p.rows[0].unit='㎡';p.rows[0].category='灌木';
 const a=answer();a.matches[0].status='similar';const r=validateQuantityResult(a,p).matches[0];
 assert.equal(r.price,350);assert.equal(r.source_unit,'株');
 a.matches[0].source_unit='㎡';assert.equal(validateQuantityResult(a,p).matches[0].source_unit,'');
 delete a.matches[0].source_unit;assert.equal(validateQuantityResult(a,p).matches[0].status,'similar');
});

test('null prices remain unresolved with grounded text evidence instead of becoming numeric errors or zero',()=>{
 const p=payload();p.documents[0].text='香樟 P20以下 株 1.46 1.60';
 for(const status of ['similar','exact','missing']){
  const a=answer();Object.assign(a.matches[0],{status,price:null,reason:'规格档和含税/除税列未确定，资料2023-03与项目2026-02不一致。',evidence:{source_id:'source-1',quote:p.documents[0].text}});
  const m=validateQuantityResult(a,p).matches[0];assert.equal(m.status,'missing');assert.equal(m.price,null);assert.equal(m.evidence.quote,p.documents[0].text);assert.match(m.reason,/2023-03/);
 }
 const a=answer();a.matches[0].price=null;a.matches[0].evidence.source_id='unknown';const m=validateQuantityResult(a,p).matches[0];assert.equal(m.evidence,undefined);assert.match(m.reason,/无法与原文件核对/);
});
test('one unresolved price does not discard valid prices in the same model response',async()=>{
 const cookie=await configured(),p=payload();p.rows.push({id:'row-2',name:'红叶石楠',spec:'',unit:'㎡'});p.documents.push({id:'source-2',fileName:'宁波信息价.pdf',location:'第40页',text:'红叶石楠 H31-40 株 0.84 0.91'});
 const a=answer();a.matches.push({row_id:'row-2',status:'similar',price:null,reason:'两列价格未确定计价口径，请人工核对。',evidence:{source_id:'source-2',quote:p.documents[1].text}});
 const old=global.fetch;let calls=0;global.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(a)}}]}),{headers:{'Content-Type':'application/json'}});};
 try{const out=await events(await worker.fetch(req('/api/model/quantity','POST',p,cookie),env));assert.equal(out.some(e=>e.type==='error'),false);const matches=out.find(e=>e.type==='result').data.matches;assert.equal(matches[0].price,350);assert.equal(matches[1].price,null);assert.equal(matches[1].evidence.fileName,'宁波信息价.pdf');assert.equal(calls,1);}finally{global.fetch=old;}
});

test('street-tree rows keep their count and category even if the model omits or mislabels the category',()=>{
 const text='行道树 香樟 株 40',p={mode:'extract',documents:[{id:'tree',fileName:'标准段.csv',location:'第2行',text}]};
 const result=validateQuantityResult({rows:[{part:'行道树带',name:'香樟',spec:'',category:'灌木',unit:'株',quantity:40,evidence:{source_id:'tree',quote:text}}],warnings:['右侧树列数量尚未确认，请核对。']},p);
 assert.equal(result.rows[0].category,'乔木');assert.equal(result.rows[0].unit,'株');assert.equal(result.rows[0].quantity,40);assert.equal(result.warnings[0],'右侧树列数量尚未确认，请核对。');
});
