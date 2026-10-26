"""Standalone effects page and Markdown input, synthetic model tasks only."""
import functools,http.server,json,threading,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(tempfile.mkdtemp(prefix='roadscape-effects-'))
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   body={'configured':True,'ready':True,'model':'banana-2.1' if '/image/' in self.path else 'deepseek-v4-pro','baseURL':'https://api.lk888.ai/v1'}
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'web')));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  calls=[]
  def generate(route):
   body=route.request.post_data_json;calls.append(body);route.fulfill(status=201,json={'task_id':'synthetic-one','ticket':'synthetic-ticket','model':'banana-2.1','source_digest':body['source_digest']})
  page.route('**/api/image/generate',generate)
  page.route('**/api/image/status',lambda route:route.fulfill(json={'task_id':'synthetic-one','is_final':True,'state':'success','result_url':'https://cdn.example/effect.svg','model':'banana-2.1','project_id':calls[-1]['project_id'],'source_digest':calls[-1]['source_digest']}))
  page.route('https://cdn.example/**',lambda route:route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="500" height="280"><rect width="500" height="280" fill="#a1b36d"/></svg>'))
  page.goto('http://127.0.0.1:'+str(server.server_port));page.wait_for_selector('[data-ai-key-state][data-configured="true"]')
  seed=page.evaluate("""()=>{const p=current();p.geometryConfirmed=true;p.plan=buildPlan(p);p.plan.signature=signature(p);p.effectImages=[{task_id:'old-image',url:'https://cdn.example/old.svg',at:stamp(),params:{imageSize:'1K',aspectRatio:'16:9'}}];const second=project('第二个项目');db.projects.push(second);persist();render();return {id:p.id,second:second.id,plan:JSON.stringify(p.plan),signature:signature(p),versions:JSON.stringify(p.versions)};}""")
  assert page.locator('main .image-model-panel').count()==0
  nav=page.locator('nav [data-view]').evaluate_all('(els)=>els.map(e=>e.dataset.view)');assert nav.index('effects')==nav.index('workbench')+1
  page.locator('[data-view="effects"]').click();assert page.locator('#effect-project').input_value()==seed['id'];assert page.locator('.generated-images figure').count()==1
  style='# 我的道路风格\n低饱和灰绿，柔和晨光，人视角，保持植物层次。\n<script>window.markdownExecuted=true</script>\n[参考链接](https://never-fetch.example/style)'
  page.locator('#effect-style-file').set_input_files({'name':'我的风格.md','mimeType':'text/markdown','buffer':style.encode()});page.locator('.effect-style-loaded strong').filter(has_text='我的风格.md').wait_for()
  assert page.evaluate('current().effectStyle.text')==style;assert page.evaluate('window.markdownExecuted===undefined');assert not calls
  assert page.evaluate('JSON.stringify(current().plan)')==seed['plan'];assert page.evaluate('signature(current())')==seed['signature']
  page.locator('.effect-style details').evaluate('(e)=>e.open=true');page.screenshot(path=str(out/'desktop.png'),full_page=True,animations='disabled')
  page.reload();page.locator('[data-view="effects"]').click();assert page.locator('.effect-style-loaded strong').inner_text()=='我的风格.md'
  assert page.evaluate('''async()=>{const f=await fileStore('get',current().effectStyle.fileId);return await f.file.text();}''')==style
  # Invalid/oversized inputs preserve the previous file and never create paid tasks.
  for name,content in [('not-md.txt',b'bad'),('long.md',b'x'*10001),('huge.md',b'x'*65537),('bad-utf8.md',b'\xff\xfe\x00')]:
   page.locator('#effect-style-file').set_input_files({'name':name,'mimeType':'text/plain','buffer':content});assert page.locator('.effect-style-loaded strong').inner_text()=='我的风格.md'
  # Storage failures preserve the loaded style; prompt limits reject before any task creation.
  page.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('test quota','QuotaExceededError');};}")
  page.locator('#effect-style-file').set_input_files({'name':'unsaved.md','mimeType':'text/markdown','buffer':b'# not saved'})
  page.locator('#effect-style-status').filter(has_text='本机存储不足').wait_for();assert page.evaluate('current().effectStyle.name')=='我的风格.md'
  page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem;}')
  page.evaluate("()=>{window.originalPlan=JSON.stringify(current().plan);current().plan.strips.median.plantingForm='x'.repeat(16001);persist();}")
  page.locator('[data-image-action="generate"]').click();page.locator('#toast').filter(has_text='超过16000字').wait_for();assert not calls;assert page.evaluate('!current().imageTask')
  page.evaluate('()=>{current().plan=JSON.parse(window.originalPlan);persist();}')
  page.locator('[data-image-field="instruction"]').fill('突出道路林荫空间');page.locator('[data-image-action="generate"]').click();page.wait_for_function('()=>current().effectImages.length===2')
  assert len(calls)==1 and style in calls[0]['prompt'] and '突出道路林荫空间' in calls[0]['prompt'];assert calls[0]['project_id']==seed['id']
  assert page.evaluate('current().effectImages.at(-1).style.name')=='我的风格.md';assert page.evaluate('JSON.stringify(current().plan)')==seed['plan'];assert page.evaluate('JSON.stringify(current().versions)')==seed['versions']
  # Project scoping and no-plan behavior.
  page.locator('#effect-project').select_option(seed['second']);assert page.locator('.effect-style-loaded').count()==0;assert page.locator('[data-image-action="generate"]').is_disabled()
  page.locator('#effect-project').select_option(seed['id']);assert page.locator('.effect-style-loaded strong').inner_text()=='我的风格.md'
  # Full workspace backup includes original Markdown and its reference.
  backup=page.evaluate("""async()=>{const {collectLegacyBackup}=await import('/m05/legacy-backup.mjs');const data=await collectLegacyBackup();const style=current().effectStyle;return {contains:data.files.some(f=>f.id===style.fileId),ref:data.workspace.projects.find(p=>p.id===current().id).effectStyle.fileId===style.fileId};}""");assert backup=={'contains':True,'ref':True}
  page.locator('[data-image-action="remove-style"]').click();assert page.evaluate('current().effectStyle===null');assert page.evaluate('current().effectImages.length')==2;assert page.evaluate('current().effectImages.at(-1).style.name')=='我的风格.md'
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'mobile.png'),full_page=True,animations='disabled');assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  assert not errors,errors
  print(json.dumps({'separate_navigation':True,'markdown_saved_and_restored':True,'markdown_is_text_only':True,'invalid_files_preserve_previous':True,'style_in_generation_prompt':True,'one_task_only':True,'project_scoped':True,'original_plan_and_history_preserved':True,'backup_includes_original_markdown':True,'mobile_no_overflow':True,'real_paid_calls':False,'screenshots':str(out)}));browser.close()
finally:server.shutdown();server.server_close()
