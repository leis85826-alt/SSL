import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalD1,MemoryR2 } from './test-d1.mjs';
import { fixture } from './fixtures.mjs';
import { handleM05 } from '../../worker/m05/routes.mjs';
import { accountResolver } from '../../worker/m05/cloudflare-auth.mjs';
const origin='https://cloud-test.example';
const request=(path,method='GET',body,headers={})=>new Request(origin+'/api/v1'+path,{method,headers:{Origin:origin,...(body&&!(body instanceof Uint8Array)?{'Content-Type':'application/json'}:{}),...headers},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});
const hash=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const setup=()=>({M05_ENABLED:'true',M05_REQUIRE_ASSETS:'true',M05_DB:new LocalD1(),M05_FILES:new MemoryR2()});
const call=(env,path,method,body,actor='owner',headers)=>handleM05(request(path,method,body,headers),env,async()=>actor);
async function create(env,id='project1'){const snapshot=fixture();snapshot.assets=[];const response=await call(env,'/projects','POST',{project_id:id,snapshot,change_summary:'云端初始项目'});assert.equal(response.status,201);return (await response.json()).data;}
async function upload(env,id='file1',value='synthetic-file',actor='owner',headers={}){const bytes=new TextEncoder().encode(value);return call(env,'/projects/project1/assets/'+id,'PUT',bytes,actor,{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent('测试.dxf'),'X-File-Sha256':await hash(bytes),...headers});}
const descriptor=a=>({asset_id:a.asset_id,storage_key:a.storage_key,sha256:a.sha256,media_type:a.media_type,size_bytes:a.size_bytes});

test('Cloudflare Access validates signature/issuer/audience/time and derives stable cross-device account',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);Object.assign(jwk,{kid:'test-key',alg:'RS256',use:'sig'});
 const env={M05_ACCESS_TEAM_DOMAIN:'roadscape-test.cloudflareaccess.com',M05_ACCESS_AUD:'test-audience-12345'};
 const now=Math.floor(Date.now()/1000),base={iss:'https://'+env.M05_ACCESS_TEAM_DOMAIN,aud:[env.M05_ACCESS_AUD],sub:'same-account',iat:now,exp:now+3600};
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 async function token(claims=base,header={alg:'RS256',kid:'test-key'}){const raw=encode(header)+'.'+encode(claims);return raw+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(raw))).toString('base64url');}
 const originalFetch=globalThis.fetch;let lookups=0;
 globalThis.fetch=async url=>{lookups++;assert.equal(url,'https://roadscape-test.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
 try{
  const resolve=accountResolver(env),jwt=await token();
  const a=await resolve(new Request(origin,{headers:{'Cf-Access-Jwt-Assertion':jwt}}));
  const b=await resolve(new Request(origin,{headers:{Cookie:'CF_Authorization='+await token({...base,iat:now-10})}}));
  assert.match(a,/^access:[a-f0-9]{64}$/);assert.equal(a,b);
  for(const claims of [{...base,iss:'https://attacker.invalid'},{...base,aud:['wrong-audience']},{...base,exp:now-1},{...base,iat:now+100},{...base,nbf:now+100},{...base,sub:''},{...base,exp:String(now+3600)}])assert.equal(await resolve(new Request(origin,{headers:{'Cf-Access-Jwt-Assertion':await token(claims)}})),null);
  const parts=jwt.split('.');parts[1]=encode({...base,sub:'forged-user'});assert.equal(await resolve(new Request(origin,{headers:{'Cf-Access-Jwt-Assertion':parts.join('.')}})),null);
  assert.equal(await resolve(new Request(origin,{headers:{'Cf-Access-Jwt-Assertion':await token(base,{alg:'HS256',kid:'test-key'})}})),null);
  assert.equal(await resolve(new Request(origin,{headers:{'oai-authenticated-user-id':'owner','Cf-Access-Authenticated-User-Email':'fake@example.com'}})),null);
  assert.equal(lookups,1);assert.equal(accountResolver({M05_ACCESS_TEAM_DOMAIN:'localhost',M05_ACCESS_AUD:'test-audience'}),undefined);
 }finally{globalThis.fetch=originalFetch;}
});

