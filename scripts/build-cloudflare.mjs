import './prepare-m05-web.mjs';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist/cloudflare');
fs.mkdirSync(out, { recursive: true });
const source = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
if (!source.includes('__ROADSCAPE_ASSETS__')) throw new Error('Missing asset placeholder');
// Cloudflare serves web/ through ASSETS; do not embed large images in Worker code.
fs.writeFileSync(path.join(out, 'model-worker.mjs'), source.replace('__ROADSCAPE_ASSETS__', '{}'));
console.log('Cloudflare model Worker prepared; static assets remain in web/.');
