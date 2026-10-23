import './prepare-m05-web.mjs';
import fs from 'node:fs';
import path from 'node:path';
const local=process.argv.includes('--local');
const root=path.resolve(import.meta.dirname,'..'),web=path.join(root,'web'),out=path.join(root,'dist',...(local?['local']:[]));
const manifestName=local?'local-build.json':'hosting.json';
const manifestPath=path.join(root,'.openai',manifestName);
if(!fs.existsSync(manifestPath))throw new Error(`Missing ${manifestPath}. For local development run: node scripts/build-worker.mjs --local. Production requires the original platform hosting configuration.`);
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(local&&(manifest.version!==1||manifest.target!=='local-preview'||manifest.worker_entry!=='server/index.js'))throw new Error('Unsupported local build configuration');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};const assets={};
function add(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())add(file);else assets['/'+path.relative(web,file).replaceAll('\\','/')]={type:types[path.extname(file)]||'application/octet-stream',data:fs.readFileSync(file).toString('base64')};}}
add(web);const source=fs.readFileSync(path.join(root,'worker/index.js'),'utf8').replace('__ROADSCAPE_ASSETS__',JSON.stringify(assets));fs.mkdirSync(path.join(out,'server'),{recursive:true});fs.mkdirSync(path.join(out,'.openai'),{recursive:true});fs.writeFileSync(path.join(out,'server/index.js'),source);fs.copyFileSync(manifestPath,path.join(out,'.openai',manifestName));console.log('Built '+(local?'local preview':'hosting')+' Worker and embedded '+Object.keys(assets).length+' assets.');
