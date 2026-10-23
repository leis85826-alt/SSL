import { ProjectRepository } from './repository.mjs';
import { ContractError, object, id, text, validate } from '../../shared/m05/schema.mjs';
const response = (body, status, request_id) => new Response(JSON.stringify({ ...body, request_id }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function body(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new ContractError('需要 application/json', 400);
  if (!request.body) throw new ContractError('请求体为空', 400);
  const reader = request.body.getReader(); const chunks = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new ContractError('请求体过大', 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const all = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)); } catch { throw new ContractError('JSON 格式错误', 400); }
}
// Identity must be resolved by a trusted server-side authentication adapter, never a client header.
export async function handleM05(request, env, resolveIdentity) {
  const request_id = crypto.randomUUID();
  try {
    if (env.M05_ENABLED !== 'true' || !env.M05_DB || !resolveIdentity) throw new ContractError('M05 存储或登录服务尚未启用', 503, 'NOT_CONFIGURED');
    const url = new URL(request.url);
    if (url.protocol !== 'https:') throw new ContractError('需要 HTTPS', 400);
    if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) throw new ContractError('请求来源无效', 403, 'FORBIDDEN');
    const actor = await resolveIdentity(request);
    if (typeof actor !== 'string' || !actor.trim() || actor.length > 500) throw new ContractError('请先登录', 401, 'UNAUTHENTICATED');
    const repository = new ProjectRepository(env.M05_DB);
    const parts = url.pathname.split('/').filter(Boolean);
    let data, status = 200;
    if (parts.length === 3 && parts[2] === 'projects' && request.method === 'POST') {
      const input = await body(request);
      validate(object({ project_id: id, snapshot: { type: 'object' }, change_summary: text }), input);
      data = await repository.save({ ...input, base_revision_id: null }, actor, true); status = 201;
    } else if (parts[2] === 'projects' && parts.length >= 4) {
      const project_id = parts[3];
      if (parts.length === 4 && request.method === 'GET') data = await repository.read(project_id, actor, url.searchParams.get('revision_id'));
      else if (parts.length === 5 && parts[4] === 'snapshots' && request.method === 'POST') {
        const input = await body(request);
        validate(object({ base_revision_id: id, snapshot: { type: 'object' }, change_summary: text }), input);
        data = await repository.save({ ...input, project_id }, actor); status = 201;
      } else throw new ContractError('接口尚未实现', 404, 'NOT_FOUND');
    } else throw new ContractError('接口不存在', 404, 'NOT_FOUND');
    return response({ success: true, data }, status, request_id);
  } catch (error) {
    const known = error instanceof ContractError;
    return response({ success: false, error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'M05 存储服务暂时不可用' } }, known ? error.status : 500, request_id);
  }
}
