// Isolated LOCAL D1/R2 smoke test. Never provisions/deploys/migrates remote resources.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { spawn, execFileSync } from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'roadscape-cloud-test-'));
const port=Number(process.env.M05_TEST_PORT||4277);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local test port');
const env={...process.env,XDG_CONFIG_HOME:path.join(dir,'config'),WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(dir,'wrangler.log')};
const npmArgs=['--cache',path.join(os.tmpdir(),'roadscape-npm-cache'),'exec','--yes','--package=wrangler@4.152.0','--','wrangler'];
const config=path.join(dir,'wrangler.local.json'),state=path.join(dir,'state'),entry=path.join(dir,'entry.mjs');
fs.writeFileSync(entry,`// Verification-only identity stub. Never deploy this file.\nimport worker from ${JSON.stringify(path.join(root,'worker/cloudflare-entry.js'))};\nexport default {fetch(request,env,ctx){const auth={fetch:async req=>{const cookie=(req.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('test-account='));return Response.json({authenticated:!!cookie,user_id:cookie?.slice(13)});}};return worker.fetch(request,{...env,M05_AUTH:auth},ctx);}};\n`);
fs.writeFileSync(config,JSON.stringify({name:'roadscape-m05-local-test',main:entry,compatibility_date:'2026-10-23',assets:{directory:path.join(root,'web'),binding:'ASSETS',run_worker_first:true},vars:{M05_ENABLED:'true',M05_REQUIRE_ASSETS:'true',ROADSCAPE_SESSION_SECRET:'verification-only-not-a-production-secret-123456789'},d1_databases:[{binding:'M05_DB',database_name:'roadscape-m05-local',database_id:'11111111-1111-4111-8111-111111111111'}],r2_buckets:[{binding:'M05_FILES',bucket_name:'roadscape-m05-local-test'}]}));
const log=fs.openSync(path.join(dir,'dev.log'),'a');let dev;
try{
 execFileSync(process.execPath,['scripts/build-cloudflare.mjs'],{cwd:root,stdio:'inherit'});
 for(const migration of ['0001_s1.sql','0002_cloud_files.sql'])execFileSync('npm',[...npmArgs,'d1','execute','M05_DB','--local','--config',config,'--persist-to',state,'--file',path.join(root,'migrations/m05',migration)],{cwd:root,env,stdio:['ignore',log,log]});
 dev=spawn('npm',[...npmArgs,'dev','--local','--config',config,'--persist-to',state,'--port',String(port),'--local-protocol','https','--show-interactive-dev-session','false'],{cwd:root,env,stdio:['ignore',log,log],detached:true});
 const check=()=>new Promise(resolve=>{const req=https.get('https://localhost:'+port+'/api/v1/status',{rejectUnauthorized:false},r=>{r.resume();resolve(r.statusCode===200);});req.on('error',()=>resolve(false));req.setTimeout(1000,()=>{req.destroy();resolve(false);});});
 let ready=false;for(let i=0;i<90;i++){if(dev.exitCode!==null)throw Error('Local Worker exited');if(await check()){ready=true;break;}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('Local Worker did not become ready');
 await new Promise((resolve,reject)=>{const test=spawn('python',['tests/m05/cloud.browser.py'],{cwd:root,env:{...env,M05_LOCAL_TEST_ORIGIN:'https://localhost:'+port},stdio:'inherit'});test.on('error',reject);test.on('exit',code=>code===0?resolve():reject(Error('Browser test failed: '+code)));});
 console.log('Local-only Cloudflare D1/R2 smoke test passed. No remote resources used.');
}catch(error){console.error(fs.readFileSync(path.join(dir,'dev.log'),'utf8').slice(-5000));throw error;}
finally{if(dev?.pid){try{process.kill(-dev.pid,'SIGTERM');}catch{}await new Promise(r=>setTimeout(r,500));}fs.closeSync(log);fs.rmSync(dir,{recursive:true,force:true});}
