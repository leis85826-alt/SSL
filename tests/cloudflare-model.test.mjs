import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import worker from '../worker/cloudflare-entry.js';

const origin = 'https://roadscape-test.example';
const env = { ROADSCAPE_SESSION_SECRET: randomBytes(32).toString('hex') };
const apiKey = randomBytes(24).toString('hex');
const browserCookie = '__Host-roadscape-browser';
const modelCookie = '__Host-roadscape-model';

function request(path, { method = 'GET', body, cookie, headers = {}, urlOrigin = origin } = {}) {
  return new Request(urlOrigin + path, {
    method,
    headers: { ...(method !== 'GET' ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function cookieFrom(response, name) {
  return response.headers.getSetCookie().find(c => c.startsWith(name + '='))?.split(';')[0];
}
async function configure() {
  const first = await worker.fetch(request('/api/model/config'), env);
  const browser = cookieFrom(first, browserCookie);
  assert.ok(browser);
  const saved = await worker.fetch(request('/api/model/config', {
    method: 'POST', body: { apiKey }, cookie: browser,
  }), env);
  assert.equal(saved.status, 200);
  return { browser, model: cookieFrom(saved, modelCookie) };
}
async function events(response) {
  return (await response.text()).trim().split('\n').map(JSON.parse);
}

test('static assets retain their body, status and security headers without a secret', async () => {
  const response = await worker.fetch(request('/'), {
    ASSETS: { fetch: async () => new Response('<h1>workbench</h1>', { headers: { 'Content-Type': 'text/html' } }) },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<h1>workbench</h1>');
  assert.equal(response.headers.get('content-type'), 'text/html');
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
});

test('missing or weak encryption secret fails closed', async () => {
  for (const runtime of [{}, { ROADSCAPE_SESSION_SECRET: 'short' }]) {
    const response = await worker.fetch(request('/api/model/config'), runtime);
    assert.equal(response.status, 503);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
});

test('model endpoints require HTTPS and same-origin writes', async () => {
  assert.equal((await worker.fetch(request('/api/model/config', { urlOrigin: 'http://roadscape-test.example' }), env)).status, 400);
  for (const method of ['POST', 'DELETE']) {
    const response = await worker.fetch(request('/api/model/config', {
      method, headers: { Origin: 'https://other.example' },
    }), env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
});

test('browser and model cookies are opaque, secure and HttpOnly', async () => {
  const first = await worker.fetch(request('/api/model/config'), env);
  const header = first.headers.getSetCookie()[0];
  assert.match(header, /Secure; HttpOnly; SameSite=Strict; Max-Age=28800/);
  assert.equal((await first.json()).configured, false);
  const saved = await worker.fetch(request('/api/model/config', {
    method: 'POST', body: { apiKey }, cookie: header.split(';')[0],
  }), env);
  assert.match(saved.headers.getSetCookie()[0], /Secure; HttpOnly; SameSite=Strict/);
  assert.ok(!saved.headers.getSetCookie().join('').includes(apiKey));
  assert.ok(!(await saved.text()).includes(apiKey));
});

test('valid browser session can query saved model configuration', async () => {
  const { browser, model } = await configure();
  const response = await worker.fetch(request('/api/model/config', { cookie: browser + '; ' + model }), env);
  assert.equal((await response.json()).configured, true);
  assert.equal(response.headers.getSetCookie().length, 0);
});

test('forged identity headers do not allow reusing another browser model cookie', async () => {
  const { model } = await configure();
  const response = await worker.fetch(request('/api/model/config', {
    cookie: model, headers: { 'oai-authenticated-user-id': 'local-preview' },
  }), env);
  assert.equal((await response.json()).configured, false);
  const attempt = await worker.fetch(request('/api/model/test', {
    method: 'POST', body: {}, cookie: model,
    headers: { 'oai-authenticated-user-id': 'local-preview' },
  }), env);
  assert.equal(attempt.status, 401);
});

test('tampered browser cookie, host change and encryption-key rotation invalidate credentials', async () => {
  const { browser, model } = await configure();
  const value = browser.slice(browser.indexOf('=') + 1);
  const tampered = browserCookie + '=' + (value[0] === 'A' ? 'B' : 'A') + value.slice(1);
  for (const [options, runtime] of [
    [{ cookie: tampered + '; ' + model }, env],
    [{ cookie: browser + '; ' + model, urlOrigin: 'https://other.example' }, env],
    [{ cookie: browser + '; ' + model }, { ROADSCAPE_SESSION_SECRET: randomBytes(32).toString('hex') }],
  ]) {
    const response = await worker.fetch(request('/api/model/config', options), runtime);
    assert.equal((await response.json()).configured, false);
  }
});

test('saving a key with no bootstrap request emits both independent cookies', async () => {
  const response = await worker.fetch(request('/api/model/config', { method: 'POST', body: { apiKey } }), env);
  assert.equal(response.status, 200);
  assert.ok(cookieFrom(response, browserCookie));
  assert.ok(cookieFrom(response, modelCookie));
});

test('model generation calls the fixed provider with the browser-owned key', async () => {
  const { browser, model } = await configure();
  const originalFetch = globalThis.fetch;
  let called = 0;
  const design = {
    title: '合成模型方案', spacing: 8, treeLayout: 'continuous',
    parts: { trees: { description: '测试配置', plants: [{ name: '国槐', role: '乔木', position: '树带', form: '单排' }], pattern: null } },
    warnings: [],
  };
  globalThis.fetch = async (url, options) => {
    called++;
    assert.equal(url, 'https://api.lk888.ai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer ' + apiKey);
    assert.equal(options.redirect, 'manual');
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(design) }, finish_reason: 'stop' }] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await worker.fetch(request('/api/model/generate', {
      method: 'POST', cookie: browser + '; ' + model,
      body: { project: { scope: { trees: true }, geometryConfirmed: true, geometry: [{ type: 'trees', width: 2.5 }] } },
    }), env);
    const output = await events(response);
    assert.equal(output.at(-1).type, 'result');
    assert.equal(output.at(-1).data.design.title, design.title);
    assert.ok(!JSON.stringify(output).includes(apiKey));
    assert.equal(called, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('provider errors redact the model key', async () => {
  const { browser, model } = await configure();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Denied ' + apiKey } }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });
  try {
    const response = await worker.fetch(request('/api/model/test', { method: 'POST', body: {}, cookie: browser + '; ' + model }), env);
    const output = await events(response);
    assert.equal(output.at(-1).type, 'error');
    assert.ok(!JSON.stringify(output).includes(apiKey));
  } finally { globalThis.fetch = originalFetch; }
});

test('disconnect clears model credentials without touching project data', async () => {
  const { browser, model } = await configure();
  const response = await worker.fetch(request('/api/model/config', { method: 'DELETE', cookie: browser + '; ' + model }), env);
  assert.match(response.headers.getSetCookie()[0], /Max-Age=0/);
  assert.equal((await response.json()).configured, false);
});

const sse = value => 'data: ' + JSON.stringify(value) + '\n\n';
const deltaFrame = delta => sse({ choices: [{ delta }] });

async function generateStream(frames) {
  const { browser, model } = await configure();
  const originalFetch = globalThis.fetch;
  const iterator = frames[Symbol.iterator]();
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      const next = iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(new TextEncoder().encode(next.value));
    },
    cancel() { cancelled = true; iterator.return?.(); },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
  try {
    const response = await worker.fetch(request('/api/model/generate', {
      method: 'POST', cookie: browser + '; ' + model,
      body: { project: { scope: { trees: true }, geometryConfirmed: true, geometry: [{ type: 'trees', width: 2.5 }] } },
    }), env);
    return { output: await events(response), get cancelled() { return cancelled; } };
  } finally { globalThis.fetch = originalFetch; }
}

test('reasoning stream over 2MB still returns a small valid design without exposing reasoning', async () => {
  const reasoning = 'SYNTHETIC_PRIVATE_REASONING'.repeat(64);
  const frame = deltaFrame({ reasoning_content: reasoning });
  const count = Math.ceil(2100000 / new TextEncoder().encode(frame).length);
  const design = {
    title: '长推理后的有效方案', spacing: 8, treeLayout: 'continuous', warnings: [],
    parts: { trees: { description: '测试说明', plants: [{ name: '国槐', role: '乔木', position: '树带', form: '单排' }], pattern: null } },
  };
  function* frames() {
    for (let i = 0; i < count; i++) yield frame;
    // Deliberately split the final content across events.
    const content = JSON.stringify(design), mid = Math.floor(content.length / 2);
    yield deltaFrame({ content: content.slice(0, mid) });
    yield deltaFrame({ content: content.slice(mid) });
    yield sse({ choices: [{ delta: {}, finish_reason: 'stop' }] });
    yield 'data: [DONE]\n\n';
  }
  const { output } = await generateStream(frames());
  assert.equal(output.at(-1).type, 'result');
  assert.equal(output.at(-1).data.design.title, design.title);
  assert.ok(!JSON.stringify(output).includes('SYNTHETIC_PRIVATE_REASONING'));
});

test('excessive cumulative reasoning remains bounded and the upstream stream is cancelled', async () => {
  const frame = deltaFrame({ reasoning_content: 'x'.repeat(32768) });
  function* frames() { for (let i = 0; i < 600; i++) yield frame; }
  const result = await generateStream(frames());
  assert.equal(result.output.at(-1).type, 'error');
  assert.match(result.output.at(-1).message, /数据流超过16MB/);
  assert.equal(result.cancelled, true);
});

test('oversized design content is rejected independently from reasoning size', async () => {
  const frame = deltaFrame({ content: 'x'.repeat(32768) });
  function* frames() { for (let i = 0; i < 40; i++) yield frame; }
  const result = await generateStream(frames());
  assert.equal(result.output.at(-1).type, 'error');
  assert.match(result.output.at(-1).message, /方案正文超过1MB/);
  assert.equal(result.cancelled, true);
});

test('unterminated stream events cannot grow without a bound', async () => {
  function* frames() { for (let i = 0; i < 40; i++) yield 'x'.repeat(32768); }
  const result = await generateStream(frames());
  assert.equal(result.output.at(-1).type, 'error');
  assert.match(result.output.at(-1).message, /单条响应过大/);
  assert.equal(result.cancelled, true);
});
