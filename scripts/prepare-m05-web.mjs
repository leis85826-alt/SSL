import fs from 'node:fs';
const from = new URL('../shared/m05/', import.meta.url), to = new URL('../web/m05/contracts/', import.meta.url);
fs.mkdirSync(to, { recursive: true });
for (const entry of fs.readdirSync(from)) if (entry.endsWith('.mjs')) fs.copyFileSync(new URL(entry, from), new URL(entry, to));
