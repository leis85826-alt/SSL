import { session, seal, key, providerURL, checkProvider, readJSON, safeTransportError, validModelSession, SAVED_SECONDS, BASE_URL } from '../dist/cloudflare/model-worker.mjs';
const COOKIE = '__Host-roadscape-image', MODEL = 'banana-2.1';
const ratios = ['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9','1:4','4:1','1:8','8:1'];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const valid = value => value?.kind === 'image-profile' && value.model === MODEL && validModelSession(value);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join('');
async function providerRequest(profile, path, payload, onDispatch = () => {}) {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), path === '/media/generate' ? 90000 : 20000);
  try {
    const base = await checkProvider(profile.provider);
    onDispatch();
    const response = await fetch(base + path, { method: payload ? 'POST' : 'GET', redirect: 'manual', headers: { Authorization: 'Bearer ' + profile.apiKey, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: abort.signal });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw fail('图片接口发生跳转，未转发密钥，请核对地址。', 502); }
    const data = await readJSON(response, 100000);
    if (!response.ok) throw fail('图片服务返回 HTTP ' + response.status + '：' + safeTransportError(data.error || data.msg || data.message || '请检查服务商记录', profile.apiKey), 502);
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw fail('图片服务连接中断或超时。创建请求不会自动重试，请先查服务商记录，避免重复计费。', 502);
  } finally { clearTimeout(timer); }
}
async function taskTicket(token, user, env) {
  try {
    if (typeof token !== 'string' || token.length > 3000) return null;
    const [iv, data] = token.split('.');
    const decode = v => Uint8Array.from(atob(v), c => c.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: new TextEncoder().encode(user) }, await key(env), decode(data))));
    return value.kind === 'image-task' && value.expires > Date.now() ? value : null;
  } catch { return null; }
}
function validateParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).some(k => !['aspectRatio','imageSize','thinkingLevel','web_search'].includes(k)) || !ratios.includes(params.aspectRatio) || !['1K','2K','4K'].includes(params.imageSize) || !['minimal','high'].includes(params.thinkingLevel) || typeof params.web_search !== 'boolean') throw fail('图片参数不正确，请选择比例、分辨率和思考等级。');
  return { ...params, n: 1 };
}
function imageURL(value) {
  if (typeof value !== 'string' || value.length > 8192) throw fail('服务商未返回有效图片地址。', 502);
  let url; try { url = new URL(value); } catch { throw fail('图片地址格式不正确。', 502); }
  // Validate a public HTTPS hostname; signed result URLs may contain query parameters.
  providerURL(url.origin + '/v1');
  if (url.username || url.password || url.hash) throw fail('图片地址含无效信息。', 502);
  return url.href;
}
export async function imageFetch(req, env) {
  const creating = new URL(req.url).pathname === '/api/image/generate' && req.method === 'POST';
  let creationState = 'not_created';
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url), user = req.headers.get('oai-authenticated-user-id');
    if (!user) throw fail('请先建立浏览器会话。', 401);
    if (!['GET','POST','DELETE'].includes(req.method)) throw fail('请求方法不支持。', 405);
    const previous = await session(req, user, env, COOKIE), configured = valid(previous);
    if (url.pathname === '/api/image/config' && req.method === 'GET') {
      const chat = await session(req, user, env);
      return json({ configured, model: MODEL, baseURL: configured ? previous.provider : BASE_URL, expiresAt: configured ? previous.expires : null, canUseChatKey: validModelSession(chat), chatBaseURL: validModelSession(chat) ? chat.provider : null });
    }
    if (url.pathname === '/api/image/config' && req.method === 'DELETE') return json({ configured: false }, 200, { 'Set-Cookie': COOKIE + '=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0' });
    if (url.pathname === '/api/image/config' && req.method === 'POST') {
      const data = await readJSON(req, 3000);
      const provider = providerURL(data?.baseURL ?? (configured ? previous.provider : BASE_URL));
      if (data?.apiKey !== undefined && typeof data.apiKey !== 'string') throw fail('密钥格式错误。');
      let apiKey = data?.apiKey?.trim() || (configured && provider === previous.provider ? previous.apiKey : '');
      if (!apiKey && data?.useChatKey === true) {
        const chat = await session(req, user, env);
        if (validModelSession(chat) && chat.provider === provider) apiKey = chat.apiKey;
      }
      if (typeof apiKey !== 'string' || apiKey.length < 12 || apiKey.length > 512 || !/^[\x21-\x7e]+$/.test(apiKey)) throw fail('请填写该地址对应的图片 API 密钥，或选择沿用同地址已保存的聊天密钥。');
      await checkProvider(provider);
      const profile = { kind: 'image-profile', provider, model: MODEL, apiKey, expires: Date.now() + SAVED_SECONDS * 1000 };
      return json({ configured: true, model: MODEL, baseURL: provider, expiresAt: profile.expires }, 200, { 'Set-Cookie': COOKIE + '=' + await seal(profile, user, env) + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + SAVED_SECONDS });
    }
    if (!configured) throw fail('请先保存纳米香蕉图片模型配置。', 401);
    if (url.pathname === '/api/image/test' && req.method === 'GET') {
      const data = await providerRequest(previous, '/models');
      if (!data.data?.some(m => m.id === MODEL)) throw fail('连接已响应，但清单未返回 banana-2.1；请向服务商确认模型权限。', 502);
      return json({ ok: true, model: MODEL, message: '模型清单可访问；未创建图片任务。实际额度及生成权限以服务商为准。' });
    }
    if (url.pathname === '/api/image/generate' && req.method === 'POST') {
      const data = await readJSON(req, 64000);
      if (!data || typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 16000 || typeof data.project_id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.project_id) || !/^[a-f0-9]{64}$/.test(data.source_digest)) throw fail('请先保存有效绿化方案再生成效果图。');
      const params = validateParams(data.params);
      console.info('IMAGE_CREATE_START', JSON.stringify({ request_id: requestId, model: MODEL, imageSize: params.imageSize, thinkingLevel: params.thinkingLevel, web_search: params.web_search, promptCharacters: data.prompt.length }));
      const result = await providerRequest(previous, '/media/generate', { model: MODEL, prompt: data.prompt, params }, () => { creationState = 'unknown'; });
      const taskId = result.data?.task_id;
      if (result.code !== 200 || !(typeof taskId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(taskId) || Number.isSafeInteger(taskId) && taskId > 0)) throw fail('未收到有效任务编号，请先查服务商记录，勿重复提交。' + safeTransportError(result.msg || '', previous.apiKey), 502);
      if (String(taskId).includes(previous.apiKey)) throw fail('服务商任务编号异常，请检查服务商记录。', 502);
      const ticket = { kind: 'image-task', task_id: String(taskId), project_id: data.project_id, source_digest: data.source_digest, provider: previous.provider, model: MODEL, key_hash: await digest(previous.apiKey), expires: Date.now() + 24 * 3600000 };
      return json({ task_id: ticket.task_id, ticket: await seal(ticket, user, env), model: MODEL, source_digest: ticket.source_digest, expiresAt: ticket.expires }, 201);
    }
    if (url.pathname === '/api/image/recover' && req.method === 'POST') {
      const data = await readJSON(req, 5000);
      if (typeof data?.task_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.task_id) || typeof data.project_id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.project_id) || !/^[a-f0-9]{64}$/.test(data.source_digest)) throw fail('请填写服务商后台的原任务编号，不是API密钥。');
      if (data.task_id.includes(previous.apiKey)) throw fail('请填写任务编号，不要填写API密钥。');
      // Only read an existing task using the saved profile. Never call the paid creation endpoint.
      const result = await providerRequest(previous, '/media/status?task_id=' + encodeURIComponent(data.task_id));
      if (String(result.task_id) !== data.task_id || !['pending','running','success','failed'].includes(result.state) || typeof result.is_final !== 'boolean' || (result.is_final && result.state === 'success' && result.result_type !== 'image')) throw fail('未查到匹配的图片任务，请确认原服务商、密钥及任务编号。', 502);
      const ticket = { kind: 'image-task', task_id: data.task_id, project_id: data.project_id, source_digest: data.source_digest, provider: previous.provider, model: MODEL, key_hash: await digest(previous.apiKey), expires: Date.now() + 24 * 3600000 };
      return json({ task_id: ticket.task_id, ticket: await seal(ticket, user, env), model: MODEL, source_digest: ticket.source_digest, expiresAt: ticket.expires });
    }
    if (url.pathname === '/api/image/status' && req.method === 'POST') {
      const data = await readJSON(req, 5000), task = await taskTicket(data?.ticket, user, env);
      if (!task) throw fail('任务凭据已过期或不属于当前浏览器，请查看服务商记录。', 401);
      if (task.provider !== previous.provider || task.key_hash !== await digest(previous.apiKey)) throw fail('图片服务商或密钥已改变，请恢复该任务原配置后查询。', 409);
      const result = await providerRequest(previous, '/media/status?task_id=' + encodeURIComponent(task.task_id));
      if (String(result.task_id) !== task.task_id) throw fail('服务商返回的任务编号不一致。', 502);
      if (!['pending','running','success','failed'].includes(result.state) || typeof result.is_final !== 'boolean') throw fail('服务商任务状态格式异常，未自动重建任务。', 502);
      const common = { task_id: task.task_id, project_id: task.project_id, source_digest: task.source_digest, model: task.model, state: result.state, is_final: result.is_final, progress: typeof result.progress === 'string' && /^\d{1,3}%$/.test(result.progress) ? result.progress : '' };
      if (!result.is_final) return json(common);
      if (result.state === 'failed') return json({ ...common, error: safeTransportError(result.error || '图片生成失败，请查看服务商退款记录。', previous.apiKey) });
      if (result.state !== 'success' || result.result_type !== 'image') throw fail('任务未返回成功的图片结果，请检查服务商记录。', 502);
      if (typeof result.result_url === 'string' && [previous.apiKey, encodeURIComponent(previous.apiKey)].some(secret => result.result_url.includes(secret))) throw fail('图片地址包含认证信息，未保存该地址，请联系服务商。', 502);
      return json({ ...common, result_url: imageURL(result.result_url), ...(Number.isFinite(result.cost) && result.cost >= 0 ? { cost: result.cost } : {}) });
    }
    throw fail('图片接口不存在。', 404);
  } catch (error) { if (creating) console.warn('IMAGE_CREATE_FAILED', JSON.stringify({ request_id: requestId, status: error.status || 500, creation_state: creationState })); return json({ error: error.status ? error.message : '图片服务暂时不可用，未自动重试创建任务。', ...(creating ? { creation_state: creationState, request_id: requestId } : {}) }, error.status || 500); }
}
