"""Synthetic browser integration. Requires existing verification Chromium + Python Playwright.
Run node scripts/build-cloudflare.mjs first. No real data, cloud resources or paid provider.
"""
import functools,http.server,json,threading,tempfile,shutil,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path.startswith('/api/'):
            result={'success':True,'data':{'configured':False,'authenticated':False}} if self.path=='/api/v1/status' else {'configured':False,'ready':False,'model':'deepseek-v4-pro','baseURL':'https://api.lk888.ai/v1'}
            data=json.dumps(result).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(data)
        else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'web')));threading.Thread(target=server.serve_forever,daemon=True).start()
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {fixture} from './tests/m05/fixtures.mjs';process.stdout.write(JSON.stringify(fixture()));"],cwd=root))
profile=tempfile.mkdtemp(prefix='m05-workbench-test-')
try:
 with sync_playwright() as playwright:
    def launch():return playwright.chromium.launch_persistent_context(profile,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=launch();page=context.pages[0];errors=[];page.on('pageerror',lambda e:errors.append(str(e)));url=f'http://127.0.0.1:{server.server_port}/';page.goto(url)
    page.locator('[data-work-action="geometry"]').click();page.locator('button[form="geometry-form"]').click();page.locator('[data-action="generate"]').click();page.wait_for_selector('svg[data-drawing="plan"]');original=page.evaluate('JSON.stringify(current().plan)')
    # Quota failure must not replace the existing live plan or stored plan.
    quota=page.evaluate('''() => {const old=Storage.prototype.setItem,before=JSON.stringify(current().plan);Storage.prototype.setItem=function(k,v){if(k===stateKey)throw new DOMException('Injected','QuotaExceededError');return old.call(this,k,v)};try{const ok=generate();return !ok&&JSON.stringify(current().plan)===before;}finally{Storage.prototype.setItem=old;}}''');assert quota
    page.locator('[data-m05-action="open"]').click();page.locator('#m05-cloud').filter(has_text='云端同步未启用').wait_for()
    page.locator('#m05-project-form [name="source_unit"]').select_option('m');page.locator('#m05-project-form [name="crs"]').fill('LOCAL_ENGINEERING:TEST_ROAD');page.locator('#m05-project-form [name="confirmed"]').check();page.locator('button[form="m05-project-form"]').click();page.locator('#m05-status').filter(has_text='独立版本').wait_for()
    assert page.locator('#m05-project-form').inner_text().find('当前版本 1')>=0
    page.locator('#m05-project-form [name="name"]').fill('工程资料第二版');page.locator('#m05-project-form [name="summary"]').fill('修改工程资料');page.locator('button[form="m05-project-form"]').click();page.locator('#m05-project-form').filter(has_text='当前版本 2').wait_for()
    page.locator('[data-m05-action="restore"]').last.click();page.locator('#m05-status').filter(has_text='创建恢复版本').wait_for();assert '当前版本 3' in page.locator('#m05-project-form').inner_text();assert page.evaluate('JSON.stringify(current().plan)')==original
    complete=page.evaluate('''async snapshot=>{const store=await import('/m05/local-store.mjs');const data=await store.save({legacyId:'complete-fixture',baseRevisionId:null,snapshot,summary:'完整合成工程',create:true});const archive=await store.exportProject(data.project.project_id);const copied=await store.importProject(archive,'complete-fixture-copy');const restored=await store.read(copied.project.project_id);return restored.snapshot;}''',fixture)
    assert complete==fixture
    aborted=page.evaluate('''async()=>{const store=await import('/m05/local-store.mjs'),list=await store.list(current().id),data=await store.read(list.active_project_id),old=IDBObjectStore.prototype.put;let rejected=false;IDBObjectStore.prototype.put=function(value){if(this.name==='projects')throw Error('Injected write failure');return old.call(this,value)};try{await store.save({projectId:data.project.project_id,baseRevisionId:data.revision.revision_id,snapshot:data.snapshot,summary:'失败注入'});}catch{rejected=true;}finally{IDBObjectStore.prototype.put=old;}const after=await store.read(data.project.project_id);return rejected&&after.revision.revision_id===data.revision.revision_id&&(await store.history(data.project.project_id)).length===3;}''')
    assert aborted
    archive=page.evaluate('''async()=>{const store=await import('/m05/local-store.mjs');const links=await store.list(current().id);return store.exportProject(links.active_project_id);}''')
    assert len(archive['revisions'])==3
    # Two saves based on one revision result in exactly one success.
    concurrent=page.evaluate('''async()=>{const store=await import('/m05/local-store.mjs'),links=await store.list(current().id),data=await store.read(links.active_project_id);const values=await Promise.allSettled([1,2].map(i=>store.save({projectId:data.project.project_id,baseRevisionId:data.revision.revision_id,snapshot:data.snapshot,summary:'并发测试'+i})));return values.map(x=>x.status==='fulfilled'?'saved':x.reason.status);}''');assert concurrent.count('saved')==1 and concurrent.count(409)==1
    # Corrupted archive is rejected before any write; valid archive creates a copy.
    copied=page.evaluate('''async bundle=>{const store=await import('/m05/local-store.mjs'),before=await store.list(current().id),bad=structuredClone(bundle);bad.revisions[0].snapshot.project.name='corrupt';let rejected=false;try{await store.importProject(bad,current().id);}catch{rejected=true;}const after=await store.list(current().id);if(!rejected||after.projects.length!==before.projects.length)throw Error('corrupt archive wrote');const imported=await store.importProject(bundle,current().id);const previous=await store.read(before.active_project_id);return {different:imported.project.project_id!==before.active_project_id,history:(await store.history(imported.project.project_id)).length,oldHistory:(await store.history(previous.project.project_id)).length};}''',archive)
    assert copied=={'different':True,'history':3,'oldHistory':4}
    context.close();context=launch();page=context.pages[0];page.goto(url);page.locator('[data-m05-action="open"]').click();page.locator('#m05-project-form').filter(has_text='当前版本 3').wait_for();assert page.locator('#m05-project-select option').count()==2
    assert page.evaluate('JSON.stringify(current().plan)')==original
    # Seed current/historical/unreferenced attachments, including CAD MIME and empty MIME.
    page.evaluate('''async()=>{const p=current();p.files.push({id:'current-file',name:'road.dxf',type:'application/dxf',category:'site'});p.versions[0].plan.aiImages=[{fileId:'historic-file'}];for(const [id,type]of[['current-file','application/dxf'],['historic-file','image/png'],['orphan-file','']])await fileStore('put',{id,file:new File(['synthetic:'+id],id+'.bin',{type,lastModified:123})});persist();}''')
    bundle=page.evaluate("async()=>{const data=await(await import('/m05/legacy-backup.mjs')).collectLegacyBackup();data.format='roadscape-backup-v1';return data;}")
    assert len(bundle['files'])==3
    # Native UI download uses the patched exporter.
    page.locator('#modal [data-action="close-modal"]').first.click();page.locator('[data-view="projects"]').click()
    with page.expect_download() as download:page.locator('[data-action="backup"]').click()
    data=json.loads(Path(download.value.path()).read_text());assert len(data['files'])==3
    clean_browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);clean_context=clean_browser.new_context();restored=clean_context.new_page();restored.goto(url)
    result=restored.evaluate('''async bundle=>{const module=await import('/m05/workspace-backup.mjs'),empty={projects:[],cases:[],norms:[]};localStorage.setItem(stateKey,JSON.stringify(empty));const next=await module.importWorkspace(bundle,empty,await fileDB);const exported=await(await import('/m05/legacy-backup.mjs')).collectLegacyBackup();return {projects:next.projects.length,files:exported.files};}''',bundle)
    assert {f['id']:f['sha256'] for f in result['files']}=={f['id']:f['sha256'] for f in bundle['files']}
    assert result['projects']==1
    # Conflicting metadata, corrupt Blob and quota failures never overwrite previous data.
    protection=restored.evaluate('''async bundle=>{const module=await import('/m05/workspace-backup.mjs'),current=JSON.parse(localStorage.getItem(stateKey)),before=localStorage.getItem(stateKey),db=await fileDB;const conflict=structuredClone(bundle);conflict.workspace.projects[0].name='different';let conflicts=false,hash=false,rollback=false;try{await module.importWorkspace(conflict,current,db);}catch{conflicts=true;}const bad=structuredClone(bundle);bad.files[0].sha256='0'.repeat(64);try{await module.importWorkspace(bad,current,db);}catch{hash=true;}const add=structuredClone(bundle);add.workspace.projects=[];add.workspace.cases=[];add.workspace.norms=[];add.files=[{id:'rollback-file',name:'new.txt',type:'text/plain',data:'data:text/plain;base64,dGVzdA=='}];const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===stateKey)throw Error('Injected quota');return old.call(this,k,v)};try{await module.importWorkspace(add,current,db);}catch{rollback=!(await fileStore('get','rollback-file'));}finally{Storage.prototype.setItem=old;}return {conflicts,hash,rollback,unchanged:localStorage.getItem(stateKey)===before};}''',bundle)
    assert all(protection.values()),protection
    assert not errors,errors
    print(json.dumps({'complete_eight_entity_snapshot_roundtrip':True,'indexeddb_failure_rolls_back_revision_and_pointer':True,'project_versions_survive_browser_restart':True,'history_restore_creates_new_revision':True,'concurrent_save_returns_409':True,'corrupt_archive_rejected':True,'archive_import_keeps_old_project':True,'all_three_attachment_kinds_exported':True,'native_backup_download_works':True,'cad_and_empty_mime_roundtrip':True,'conflicting_ids_rejected':True,'corrupt_blob_rejected':True,'quota_failure_rolls_back_new_attachments':True,'failed_plan_save_preserves_plan':True,'original_plan_preserved':True,'real_user_data_accessed':False},ensure_ascii=False));clean_browser.close();context.close()
finally:server.shutdown();server.server_close();shutil.rmtree(profile)
