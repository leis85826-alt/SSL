// Cloudflare adapter for public, bring-your-own-key model sessions.
// This browser identity is not an account or project authorization system.
import modelWorker from '../dist/cloudflare/model-worker.mjs';

const BROWSER_COOKIE = '__Host-roadscape-browser';
const SESSION_MS = 90 * 24 * 60 * 60 * 1000;
const browserEncoder = new TextEncoder();
const browserDecoder = new TextDecoder();
const browserJSON = (error, status) => new Response(JSON.stringify({ error }), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function browserIdentity(request, env, renew = false) {
  let existingId;
  const origin = new URL(request.url).origin;
  const key = await crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', browserEncoder.encode(env.ROADSCAPE_SESSION_SECRET)),
    { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );
  const additionalData = browserEncoder.encode('roadscape-cloudflare-browser-v1:' + origin);
  const cookie = (request.headers.get('Cookie') || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(BROWSER_COOKIE + '='));
  if (cookie && cookie.length < 2048) {
    try {
      const parts = cookie.slice(BROWSER_COOKIE.length + 1).split('.');
      if (parts.length !== 2) throw new Error('invalid cookie');
      const [iv, ciphertext] = parts.map(v => Uint8Array.from(atob(v), c => c.charCodeAt(0)));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData }, key, ciphertext);
      const data = JSON.parse(browserDecoder.decode(plain));
      if (data.version === 1 && /^[a-f0-9-]{36}$/.test(data.id) && data.expires > Date.now()
          && data.expires <= Date.now() + SESSION_MS) {
        if (!renew) return { id: data.id };
        existingId = data.id;
      }
    } catch { /* Invalid or expired browser cookies never supply an identity. */ }
  }
  const data = { version: 1, id: existingId || crypto.randomUUID(), expires: Date.now() + SESSION_MS };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData }, key, browserEncoder.encode(JSON.stringify(data)),
  ));
  const encode = bytes => btoa(String.fromCharCode(...bytes));
  return {
    id: data.id,
    cookie: BROWSER_COOKIE + '=' + encode(iv) + '.' + encode(ciphertext)
      + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + SESSION_MS / 1000,
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (!env.ASSETS) return new Response('Static asset binding is not configured.', { status: 503 });
      const assetResponse = await env.ASSETS.fetch(request);
      const response = new Response(assetResponse.body, assetResponse);
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('Referrer-Policy', 'same-origin');
      response.headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' blob: data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
      return response;
    }
    if (url.protocol !== 'https:') return browserJSON('模型服务需要 HTTPS 连接。', 400);
    if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
      return browserJSON('请求来源无效。', 403);
    }
    if (typeof env.ROADSCAPE_SESSION_SECRET !== 'string' || env.ROADSCAPE_SESSION_SECRET.length < 32) {
      return browserJSON('请先在 Cloudflare 中配置至少32字符的 ROADSCAPE_SESSION_SECRET 加密密钥。', 503);
    }
    try {
      const browser = await browserIdentity(request, env, url.pathname === '/api/model/config' && request.method === 'POST');
      const headers = new Headers(request.headers);
      // A public client must never choose the identity passed to the original Worker.
      headers.set('oai-authenticated-user-id', 'cloudflare-browser:' + browser.id);
      const response = await modelWorker.fetch(new Request(request, { headers }), env, ctx);
      const result = new Response(response.body, response);
      if (browser.cookie) result.headers.append('Set-Cookie', browser.cookie);
      return result;
    } catch {
      return browserJSON('模型会话服务暂时不可用，请稍后重试。', 500);
    }
  },
};
