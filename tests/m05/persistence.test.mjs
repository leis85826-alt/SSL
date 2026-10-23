import { fixture } from './fixtures.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectRepository } from '../../worker/m05/repository.mjs';
import { handleM05 } from '../../worker/m05/routes.mjs';
import { accountResolver } from '../../worker/m05/cloudflare-auth.mjs';
import { validateSnapshot } from '../../shared/m05/entities.mjs';
import { validateRule, RULE_SCHEMAS } from '../../shared/m05/rule-schemas.mjs';
const migration = readFileSync(new URL('../../migrations/m05/0001_s1.sql', import.meta.url), 'utf8');
class LocalD1 {
  constructor(path = ':memory:') { this.raw = new DatabaseSync(path); this.raw.exec("PRAGMA foreign_keys = ON"); this.raw.exec(migration); this.failAt = -1; }
  prepare(sql) { return { bind: (...args) => ({ sql, args, first: async () => this.raw.prepare(sql).get(...args) || null, all: async () => ({ results: this.raw.prepare(sql).all(...args) }) }) }; }
  async batch(items) {
    this.raw.exec('BEGIN IMMEDIATE');
    try { for (let i = 0; i < items.length; i++) { if (i === this.failAt) throw new Error('injected disk error'); const x = items[i]; this.raw.prepare(x.sql).run(...x.args); } this.raw.exec('COMMIT'); }
    catch (e) { this.raw.exec('ROLLBACK'); throw e; }
  }
}

