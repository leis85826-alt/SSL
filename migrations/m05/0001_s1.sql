-- Additive migration: no old workbench table/key is read, altered, or deleted.
-- D1 enforces foreign keys. Local SQLite runners must enable them before applying.
CREATE TABLE IF NOT EXISTS m05_schema_version (version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO m05_schema_version VALUES (1);
CREATE TABLE IF NOT EXISTS m05_projects (
 project_id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, current_revision_id TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS m05_projects_owner ON m05_projects(owner_user_id);
CREATE TABLE IF NOT EXISTS m05_revisions (
 revision_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES m05_projects(project_id),
 revision_number INTEGER NOT NULL CHECK(revision_number > 0), parent_revision_id TEXT,
 status TEXT NOT NULL CHECK(status = 'SAVED'), created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 change_summary TEXT NOT NULL, algorithm_version TEXT NOT NULL, checksum TEXT NOT NULL,
 project_json TEXT NOT NULL CHECK(json_valid(project_json)),
 UNIQUE(project_id, revision_id), UNIQUE(project_id, revision_number),
 FOREIGN KEY(project_id, parent_revision_id) REFERENCES m05_revisions(project_id, revision_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS m05_one_child ON m05_revisions(project_id,parent_revision_id) WHERE parent_revision_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS m05_species (
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, species_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(project_id,revision_id,species_id),
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_specifications (
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, specification_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(project_id,revision_id,specification_id),
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_areas (
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, area_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(project_id,revision_id,area_id),
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_alignments (
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, alignment_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(project_id,revision_id,alignment_id),
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_rules (
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, rule_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(project_id,revision_id,rule_id),
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_objects (
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, object_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(project_id,revision_id,object_id),
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_groups (
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, group_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(project_id,revision_id,group_id),
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_assets (
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, asset_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(project_id,revision_id,asset_id),
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_templates (
 project_id TEXT NOT NULL, revision_id TEXT NOT NULL, template_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(project_id,revision_id,template_id),
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_audit (
 audit_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TABLE IF NOT EXISTS m05_permissions (
 project_id TEXT NOT NULL REFERENCES m05_projects(project_id), user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('READER','EDITOR')), PRIMARY KEY(project_id,user_id)
);
-- S6/S9 services remain disabled; these are storage reservations only.
CREATE TABLE IF NOT EXISTS m05_previews (
 preview_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES m05_projects(project_id),
 owner_user_id TEXT NOT NULL, expires_at TEXT NOT NULL, digest TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE TABLE IF NOT EXISTS m05_export_jobs (
 job_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision_id TEXT NOT NULL,
 owner_user_id TEXT NOT NULL, status TEXT NOT NULL, storage_key TEXT,
 FOREIGN KEY(project_id,revision_id) REFERENCES m05_revisions(project_id,revision_id)
);
CREATE TRIGGER IF NOT EXISTS m05_revisions_no_update BEFORE UPDATE ON m05_revisions BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_revisions_no_delete BEFORE DELETE ON m05_revisions BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_species_no_update BEFORE UPDATE ON m05_species BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_species_no_delete BEFORE DELETE ON m05_species BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_specifications_no_update BEFORE UPDATE ON m05_specifications BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_specifications_no_delete BEFORE DELETE ON m05_specifications BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_areas_no_update BEFORE UPDATE ON m05_areas BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_areas_no_delete BEFORE DELETE ON m05_areas BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_alignments_no_update BEFORE UPDATE ON m05_alignments BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_alignments_no_delete BEFORE DELETE ON m05_alignments BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_rules_no_update BEFORE UPDATE ON m05_rules BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_rules_no_delete BEFORE DELETE ON m05_rules BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_objects_no_update BEFORE UPDATE ON m05_objects BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_objects_no_delete BEFORE DELETE ON m05_objects BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_groups_no_update BEFORE UPDATE ON m05_groups BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_groups_no_delete BEFORE DELETE ON m05_groups BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_assets_no_update BEFORE UPDATE ON m05_assets BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_assets_no_delete BEFORE DELETE ON m05_assets BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_templates_no_update BEFORE UPDATE ON m05_templates BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
CREATE TRIGGER IF NOT EXISTS m05_templates_no_delete BEFORE DELETE ON m05_templates BEGIN SELECT RAISE(ABORT, 'immutable M05 revision'); END;
