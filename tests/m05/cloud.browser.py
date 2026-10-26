"""Cross-device UI test against LOCAL Wrangler D1/R2 only.
Requires a local verification Worker with a test-only private account service.
M05_LOCAL_TEST_ORIGIN must name an HTTPS localhost endpoint; never production.
"""
import os,json,subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]
origin=os.environ.get('M05_LOCAL_TEST_ORIGIN','')
assert urlparse(origin).hostname in ['localhost','127.0.0.1'] and urlparse(origin).scheme=='https','Local HTTPS test endpoint required'
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {fixture} from './tests/m05/fixtures.mjs';process.stdout.write(JSON.stringify(fixture()));"],cwd=root))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 def device(account):
  ctx=browser.new_context(ignore_https_errors=True);ctx.add_cookies([{'name':'test-account','value':account,'url':origin}]);return ctx,ctx.new_page()
 first,a=device('alice');errors=[];a.on('pageerror',lambda e:errors.append(str(e)));a.goto(origin)
 a.locator('[data-work-action="geometry"]').click();a.locator('button[form="geometry-form"]').click();a.locator('[data-action="generate"]').click();a.wait_for_selector('svg[data-drawing="plan"]')
 seeded=a.evaluate('''async snapshot=>{const original=current(),store=await import('/m05/local-store.mjs');original.name='云端隔离测试-'+crypto.randomUUID().slice(0,8);const contents='synthetic-cad-attachment';const blob=new File([contents],'road.dxf',{type:'application/dxf',lastModified:123});await fileStore('put',{id:'asset1',file:blob});original.files.push({id:'asset1',name:blob.name,type:blob.type,size:blob.size,category:'site'});const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');snapshot.project.name=original.name;snapshot.assets[0]={asset_id:'asset1',storage_key:'indexeddb:asset1',sha256:sha,media_type:blob.type,size_bytes:blob.size};original.plan.signature=signature(original);db.projects.push(project('DO_NOT_UPLOAD_OTHER_PROJECT'));persist();const data=await store.save({legacyId:original.id,baseRevisionId:null,snapshot,summary:'完整八实体云端测试',create:true});return {name:original.name,legacyId:original.id,engineeringId:data.project.project_id,sha};}''',fixture)
 a.locator('[data-m05-action="open"]').click();a.locator('[data-cloud-action="upload"]').click();a.locator('#cloud-sync-status').filter(has_text='已保存云端版本与附件').wait_for(timeout=60000)
 uploaded=a.evaluate('''async()=>{const api=await import('/m05/cloud.mjs'),list=await api.listCloudProjects();const row=list.projects.find(p=>p.name===current().name);return {id:row.project_id,revision:row.current_revision_id};}''')
 second,b=device('alice');b.on('pageerror',lambda e:errors.append(str(e)));b.goto(origin);b.locator('[data-m05-action="open"]').click();b.locator('[data-cloud-action="list"]').click();b.locator('.version-row').filter(has_text=seeded['name']).locator('[data-cloud-action="download"]').click();b.locator('#cloud-sync-status').filter(has_text='已下载为新的本机工作台与工程副本').wait_for(timeout=60000)
 restored=b.evaluate('''async()=>{const store=await import('/m05/local-store.mjs'),links=await store.list(current().id),data=await store.read(links.active_project_id),blob=await fileStore('get',data.snapshot.assets[0].asset_id);return {id:current().id,name:current().name,species:data.snapshot.species.length,objects:data.snapshot.objects.length,bytes:await blob.file.text(),fresh:current().plan.signature===signature(current()),projects:db.projects.length,containsOther:JSON.stringify(db).includes('DO_NOT_UPLOAD_OTHER_PROJECT')};}''')
 assert restored['id']!=seeded['legacyId'] and restored['name']==seeded['name'];assert restored['species']==1 and restored['objects']==1
 assert restored['bytes']=='synthetic-cad-attachment' and restored['fresh'];assert restored['projects']==2 and not restored['containsOther']
 # Second device publishes a new version; the first device's base is rejected.
 b.locator('[data-cloud-action="upload"]').click();b.locator('#cloud-sync-status').filter(has_text='已保存云端版本与附件').wait_for(timeout=60000)
 a.locator('[data-cloud-action="upload"]').click();a.locator('#cloud-sync-status').filter(has_text='云端已有其他设备的新版本').wait_for(timeout=60000)
 assert a.evaluate('db.projects.some(p=>p.name==="DO_NOT_UPLOAD_OTHER_PROJECT")')
 stranger,c=device('bob');c.goto(origin)
 private=c.evaluate('''async id=>{const api=await import('/m05/cloud.mjs');const listed=await api.listCloudProjects();let denied=false;try{await api.cloudAPI('/projects/'+id);}catch(e){denied=e.status===403;}return {count:listed.projects.length,denied};}''',uploaded['id'])
 assert private=={'count':0,'denied':True};assert not errors,errors
 print(json.dumps({'local_wrangler_d1_r2':True,'same_account_two_isolated_devices':True,'workspace_engineering_and_blob_restore':True,'new_local_copy_preserves_existing_project':True,'source_plan_signature_remains_fresh':True,'unselected_project_not_uploaded':True,'second_device_saves_new_revision':True,'stale_first_device_does_not_overwrite':True,'other_account_cannot_list_or_read':True,'real_cloud_resources_accessed':False,'real_paid_model_called':False},ensure_ascii=False));browser.close()