const create = (repo, snapshot = fixture(), project_id = 'project1') => repo.save({ project_id, snapshot, base_revision_id: null, change_summary: '初始化' }, 'owner', true);
test('all core and supporting data survive disk close/reopen without AI; legacy sentinel preserved', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'm05-'));
  try {
    let db = new LocalD1(join(folder, 'test.sqlite'));
    db.raw.exec("CREATE TABLE legacy_sentinel (payload TEXT); INSERT INTO legacy_sentinel VALUES ('old-workbench');");
    const saved = await create(new ProjectRepository(db)); db.raw.close();
    db = new LocalD1(join(folder, 'test.sqlite'));
    const restored = await new ProjectRepository(db).read('project1', 'owner', saved.revision.revision_id);
    assert.deepEqual(restored.snapshot, fixture());
    assert.equal(restored.revision.checksum.length, 64);
    assert.equal(db.raw.prepare('SELECT payload FROM legacy_sentinel').get().payload, 'old-workbench');
    assert.equal(db.raw.prepare('PRAGMA foreign_key_check').all().length, 0); db.raw.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
test('immutable versions, stale writes and concurrent writers', async () => {
  const db = new LocalD1(), repo = new ProjectRepository(db), first = await create(repo);
  const snapshot = fixture(); snapshot.objects[0].geometry.coordinates = [8,2];
  const input = { project_id: 'project1', base_revision_id: first.revision.revision_id, snapshot, change_summary: '移动测试点' };
  const results = await Promise.allSettled([repo.save(input, 'owner'), repo.save(input, 'owner')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.deepEqual((await repo.read('project1', 'owner', first.revision.revision_id)).snapshot, fixture());
  await assert.rejects(repo.save(input, 'owner'), { status: 409 });
  assert.throws(() => db.raw.exec("DELETE FROM m05_objects"), /immutable/);
  assert.throws(() => db.raw.exec("UPDATE m05_revisions SET change_summary='bad'"), /immutable/);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM m05_revisions').get().n, 2); db.raw.close();
});
test('failed batch rolls back revision, entities, pointer and audit together', async () => {
  const db = new LocalD1(), repo = new ProjectRepository(db), first = await create(repo);
  db.failAt = 4;
  await assert.rejects(repo.save({ project_id: 'project1', base_revision_id: first.revision.revision_id, snapshot: fixture(), change_summary: '故障注入' }, 'owner'), /disk error/);
  assert.equal((await repo.read('project1', 'owner')).revision.revision_id, first.revision.revision_id);
  for (const table of ['revisions', 'audit', 'species']) assert.equal(db.raw.prepare(`SELECT COUNT(*) AS n FROM m05_${table}`).get().n, 1);
  db.raw.close();
});
test('owner, readers and editors are checked; other project revision is inaccessible', async () => {
  const db = new LocalD1(), repo = new ProjectRepository(db); const first = await create(repo); const other = await create(repo, fixture(), 'project2');
  await assert.rejects(repo.read('project1', 'stranger'), { status: 403 });
  db.raw.prepare('INSERT INTO m05_permissions VALUES (?, ?, ?)').run('project1', 'reader', 'READER');
  assert.ok(await repo.read('project1', 'reader'));
  await assert.rejects(repo.save({ project_id: 'project1', base_revision_id: first.revision.revision_id, snapshot: fixture(), change_summary: '越权' }, 'reader'), { status: 403 });
  await assert.rejects(repo.read('project1', 'owner', other.revision.revision_id), { status: 404 }); db.raw.close();
});
test('contracts reject bad units, unprojected CRS, invalid geometry and cross references', () => {
  for (const change of [s => s.project.source_unit = 'unknown', s => s.project.crs = 'EPSG:4326', s => s.project.unit_to_meter = .001, s => s.objects[0].species_id = 'missing', s => s.objects[0].geometry.coordinates = [Infinity,0], s => s.areas[0].geometry.coordinates[0].pop(), s => s.specifications[0].species_id = 'missing', s => s.rules[0].area_id = 'other', s => s.objects.push(structuredClone(s.objects[0])), s => s.objects[0].quantity_method = 'AREA_DENSITY', s => s.project.api_key = 'forbidden']) {
    const snapshot = fixture(); change(snapshot); assert.throws(() => validateSnapshot(snapshot));
  }
});
test('six parameter schemas validate and reject invalid distances and unsafe auto adjust', () => {
  const parameters = {
    EQUAL_SPACING: { mode: 'FIXED_SPACING', spacing_m: 6 },
    GROUP_PLANTING: fixture().rules[0].parameters,
    ALTERNATING: { spacing_m: 6, pattern: ['sp1','sp1','sp1'] },
    HEDGE_ROWS: { spacing_m: .3, row_count: 2, row_spacing_m: .3, layout: 'STAGGERED' },
    GROUNDCOVER_AREA: { density_per_m2: 16, rounding: 'CEIL_PER_AREA', quantity_method: 'AREA_DENSITY' },
    AREA_PARTITION: { widths_m: [.75,2,.75], reference_alignment_id: 'line1' },
  };
  assert.equal(Object.keys(RULE_SCHEMAS).length, 6);
  for (const [rule_type, value] of Object.entries(parameters)) {
    const rule = { ...fixture().rules[0], rule_type, parameters: value }; validateRule(rule);
    assert.throws(() => validateRule({ ...rule, parameters: {} }));
  }
  const rule = fixture().rules[0]; rule.parameters.group_end_center_gap_m = 0; assert.throws(() => validateRule(rule));
  rule.parameters.group_end_center_gap_m = 12; rule.conflict_strategy = 'AUTO_ADJUST'; assert.throws(() => validateRule(rule));
});
function request(path, method = 'GET', input) { return new Request('https://test.invalid/api/v1' + path, { method, headers: { Origin: 'https://test.invalid', 'Content-Type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) }); }
test('API creates, reads and saves specified revisions; default disabled and forged identity rejected', async () => {
  const db = new LocalD1(), env = { M05_ENABLED: 'true', M05_DB: db }; const auth = async () => 'owner';
  assert.equal((await handleM05(request('/projects/p'), {}, auth)).status, 503);
  assert.equal((await handleM05(request('/projects/p'), env, undefined)).status, 503);
  const forged = new Request('https://test.invalid/api/v1/projects/p', { headers: { 'oai-authenticated-user-id': 'owner' } });
  assert.equal((await handleM05(forged, env, async () => null)).status, 401);
  const response = await handleM05(request('/projects', 'POST', { project_id: 'project1', snapshot: fixture(), change_summary: 'API创建' }), env, auth);
  assert.equal(response.status, 201); const first = (await response.json()).data;
  assert.equal((await handleM05(request('/projects/project1/snapshots', 'POST', { base_revision_id: first.revision.revision_id, snapshot: fixture(), change_summary: 'API保存' }), env, auth)).status, 201);
  const historical = await handleM05(request('/projects/project1?revision_id=' + first.revision.revision_id), env, auth);
  assert.equal((await historical.json()).data.revision.revision_number, 1);
  const badOrigin = new Request(request('/projects', 'POST', {}), { headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' } });
  assert.equal((await handleM05(badOrigin, env, auth)).status, 403);
  assert.equal((await handleM05(request('/projects/project1/planting/commits', 'POST', {}), env, auth)).status, 404); db.raw.close();
});
test('private account resolver ignores forged headers and model cookies as identities', async () => {
  assert.equal(accountResolver({}), undefined);
  let seen;
  const resolver = accountResolver({ M05_AUTH: { fetch: async r => { seen = r; return Response.json({ authenticated: true, user_id: 'real-account' }); } } });
  assert.equal(await resolver(new Request('https://test.invalid', { headers: { Cookie: 'account=opaque', 'oai-authenticated-user-id': 'fake' } })), 'real-account');
  assert.equal(seen.headers.get('oai-authenticated-user-id'), null);
  const denied = accountResolver({ M05_AUTH: { fetch: async () => new Response('', { status: 401 }) } });
  assert.equal(await denied(new Request('https://test.invalid')), null);
});
test('editor saves, checksums are order-independent, and storage errors are redacted by API', async () => {
  const db = new LocalD1(), repo = new ProjectRepository(db), first = await create(repo);
  db.raw.prepare('INSERT INTO m05_permissions VALUES (?, ?, ?)').run('project1', 'editor', 'EDITOR');
  const shuffled = fixture(); shuffled.project = Object.fromEntries(Object.entries(shuffled.project).reverse());
  const saved = await repo.save({ project_id: 'project1', base_revision_id: first.revision.revision_id, snapshot: shuffled, change_summary: '编辑者保存' }, 'editor');
  assert.equal(first.revision.checksum, saved.revision.checksum);
  db.failAt = 3;
  const response = await handleM05(request('/projects/project1/snapshots', 'POST', { base_revision_id: saved.revision.revision_id, snapshot: fixture(), change_summary: '错误不泄漏' }), { M05_ENABLED: 'true', M05_DB: db }, async () => 'owner');
  assert.equal(response.status, 500); const message = await response.text(); assert.ok(!message.includes('disk error')); assert.ok(!message.includes('INSERT'));
  assert.equal((await repo.read('project1', 'owner')).revision.revision_id, saved.revision.revision_id); db.raw.close();
});
test('Cloudflare dispatch keeps M05 fail-closed without creating a model browser session', async () => {
  const { default: worker } = await import('../../worker/cloudflare-entry.js');
  const response = await worker.fetch(request('/projects/project1'), {});
  assert.equal(response.status, 503); assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal((await response.json()).error.code, 'NOT_CONFIGURED');
});
test('public cloud readiness discloses only configuration and authentication flags', async () => {
  const noCloud = await handleM05(request('/status'), {}, undefined);
  assert.deepEqual((await noCloud.json()).data, { configured: false, authenticated: false });
  const enabled = await handleM05(request('/status'), { M05_ENABLED: 'true', M05_DB: {}, SECRET: 'not-exposed' }, async () => 'real-account');
  const data = await enabled.json(); assert.deepEqual(data.data, { configured: true, authenticated: true }); assert.ok(!JSON.stringify(data).includes('real-account'));
  const invalid = await handleM05(request('/status'), { M05_ENABLED: 'true', M05_DB: {} }, async () => '  ');
  assert.equal((await invalid.json()).data.authenticated, false);
});
