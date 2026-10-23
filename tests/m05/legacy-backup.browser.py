"""Isolated Chromium backup/restore exercise; never opens the public site or real user storage.
Requires Python playwright and Chromium in the verification environment, no app runtime dependency.
"""
import functools, http.server, json, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[2]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(root)))
thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        source = browser.new_context(); page = source.new_page()
        url = f'http://127.0.0.1:{server.server_port}/'
        page.goto(url)
        page.evaluate('''async () => {
          localStorage.setItem('roadscape-workspace-v1', JSON.stringify({projects:[{id:'test-project',files:[{id:'current'}],versions:[{plan:{aiImages:[{fileId:'historical'}]},inputs:{files:[]}}]}],cases:[],norms:[]}));
          localStorage.setItem('unrelated-secret', 'FAKE_TEST_SECRET_DO_NOT_BACKUP');
          const db = await new Promise((ok,no) => { const r=indexedDB.open('roadscape-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error); });
          await new Promise((ok,no)=>{const tx=db.transaction('files','readwrite');for(const id of ['current','historical','unreferenced'])tx.objectStore('files').put({id,file:new File(['synthetic:'+id],id+'.txt',{type:'text/plain',lastModified:123})});tx.oncomplete=ok;tx.onerror=()=>no(tx.error);}); db.close();
        }''')
        before = page.evaluate("localStorage.getItem('roadscape-workspace-v1')")
        bundle = page.evaluate("async () => (await import('/web/m05/legacy-backup.mjs')).collectLegacyBackup()")
        assert len(bundle['files']) == 3
        assert bundle['referenced_file_ids'] == ['current', 'historical']
        assert 'FAKE_TEST_SECRET' not in json.dumps(bundle)
        assert before == page.evaluate("localStorage.getItem('roadscape-workspace-v1')")
        # Restore only into this newly created empty browser context, never an existing user workspace.
        target = browser.new_context(); restored = target.new_page(); restored.goto(url)
        result = restored.evaluate('''async bundle => {
          if(localStorage.getItem('roadscape-workspace-v1')!==null || (await indexedDB.databases()).length)throw Error('target not empty');
          const rows=[];
          for(const f of bundle.files){const blob=await (await fetch(f.data)).blob();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==f.sha256||blob.size!==f.size)throw Error('hash mismatch');rows.push({id:f.id,file:new File([blob],f.name,{type:f.type,lastModified:f.lastModified})});}
          const db=await new Promise((ok,no)=>{const r=indexedDB.open('roadscape-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
          await new Promise((ok,no)=>{const tx=db.transaction('files','readwrite');for(const row of rows)tx.objectStore('files').add(row);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();
          localStorage.setItem('roadscape-workspace-v1',JSON.stringify(bundle.workspace));
          return (await import('/web/m05/legacy-backup.mjs')).collectLegacyBackup();
        }''', bundle)
        assert result['workspace'] == bundle['workspace']
        assert result['files'] == bundle['files']
        restored.reload()
        assert restored.evaluate("JSON.parse(localStorage.getItem('roadscape-workspace-v1')).projects[0].versions[0].plan.aiImages[0].fileId") == 'historical'
        missing = page.evaluate('''async () => {
          const value=JSON.parse(localStorage.getItem('roadscape-workspace-v1'));value.projects[0].versions[0].plan.aiImages.push({fileId:'missing'});localStorage.setItem('roadscape-workspace-v1',JSON.stringify(value));
          try {await (await import('/web/m05/legacy-backup.mjs')).collectLegacyBackup();return false;}catch(e){return e.message.includes('缺失附件');}
        }''')
        assert missing
        print(json.dumps({'all_blobs_preserved':True,'historical_image_reference_preserved':True,'isolated_restore_and_hashes_match':True,'missing_attachment_blocks_export':True,'other_localstorage_excluded':True,'real_user_data_accessed':False},ensure_ascii=False))
        browser.close()
finally:
    server.shutdown(); server.server_close()