test('private R2 upload/read is immutable, hash-checked and project-authorized',async()=>{
 const env=setup();await create(env);
 const response=await upload(env);assert.equal(response.status,201);const file=(await response.json()).data;
 assert.match(file.storage_key,/^m05\/project1\/file1\/[a-f0-9]{64}$/);assert.equal(env.M05_FILES.puts,1);
 assert.equal((await upload(env)).status,201);assert.equal(env.M05_FILES.puts,1);
 assert.equal((await upload(env,'file1','different')).status,409);assert.equal(env.M05_FILES.puts,1);
 assert.equal((await upload(env,'file2','private','stranger')).status,403);
 assert.equal((await call(env,'/projects/project1/assets/file1','GET',undefined,'stranger')).status,403);
 const got=await call(env,'/projects/project1/assets/file1');assert.equal(await got.text(),'synthetic-file');assert.match(got.headers.get('Content-Disposition'),/^attachment;/);assert.equal(got.headers.get('Cache-Control'),'private, no-store');
 const bad=await upload(env,'file3','bad','owner',{'X-File-Sha256':'0'.repeat(64)});assert.equal(bad.status,422);
 assert.equal((await upload(env,'file4','bad','owner',{'X-File-Name':'..%2Fsecret'})).status,422);
 assert.equal((await upload(env,'file5','bad','owner',{'Content-Type':'text/html'})).status,422);
 assert.equal(env.M05_FILES.puts,1);env.M05_DB.raw.close();
});

test('cloud save rejects missing/cross-project/tampered resource references and preserves old revision',async()=>{
 const env=setup(),first=await create(env);await create(env,'project2');const file=(await (await upload(env)).json()).data;
 const snapshot=structuredClone(first.snapshot);snapshot.assets=[descriptor(file)];
 const save=async(data=snapshot)=>call(env,'/projects/project1/snapshots','POST',{base_revision_id:first.revision.revision_id,snapshot:data,change_summary:'附带私有资源'});
 for(const edit of [a=>a.sha256='0'.repeat(64),a=>a.storage_key='m05/project2/secret',a=>a.asset_id='missing']){const wrong=structuredClone(snapshot);edit(wrong.assets[0]);assert.equal((await save(wrong)).status,422);}
 env.M05_FILES.objects.delete(file.storage_key);assert.equal((await save()).status,422);
 assert.equal((await (await call(env,'/projects/project1')).json()).data.revision.revision_id,first.revision.revision_id);
 env.M05_DB.raw.close();
});

test('file metadata failure never advances project pointer or overwrites earlier content',async()=>{
 const env=setup(),first=await create(env);const original=(await (await upload(env)).json()).data;
 env.M05_DB.raw.exec("CREATE TRIGGER injected_asset_failure BEFORE INSERT ON m05_asset_objects BEGIN SELECT RAISE(ABORT,'injected metadata failure'); END;");
 const failed=await upload(env,'file2','new-file');assert.equal(failed.status,500);assert.ok(!(await failed.text()).includes('injected'));
 assert.equal((await (await call(env,'/projects/project1')).json()).data.revision.revision_id,first.revision.revision_id);
 assert.equal(await(await call(env,'/projects/project1/assets/'+original.asset_id)).text(),'synthetic-file');
 assert.equal(env.M05_FILES.objects.size,2);env.M05_DB.raw.close();
});

test('project listing/history is account-scoped, login does not reveal tokens, and stale saves return 409',async()=>{
 const env=setup(),first=await create(env);const file=(await (await upload(env)).json()).data;
 const snapshot=structuredClone(first.snapshot);snapshot.assets=[descriptor(file)];
 const body={base_revision_id:first.revision.revision_id,snapshot,change_summary:'云端第二版'};
 assert.equal((await call(env,'/projects/project1/snapshots','POST',body)).status,201);
 assert.equal((await call(env,'/projects/project1/snapshots','POST',body)).status,409);
 assert.equal((await(await call(env,'/projects')).json()).data.projects.length,1);
 assert.equal((await(await call(env,'/projects','GET',undefined,'stranger')).json()).data.projects.length,0);
 assert.equal((await(await call(env,'/projects/project1/revisions')).json()).data.revisions.length,2);
 assert.equal((await call(env,'/projects/project1/revisions','GET',undefined,'stranger')).status,403);
 const login=await call(env,'/login');assert.equal(login.status,303);assert.equal(login.headers.get('Location'),'/');
 const me=(await(await call(env,'/me')).json()).data;assert.deepEqual(me,{account_id:'owner',files_ready:true});
 const csrf=await handleM05(new Request(origin+'/api/v1/projects/project1/assets/file3',{method:'PUT',headers:{Origin:'https://evil.invalid'},body:'secret'}),env,async()=> 'owner');assert.equal(csrf.status,403);
 env.M05_DB.raw.close();
});
