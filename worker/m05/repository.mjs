import { checksumSnapshot } from '../../shared/m05/snapshot-codec.mjs';
import { collections, validateSnapshot } from '../../shared/m05/entities.mjs';
import { ContractError, validate, id, text } from '../../shared/m05/schema.mjs';
const fault = (message, status, code) => { throw new ContractError(message, status, code); };
export class ProjectRepository {
  constructor(db) { this.db = db; }
  statement(sql, ...args) { return this.db.prepare(sql).bind(...args); }
  async access(projectId, actor, write = false) {
    validate(id, projectId); validate(text, actor);
    const project = await this.statement('SELECT * FROM m05_projects WHERE project_id = ?', projectId).first();
    if (!project) fault('项目不存在', 404, 'NOT_FOUND');
    if (project.owner_user_id !== actor) {
      const grant = await this.statement('SELECT role FROM m05_permissions WHERE project_id = ? AND user_id = ?', projectId, actor).first();
      if (!grant || (write && grant.role !== 'EDITOR')) fault('没有项目权限', 403, 'FORBIDDEN');
    }
    return project;
  }
  async read(projectId, actor, revisionId) {
    const project = await this.access(projectId, actor);
    const revision = revisionId || project.current_revision_id; validate(id, revision);
    const row = await this.statement('SELECT * FROM m05_revisions WHERE project_id = ? AND revision_id = ?', projectId, revision).first();
    if (!row) fault('版本不存在', 404, 'NOT_FOUND');
    // Immutable revision rows allow consistent historical reads across individual queries.
    const snapshot = { project: JSON.parse(row.project_json) };
    for (const [name, pk] of Object.entries(collections)) {
      const result = await this.statement(`SELECT payload FROM m05_${name} WHERE project_id = ? AND revision_id = ? ORDER BY ${pk}`, projectId, revision).all();
      snapshot[name] = result.results.map(r => JSON.parse(r.payload));
    }
    const { project_json, ...metadata } = row;
    return { project: { ...project, ...snapshot.project }, revision: metadata, snapshot };
  }
  async save({ project_id, base_revision_id, snapshot, change_summary }, actor, create = false) {
    validate(id, project_id); validate(text, actor); validate(text, change_summary); validateSnapshot(snapshot);
    const checksum = await checksumSnapshot(snapshot);
    let number = 1;
    if (!create) {
      validate(id, base_revision_id);
      const project = await this.access(project_id, actor, true);
      if (project.current_revision_id !== base_revision_id) fault('版本已变化，请重新读取', 409, 'REVISION_CONFLICT');
      const previous = await this.statement('SELECT revision_number FROM m05_revisions WHERE project_id = ? AND revision_id = ?', project_id, base_revision_id).first();
      number = previous.revision_number + 1;
    } else if (base_revision_id !== null) fault('新项目基线必须为空', 422, 'INVALID_INPUT');
    const revision = crypto.randomUUID(), now = new Date().toISOString();
    const batch = [];
    if (create) batch.push(this.statement('INSERT INTO m05_projects VALUES (?, ?, NULL, ?, ?)', project_id, actor, now, now));
    batch.push(this.statement('INSERT INTO m05_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', revision, project_id, number, base_revision_id, 'SAVED', actor, now, change_summary, 's1-storage-v1', checksum, JSON.stringify(snapshot.project)));
    for (const [name, pk] of Object.entries(collections)) for (const row of snapshot[name]) batch.push(this.statement(`INSERT INTO m05_${name} VALUES (?, ?, ?, ?)`, project_id, revision, row[pk], JSON.stringify(row)));
    batch.push(this.statement('UPDATE m05_projects SET current_revision_id = ?, updated_at = ? WHERE project_id = ?', revision, now, project_id));
    batch.push(this.statement('INSERT INTO m05_audit VALUES (?, ?, ?, ?, ?, ?)', crypto.randomUUID(), project_id, revision, actor, create ? 'CREATE' : 'SAVE_SNAPSHOT', now));
    try { await this.db.batch(batch); }
    catch (error) {
      // Translate known concurrency/identity collisions only; other storage errors remain 500.
      if (/UNIQUE constraint failed/.test(String(error.message))) fault('项目或版本已存在，请重新读取', 409, 'REVISION_CONFLICT');
      throw error;
    }
    return this.read(project_id, actor, revision);
  }
}
