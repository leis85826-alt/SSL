import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
test('cloud configuration generator stays disabled by default and refuses overwrite/invalid destinations',()=>{
 const name='.m05-config-test-'+crypto.randomUUID()+'.jsonc',file=path.join(root,name);
 const args=['scripts/configure-m05-cloud.mjs','--database-id','11111111-1111-4111-8111-111111111111','--bucket','roadscape-test-files','--access-domain','test-team.cloudflareaccess.com','--aud','test-audience-12345','--out',name];
 try{
  execFileSync(process.execPath,args,{cwd:root});const config=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(config.vars.M05_ENABLED,'false');assert.equal(config.vars.M05_REQUIRE_ASSETS,'true');assert.equal(config.d1_databases[0].binding,'M05_DB');assert.equal(config.r2_buckets[0].binding,'M05_FILES');assert.equal(config.vars.ROADSCAPE_SESSION_SECRET,undefined);
  assert.notEqual(spawnSync(process.execPath,args,{cwd:root}).status,0);
  rmSync(file);execFileSync(process.execPath,[...args,'--enable'],{cwd:root});assert.equal(JSON.parse(readFileSync(file,'utf8')).vars.M05_ENABLED,'true');
  rmSync(file);const bad=[...args];bad[bad.indexOf('test-team.cloudflareaccess.com')]='https://bad.invalid';assert.notEqual(spawnSync(process.execPath,bad,{cwd:root}).status,0);
 }finally{rmSync(file,{force:true});}
});
