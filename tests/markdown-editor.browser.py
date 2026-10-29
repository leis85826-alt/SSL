"""Edit project Markdown safely; generation uses saved text. Local synthetic calls only."""
import functools,http.server,json,threading,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(tempfile.mkdtemp(prefix='roadscape-markdown-editor-'))
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'configured':True,'ready':True,'model':'banana-2.1' if '/image/' in self.path else 'deepseek-v4-pro','baseURL':'https://api.lk888.ai/v1'}).encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'web')));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1080});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));calls=[]
  def generate(route):
   calls.append(route.request.post_data_json);route.fulfill(status=201,json={'task_id':'edited-style','ticket':'synthetic-ticket','source_digest':calls[-1]['source_digest']})
  page.route('**/api/image/generate',generate);page.route('**/api/image/status',lambda r:r.fulfill(json={'task_id':'edited-style','is_final':True,'state':'success','project_id':calls[-1]['project_id'],'source_digest':calls[-1]['source_digest'],'model':'banana-2.1','result_url':'https://cdn.example/edited.svg'}));page.route('https://cdn.example/**',lambda r:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"/>'))
  page.goto('http://127.0.0.1:'+str(server.server_port));page.wait_for_selector('[data-ai-key-state][data-configured="true"]');saved=page.evaluate("""()=>{const p=current();p.geometryConfirmed=true;p.plan=buildPlan(p);p.plan.signature=signature(p);const second=project('另一个项目');db.projects.push(second);persist();render();return {id:p.id,second:second.id,plan:JSON.stringify(p.plan),signature:signature(p),versions:JSON.stringify(p.versions)};}""")
  page.locator('[data-view="effects"]').click();original='# 原始风格\n低空鸟瞰，晴天，暖色光线。'
  page.locator('#effect-style-file').set_input_files({'name':'原始风格.md','mimeType':'text/markdown','buffer':original.encode()});page.locator('.effect-style-loaded strong').filter(has_text='原始风格.md').wait_for();source=page.evaluate('current().effectStyle.fileId')
  def edit():page.locator('[data-image-action="edit-style"]').click();page.wait_for_selector('#effect-style-editor-form')
  edit();assert page.locator('#effect-style-text').input_value()==original;page.locator('#effect-style-text').fill('未保存的修改');page.locator('[data-image-action="reset-style-editor"]').click();assert page.locator('#effect-style-text').input_value()==original
  page.locator('#effect-style-text').fill('取消的修改');page.locator('#modal .modal-footer [data-action="close-modal"]').click();assert page.evaluate('current().effectStyle.text')==original
  edit();page.locator('#effect-style-text').fill('x'*10001);assert page.locator('[form="effect-style-editor-form"]').is_disabled();assert len(page.locator('#effect-style-text').input_value())==10001
  page.locator('#effect-style-text').fill('  ');assert page.locator('[form="effect-style-editor-form"]').is_disabled()
  modified='# 晴天鸟瞰风格\n柔和暖光、树冠层次清晰。\n</textarea><script>window.mdExecuted=true</script>'
  page.locator('#effect-style-name').fill('调整后的风格.md');page.locator('#effect-style-text').fill(modified);page.screenshot(path=str(out/'editor-desktop.png'),full_page=True,animations='disabled');page.locator('[form="effect-style-editor-form"]').click();page.wait_for_function('()=>!document.querySelector("#modal").open')
  current=page.evaluate('current().effectStyle');assert current['text']==modified and current['fileId']!=source;assert current['sourceFile']['fileId']==source
  assert page.evaluate('JSON.stringify(current().plan)')==saved['plan'];assert page.evaluate('signature(current())')==saved['signature'];assert page.evaluate('JSON.stringify(current().versions)')==saved['versions'];assert not calls
  assert page.evaluate('''async()=>await(await fileStore('get',current().effectStyle.fileId)).file.text()''')==modified
  assert page.evaluate('''async id=>await(await fileStore('get',id)).file.text()''',source)==original
  page.reload();page.locator('[data-view="effects"]').click();edit();assert page.locator('#effect-style-text').input_value()==modified;assert page.evaluate('window.mdExecuted===undefined')
  # Atomic rollback on quota failure; typed text stays available for manual backup/retry.
  page.locator('#effect-style-text').fill('保存失败也要保留的文字');page.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};}");page.locator('[form="effect-style-editor-form"]').click();page.locator('#effect-style-editor-status').filter(has_text='本机保存失败').wait_for();assert page.evaluate('current().effectStyle.text')==modified;assert page.locator('#effect-style-text').input_value()=='保存失败也要保留的文字';page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem;}');page.locator('#modal .modal-footer [data-action="close-modal"]').click()
  # Download active version and generate using precisely the saved text.
  with page.expect_download() as result:page.locator('.effect-style-loaded a').filter(has_text='下载当前').click()
  assert Path(result.value.path()).read_text()==modified
  page.locator('[data-image-action="generate"]').click();page.wait_for_function('()=>current().effectImages?.length===1');assert len(calls)==1 and modified in calls[0]['prompt'] and original not in calls[0]['prompt']
  backup=page.evaluate("""async()=>{const {collectLegacyBackup}=await import('/m05/legacy-backup.mjs');const b=await collectLegacyBackup();const s=current().effectStyle;return {active:b.files.some(f=>f.id===s.fileId),original:b.files.some(f=>f.id===s.sourceFile.fileId)};}""");assert backup=={'active':True,'original':True}
  # Editing a second time leaves the generated image tied to its original saved file.
  historic=page.evaluate('current().effectImages[0].style.fileId');edit();page.locator('#effect-style-text').fill(modified+'\n精细铺装。');page.locator('[form="effect-style-editor-form"]').click();page.wait_for_function('()=>!document.querySelector("#modal").open');assert page.evaluate('current().effectImages[0].style.fileId')==historic;assert page.evaluate('current().effectStyle.fileId')!=historic;assert page.evaluate('current().effectStyle.sourceFile.fileId')==source
  assert page.evaluate('''async id=>await(await fileStore('get',id)).file.text()''',historic)==modified
  modified+='\n精细铺装。'
  # Second project can author Markdown without an upload and does not change the first.
  page.locator('#effect-project').select_option(saved['second']);edit();page.locator('#effect-style-text').fill('# 第二项目\n自然光。');page.locator('[form="effect-style-editor-form"]').click();page.wait_for_function('()=>!document.querySelector("#modal").open');assert page.evaluate('db.projects.find(p=>p.id===\''+saved['id']+'\').effectStyle.text')==modified
  edit();page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'editor-mobile.png'),full_page=True,animations='disabled');assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth');assert page.locator('[form="effect-style-editor-form"]').evaluate('(el)=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}');page.locator('#modal .modal-footer [data-action="close-modal"]').click()
  # Reject a stale edit when another tab has changed the saved style.
  edit();page.locator('#effect-style-text').fill('旧窗口的修改');page.evaluate("()=>{const disk=JSON.parse(localStorage.getItem(stateKey));disk.projects.find(p=>p.id===current().id).effectStyle.fileId='updated-in-other-tab';localStorage.setItem(stateKey,JSON.stringify(disk));}");page.locator('[form="effect-style-editor-form"]').click();page.locator('#effect-style-editor-status').filter(has_text='其他页面已更新').wait_for();assert page.evaluate('current().effectStyle.text')=='# 第二项目\n自然光。'
  assert not errors,errors
  print(json.dumps({'upload_edit_reset_cancel':True,'no_silent_truncation':True,'saved_version_survives_reload':True,'original_and_history_files_immutable':True,'atomic_storage_failure':True,'edited_text_used_for_generation':True,'backup_contains_both_versions':True,'new_markdown_without_upload':True,'projects_isolated':True,'stale_edit_rejected':True,'markup_not_executed':True,'mobile_no_overflow':True,'real_paid_calls':False,'screenshots':str(out)}));browser.close()
finally:server.shutdown();server.server_close()
