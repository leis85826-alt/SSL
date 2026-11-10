import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import worker from '../worker/cloudflare-entry.js';
import {drawingInput,validateDrawingResult,parseQuantityOutput} from '../dist/cloudflare/model-worker.mjs';
const env={ROADSCAPE_SESSION_SECRET:randomBytes(32).toString('hex')},origin='https://quantity-only.example',key=randomBytes(24).toString('hex');
const req=(path,body,cookie='',method=body?'POST':'GET')=>new Request(origin+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
function combine(cookie,res){const m=new Map(cookie.split('; ').filter(Boolean).map(c=>[c.split('=')[0],c]));for(const v of res.headers.getSetCookie()){const c=v.split(';')[0];m.set(c.split('=')[0],c);}return [...m.values()].join('; ');}
const events=async r=>(await r.text()).trim().split('\n').map(JSON.parse);
async function setup(){let c='';const first=await worker.fetch(req('/api/quantity/config'),env);c=combine(c,first);const image=await worker.fetch(req('/api/image/config',{apiKey:key},c),env);assert.equal(image.status,200);c=combine(c,image);return c;}
const image={id:'file-1-overview',fileName:'标准段.pdf',page:1,region:'全图',width:800,height:400,data:'data:image/jpeg;base64,/9j/AA=='};
const drawing=()=>({rows:[{part:'侧分带',name:'红叶石楠',spec:'',unit:'㎡',quantity:1000,evidence:{image_id:image.id,bbox:[.1,.2,.3,.1],quote:'红叶石楠1000平方米',method:'label'}}]});
test('quantity config is separate from image config and key reuse requires explicit opt-in',async()=>{let c=await setup();assert.equal((await (await worker.fetch(req('/api/quantity/config',undefined,c),env)).json()).configured,false);const denied=await worker.fetch(req('/api/quantity/config',{model:'deepseek-v4.1-flash'},c),env);assert.equal(denied.status,400);const saved=await worker.fetch(req('/api/quantity/config',{reuseImageKey:true},c),env);assert.equal(saved.status,200);c=combine(c,saved);assert.equal((await saved.json()).model,'deepseek-v4.1-flash');const imageConfig=await (await worker.fetch(req('/api/image/config',undefined,c),env)).json();assert.equal(imageConfig.model,'banana-2.1');assert.equal(imageConfig.configured,true);const textConfig=await (await worker.fetch(req('/api/model/config',undefined,c),env)).json();assert.equal(textConfig.configured,false);const del=await worker.fetch(req('/api/quantity/config',undefined,c,'DELETE'),env);c=combine(c,del);assert.equal((await (await worker.fetch(req('/api/image/config',undefined,c),env)).json()).configured,true);assert.equal((await (await worker.fetch(req('/api/quantity/config',undefined,c),env)).json()).configured,false);});
test('drawing route uses quantity DeepSeek configuration, sends images and preserves model scopes',async()=>{let c=await setup();c=combine(c,await worker.fetch(req('/api/quantity/config',{reuseImageKey:true},c),env));const old=global.fetch;let calls=0;global.fetch=async(url,opts)=>{calls++;const body=JSON.parse(opts.body);assert.equal(body.model,'deepseek-v4.1-flash');assert.equal(opts.headers.Authorization,'Bearer '+key);assert.ok(body.messages[1].content.some(x=>x.type==='image_url'&&x.image_url.url===image.data));return new Response(JSON.stringify({choices:[{message:{content:'以下是统计候选：\n```json\n'+JSON.stringify(drawing())+'\n```'}}]}),{headers:{'Content-Type':'application/json'}});};try{const result=await events(await worker.fetch(req('/api/quantity/drawing',{images:[image]},c),env)),value=result.find(r=>r.type==='result').data;assert.equal(value.rows[0].quantity,1000);assert.equal(value.rows[0].evidence.kind,'visual');assert.equal(value.model,'deepseek-v4.1-flash');assert.equal(calls,1);}finally{global.fetch=old;}});
test('drawing candidates require bounded location and count boxes, reject duplicate counting',()=>{const data=drawingInput({images:[image]});assert.equal(validateDrawingResult(drawing(),data).rows[0].quantity,1000);let r=drawing();r.rows[0].evidence.bbox=[0,0,2,1];assert.throws(()=>validateDrawingResult(r,data));r=drawing();r.rows[0].quantity=2;r.rows[0].unit='株';r.rows[0].evidence={image_id:image.id,method:'symbol_count',quote:'香樟A',bbox:[0,0,1,1],count_boxes:[[.1,.1,.1,.1],[.1,.1,.1,.1]]};assert.throws(()=>validateDrawingResult(r,data));r.rows[0].evidence.count_boxes=[[.1,.1,.1,.1],[.3,.1,.1,.1]];assert.equal(validateDrawingResult(r,data).rows[0].quantity,2);});
test('model/image sessions alone cannot authorize the dedicated quantity route',async()=>{const c=await setup();const r=await worker.fetch(req('/api/quantity/drawing',{images:[image]},c),env);assert.equal(r.status,401);assert.throws(()=>drawingInput({images:[{...image,data:'https://untrusted/image.jpg'}]}));});

test('quantity parser accepts JSON wrappers without requiring design parts',()=>{
 const value=drawing(),raw=JSON.stringify(value);
 for(const content of [raw,'```json\n'+raw+'\n```','识别结果：\n'+raw+'\n请人工核对。',JSON.stringify(raw),JSON.stringify({data:value}),JSON.stringify(value.rows)])assert.deepEqual(parseQuantityOutput(content),value);
 assert.deepEqual(parseQuantityOutput('```json\n{"matches":[]}\n```','matches'),{matches:[]});
 assert.equal(parseQuantityOutput('结果：{"code":"123456"}','code').code,'123456');
 assert.throws(()=>parseQuantityOutput('无法读取图片，请重新上传'),/没有返回可识别/);
 assert.throws(()=>parseQuantityOutput('{"rows":['),/不完整/);
 assert.throws(()=>parseQuantityOutput(raw+'\n{"rows":[]}'),/多份/);
 assert.throws(()=>parseQuantityOutput(raw+'\n{"rows":['),/不完整/);
 assert.throws(()=>parseQuantityOutput('{"parts":{}}'),/没有返回可识别/);
});
test('drawing errors expose bounded final output, redact secrets and never retry',async()=>{
 let c=await setup();c=combine(c,await worker.fetch(req('/api/quantity/config',{reuseImageKey:true},c),env));
 const old=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'<think>private reasoning</think>无法读取图片 '+key+' data:image/png;base64,AAAA'}}]}),{headers:{'Content-Type':'application/json'}});};
 try{const result=await events(await worker.fetch(req('/api/quantity/drawing',{images:[image]},c),env));const error=result.find(e=>e.type==='error');assert.match(error.message,/没有返回可识别/);assert.match(error.rawOutput,/无法读取图片/);assert.ok(!error.rawOutput.includes(key));assert.ok(!error.rawOutput.includes('private reasoning'));assert.ok(!error.rawOutput.includes('base64'));assert.ok(error.rawOutput.length<=6000);assert.equal(result.some(e=>e.type==='result'),false);assert.equal(calls,1);}finally{global.fetch=old;}
});

test('verified tree symbol counts use stocks even if the model labels the count as an area',()=>{
 const r=drawing();Object.assign(r.rows[0],{part:'行道树带',name:'香樟',category:'其他',unit:'㎡',quantity:2});r.rows[0].evidence={image_id:image.id,method:'symbol_count',quote:'香樟',bbox:[0,0,1,1],count_boxes:[[.1,.1,.1,.1],[.3,.1,.1,.1]]};
 const tree=validateDrawingResult(r,drawingInput({images:[image]})).rows[0];assert.equal(tree.unit,'株');assert.equal(tree.category,'乔木');assert.equal(tree.quantity,2);
});
