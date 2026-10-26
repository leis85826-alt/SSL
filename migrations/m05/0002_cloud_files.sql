-- Additive resource metadata. Files remain private in a separately bound R2 bucket.
CREATE TABLE IF NOT EXISTS m05_asset_objects (
 project_id TEXT NOT NULL REFERENCES m05_projects(project_id),
 asset_id TEXT NOT NULL,
 storage_key TEXT NOT NULL UNIQUE,
 sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
 size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0 AND size_bytes <= 26214400),
 media_type TEXT NOT NULL,
 file_name TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('FILE','WORKBENCH_MANIFEST')),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(project_id,asset_id)
);
CREATE INDEX IF NOT EXISTS m05_asset_project ON m05_asset_objects(project_id,created_at);
INSERT OR IGNORE INTO m05_schema_version VALUES (2);
