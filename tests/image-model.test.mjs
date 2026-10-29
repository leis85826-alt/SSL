import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import worker from '../worker/cloudflare-entry.js';
const env = { ROADSCAPE_SESSION_SECRET: randomBytes(32).toString('hex') }, origin = 'https://image-test.example', apiKey = randomBytes(24).toString('hex');
const request = (path, method = 'GET', body, cookie = '') => new Request(origin + path, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const cookieValue = (response, name) => response.headers.getSetCookie().find(c => c.startsWith(name + '='))?.split(';')[0];
function combine(previous, response) { const cookies = new Map(previous.split('; ').filter(Boolean).map(c => [c.split('=')[0], c])); for (const c of response.headers.getSetCookie()) cookies.set(c.split('=')[0], c.split(';')[0]); return [...cookies.values()].join('; '); }
async function configure() {
  const initial = await worker.fetch(request('/api/image/config'), env); let cookie = combine('', initial);
  const saved = await worker.fetch(request('/api/image/config', 'POST', { apiKey }, cookie), env);
  assert.equal(saved.status, 200); cookie = combine(cookie, saved); return { cookie, saved };
}
const input = { prompt: '合成绿化方案效果图，不调用真实服务', project_id: 'test-project', source_digest: 'a'.repeat(64), params: { aspectRatio: '16:9', imageSize: '1K', thinkingLevel: 'minimal', web_search: false } };
async function create(cookie) { const response = await worker.fetch(request('/api/image/generate', 'POST', input, cookie), env); assert.equal(response.status, 201); return response.json(); }
const success = { task_id: 123456, state: 'success', is_final: true, result_type: 'image', result_url: 'https://cdn.provider.com/image.png?signature=test', cost: .23 };

test('image configuration is separate, persistent and reuses same-address chat key only with explicit selection', async () => {
  const initial = await worker.fetch(request('/api/model/config'), env); let cookie = combine('', initial);
  const chat = await worker.fetch(request('/api/model/config', 'POST', { apiKey }, cookie), env); cookie = combine(cookie, chat);
  const missing = await worker.fetch(request('/api/image/config', 'POST', {}, cookie), env); assert.equal(missing.status, 400);
  const image = await worker.fetch(request('/api/image/config', 'POST', { useChatKey: true }, cookie), env); assert.equal(image.status, 200); cookie = combine(cookie, image);
  assert.match(image.headers.getSetCookie().find(c => c.startsWith('__Host-roadscape-image=')), /Secure; HttpOnly; SameSite=Strict; Max-Age=7776000/);
  assert.ok(!(await image.text()).includes(apiKey));
  assert.equal((await (await worker.fetch(request('/api/model/config', 'GET', undefined, cookie), env)).json()).model, 'deepseek-v4-pro');
  assert.equal((await (await worker.fetch(request('/api/image/config', 'GET', undefined, cookie), env)).json()).model, 'banana-2.1');
  const removed = await worker.fetch(request('/api/image/config', 'DELETE', undefined, cookie), env);
  assert.match(removed.headers.getSetCookie()[0], /Max-Age=0/);
  cookie = combine(cookie, removed);
  assert.equal((await (await worker.fetch(request('/api/model/config', 'GET', undefined, cookie), env)).json()).configured, true);
  assert.equal((await worker.fetch(request('/api/image/config', 'POST', { baseURL: 'https://other.provider.com/v1', useChatKey: true }, cookie), env)).status, 400);
});

test('create is exactly one media request with fixed n=1; only is_final/state control polling result', async () => {
  const { cookie } = await configure(), originalFetch = globalThis.fetch; let creates = 0, statuses = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer ' + apiKey);
    if (String(url).endsWith('/media/generate')) {
      creates++; const body = JSON.parse(options.body); assert.equal(body.model, 'banana-2.1'); assert.equal(body.params.n, 1); assert.equal(body.params.imageSize, '1K'); assert.deepEqual(Object.keys(body).sort(), ['model','params','prompt']);
      return Response.json({ code: 200, data: { task_id: 123456 }, msg: '任务创建成功' });
    }
    assert.equal(String(url), 'https://api.lk888.ai/v1/media/status?task_id=123456'); statuses++;
    if (statuses === 1) return Response.json({ ...success, status: '已完成', state: 'running', is_final: false, progress: '45%' });
    return Response.json({ ...success, status: '处理中' });
  };
  try {
    const task = await create(cookie); assert.ok(!JSON.stringify(task).includes(apiKey));
    const first = await (await worker.fetch(request('/api/image/status', 'POST', { ticket: task.ticket }, cookie), env)).json();
    assert.equal(first.is_final, false); assert.equal(first.result_url, undefined);
    const final = await (await worker.fetch(request('/api/image/status', 'POST', { ticket: task.ticket }, cookie), env)).json();
    assert.equal(final.state, 'success'); assert.equal(final.result_url, success.result_url); assert.equal(final.source_digest, input.source_digest); assert.equal(final.project_id, input.project_id);
    assert.equal(creates, 1); assert.equal(statuses, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('task tickets reject tampering, other browsers, expiry and changed credentials', async () => {
  const a = await configure(), b = await configure(), originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: 200, data: { task_id: 123456 } });
  try {
    const task = await create(a.cookie);
    for (const [ticket, cookie] of [[task.ticket + 'bad', a.cookie], [task.ticket, b.cookie]]) assert.equal((await worker.fetch(request('/api/image/status', 'POST', { ticket }, cookie), env)).status, 401);
    const now = Date.now;
    try { Date.now = () => now() + 25 * 3600000; assert.equal((await worker.fetch(request('/api/image/status', 'POST', { ticket: task.ticket }, a.cookie), env)).status, 401); } finally { Date.now = now; }
    const changed = await worker.fetch(request('/api/image/config', 'POST', { apiKey: randomBytes(24).toString('hex') }, a.cookie), env);
    assert.equal((await worker.fetch(request('/api/image/status', 'POST', { ticket: task.ticket }, combine(a.cookie, changed)), env)).status, 409);
  } finally { globalThis.fetch = originalFetch; }
});

test('failed, inconsistent or unsafe results never become successful images; errors redact keys', async () => {
  const { cookie } = await configure(), originalFetch = globalThis.fetch; let result;
  globalThis.fetch = async url => String(url).endsWith('/media/generate') ? Response.json({ code: 200, data: { task_id: 123456 } }) : Response.json(result);
  try {
    const task = await create(cookie);
    result = { task_id: 123456, state: 'failed', is_final: true, error: 'Denied ' + apiKey };
    const failed = await (await worker.fetch(request('/api/image/status', 'POST', { ticket: task.ticket }, cookie), env)).json(); assert.equal(failed.state, 'failed'); assert.ok(!failed.error.includes(apiKey)); assert.equal(failed.result_url, undefined);
    for (const invalid of [{ ...success, task_id: 999 }, { ...success, result_type: 'video' }, { ...success, result_url: 'javascript:alert(1)' }, { ...success, result_url: 'https://127.0.0.1/x' }, { ...success, state: '已完成' }, { ...success, is_final: 'true' }, { ...success, result_url: 'https://cdn.provider.com/x?key=' + apiKey }]) {
      result = invalid; const response = await worker.fetch(request('/api/image/status', 'POST', { ticket: task.ticket }, cookie), env); assert.ok(response.status >= 400); assert.equal((await response.json()).result_url, undefined);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('image parameters, missing credentials and origin checks fail before a paid request', async () => {
  const { cookie } = await configure(), originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('not allowed'); };
  try {
    for (const params of [{ ...input.params, imageSize: '8K' }, { ...input.params, aspectRatio: 'invalid' }, { ...input.params, n: 2 }, { ...input.params, images: ['https://private.invalid/x'] }]) assert.equal((await worker.fetch(request('/api/image/generate', 'POST', { ...input, params }, cookie), env)).status, 400);
    assert.equal((await worker.fetch(request('/api/image/generate', 'POST', input), env)).status, 401);
    const wrong = new Request(request('/api/image/generate', 'POST', input, cookie), { headers: { Origin: 'https://evil.invalid', Cookie: cookie } });
    assert.equal((await worker.fetch(wrong, env)).status, 403); assert.equal(calls, 0);
    assert.equal((await worker.fetch(request('/api/model/config', 'POST', { apiKey, model: 'banana-2.1' }, cookie), env)).status, 400);
  } finally { globalThis.fetch = originalFetch; }
});

test('connection check reads model list only; provider errors and redirects do not retry creation', async () => {
  const { cookie } = await configure(), originalFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); return Response.json({ data: [{ id: 'banana-2.1' }] }); };
  try {
    assert.equal((await worker.fetch(request('/api/image/test', 'GET', undefined, cookie), env)).status, 200);
    assert.deepEqual(calls, ['https://api.lk888.ai/v1/models']);
    for (const mode of ['redirect','error','timeout']) {
      let count = 0; globalThis.fetch = async () => { count++; if (mode === 'timeout') throw new DOMException('Timed out','AbortError'); return mode === 'redirect' ? new Response(null, { status: 302, headers: { Location: 'https://elsewhere.invalid' } }) : Response.json({ error: { message: 'Denied ' + apiKey } }, { status: 401 }); };
      const response = await worker.fetch(request('/api/image/generate', 'POST', input, cookie), env); assert.equal(response.status, 502); assert.equal(count, 1); assert.ok(!(await response.text()).includes(apiKey));
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('recover verifies an existing provider task and issues a browser-bound ticket using GET only', async () => {
  const { cookie } = await configure(), other = await configure(), originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push({url:String(url),method:options.method}); return Response.json(success); };
  try {
    const response = await worker.fetch(request('/api/image/recover','POST',{task_id:'123456',project_id:input.project_id,source_digest:input.source_digest},cookie),env);
    assert.equal(response.status,200);const recovered=await response.json();assert.equal(recovered.task_id,'123456');assert.ok(recovered.ticket);assert.ok(!JSON.stringify(recovered).includes(apiKey));
    assert.deepEqual(calls,[{url:'https://api.lk888.ai/v1/media/status?task_id=123456',method:'GET'}]);
    const restored=await (await worker.fetch(request('/api/image/status','POST',{ticket:recovered.ticket},cookie),env)).json();assert.equal(restored.result_url,success.result_url);assert.equal(restored.project_id,input.project_id);
    assert.equal((await worker.fetch(request('/api/image/status','POST',{ticket:recovered.ticket},other.cookie),env)).status,401);
    for(const task_id of ['','../secret','123?key=bad',apiKey])assert.equal((await worker.fetch(request('/api/image/recover','POST',{task_id,project_id:input.project_id,source_digest:input.source_digest},cookie),env)).status,400);
    assert.ok(calls.every(x=>x.method==='GET'&&!x.url.includes('/media/generate')));
  }finally{globalThis.fetch=originalFetch;}
});

test('recovery rejects mismatched, malformed, non-image and denied tasks without creating or replacing one',async()=>{
 const {cookie}=await configure(),originalFetch=globalThis.fetch;let calls=0,result;
 globalThis.fetch=async()=>{calls++;return Response.json(result);};
 const body={task_id:'123456',project_id:input.project_id,source_digest:input.source_digest};
 try{
  for(const bad of [{...success,task_id:987},{...success,is_final:'true'},{...success,state:'已完成'},{...success,result_type:'video'}]){result=bad;assert.equal((await worker.fetch(request('/api/image/recover','POST',body,cookie),env)).status,502);}
  assert.equal(calls,4);globalThis.fetch=async()=>Response.json({error:'Denied '+apiKey},{status:401});
  const denied=await worker.fetch(request('/api/image/recover','POST',body,cookie),env);assert.equal(denied.status,502);assert.ok(!(await denied.text()).includes(apiKey));
 }finally{globalThis.fetch=originalFetch;}
});

test('creation distinguishes pre-dispatch rejection from uncertain network failure and allows longer creation wait',async()=>{
 const {cookie}=await configure(),originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;let calls=0;
 globalThis.fetch=async()=>{calls++;throw TypeError('network gone '+apiKey);};
 try{
  const invalid=await worker.fetch(request('/api/image/generate','POST',{...input,params:{...input.params,imageSize:'8K'}},cookie),env);assert.equal((await invalid.json()).creation_state,'not_created');assert.equal(calls,0);
  const lost=await worker.fetch(request('/api/image/generate','POST',input,cookie),env);const body=await lost.json();assert.equal(body.creation_state,'unknown');assert.ok(body.request_id);assert.ok(!JSON.stringify(body).includes(apiKey));assert.equal(calls,1);
  const timers=[];let armed;const ready=new Promise(resolve=>{armed=resolve;});globalThis.setTimeout=(fn,ms,...args)=>{const timer=originalTimer(fn,ms,...args);if(ms===90000||ms===20000){timers.push({fn,ms});armed();}return timer;};
  globalThis.fetch=async(url,options)=>new Promise((resolve,reject)=>{if(options.signal.aborted)reject(new DOMException('abort','AbortError'));else options.signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError')),{once:true});});
  const pending=worker.fetch(request('/api/image/generate','POST',input,cookie),env);await ready;assert.equal(timers.at(-1).ms,90000);timers.at(-1).fn();const timed=await pending;assert.equal((await timed.json()).creation_state,'unknown');
 }finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;}
});
