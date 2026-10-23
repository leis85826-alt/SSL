// Optional read-only preparation utility. Not automatically loaded by the workbench.
// Downloads include private project data: keep them outside Git and public sharing.
const KEY = 'roadscape-workspace-v1';
const dataURL = file => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
});
const digest = async file => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), b => b.toString(16).padStart(2,'0')).join('');
export async function collectLegacyBackup() {
  const raw = localStorage.getItem(KEY);
  if (!raw) throw new Error('没有本机工作空间，未生成备份');
  const workspace = JSON.parse(raw);
  if (!Array.isArray(workspace.projects) || !Array.isArray(workspace.cases)) throw new Error('工作空间结构不完整');
  const referenced = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (key === 'fileId' && typeof v === 'string') referenced.add(v);
      if (key === 'files' && Array.isArray(v)) for (const f of v) if (typeof f?.id === 'string') referenced.add(f.id);
      visit(v);
    }
  };
  visit(workspace);
  // Enumerate before opening: do not silently create an empty replacement database.
  if (!indexedDB.databases) throw new Error('浏览器不支持只读数据库枚举，请使用新版浏览器');
  const databases = await indexedDB.databases();
  let records = [];
  if (databases.some(d => d.name === 'roadscape-files')) {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('roadscape-files');
      req.onupgradeneeded = () => { req.transaction.abort(); reject(new Error('附件库已变化，请重试')); };
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    try {
      records = await new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly'); const req = tx.objectStore('files').getAll();
        tx.oncomplete = () => resolve(req.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('附件读取中断'));
      });
    } finally { db.close(); }
  }
  const ids = new Set(records.map(r => r.id));
  if ([...referenced].some(id => !ids.has(id))) throw new Error('存在缺失附件，未生成完整备份；请先核对本机原始资料');
  const files = [];
  // Include all stored Blobs, even currently unreferenced historical attachments.
  for (const r of records) {
    if (typeof r.id !== 'string' || !(r.file instanceof Blob)) throw new Error('附件记录异常，未生成备份');
    files.push({ id: r.id, name: r.file.name || 'attachment', type: r.file.type, lastModified: r.file.lastModified || 0, size: r.file.size, sha256: await digest(r.file), data: await dataURL(r.file) });
  }
  if (localStorage.getItem(KEY) !== raw) throw new Error('备份期间工作空间发生变化，请停止编辑后重试');
  return { format: 'roadscape-full-backup-v2', created_at: new Date().toISOString(), workspace, files, referenced_file_ids: [...referenced].sort(), verification: 'Blobs read and hashed; restore must be independently verified' };
}
export async function downloadLegacyBackup() {
  const bundle = await collectLegacyBackup();
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
  try { const a = document.createElement('a'); a.href = url; a.download = 'roadscape-full-backup-v2.json'; a.click(); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return { files: bundle.files.length, projects: bundle.workspace.projects.length };
}
