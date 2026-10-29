"""Reproduce failed browser fetch after image submission; recover without re-creating.
All tasks and service responses are synthetic; never calls real image providers.
"""
import functools,http.server,json,threading,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(tempfile.mkdtemp(prefix='roadscape-image-recovery-'))
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'configured':True,'ready':True,'model':'banana-2.1' if '/image/' in self.path else 'deepseek-v4-pro','baseURL':'https://api.lk888.ai/v1'}).encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'web')));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  creates=[];recovers=[];statuses=[]
  def lost(route):creates.append(route.request.post_data_json);route.abort('failed')
  def recover(route):
   recovers.append(route.request.post_data_json)
   if route.request.post_data_json['task_id']=='bad-task':route.fulfill(status=502,json={'error':'任务编号不匹配'});return
   route.fulfill(json={'task_id':'123456','ticket':'restored-ticket','model':'banana-2.1','source_digest':creates[0]['source_digest']})
  def status(route):
   statuses.append(route.request.post_data_json);route.fulfill(json={'task_id':'123456','project_id':creates[0]['project_id'],'source_digest':creates[0]['source_digest'],'model':'banana-2.1','state':'success','is_final':True,'result_url':'https://cdn.example/recovered.svg'})
  page.route('**/api/image/generate',lost);page.route('**/api/image/recover',recover);page.route('**/api/image/status',status)
  page.route('https://cdn.example/**',lambda r:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"/>'))
  page.goto('http://127.0.0.1:'+str(server.server_port));page.wait_for_selector('[data-ai-key-state][data-configured="true"]')
  saved=page.evaluate("""()=>{const p=current();p.geometryConfirmed=true;p.plan=buildPlan(p);p.plan.signature=signature(p);p.imagePreferences={imageSize:'2K',aspectRatio:'16:9',thinkingLevel:'high',web_search:true,instruction:'测试'};p.effectImages=[{task_id:'old',url:'https://cdn.example/old.svg',params:{imageSize:'1K'},at:stamp()}];persist();render();return {plan:JSON.stringify(p.plan),versions:JSON.stringify(p.versions)};}""")
  page.locator('[data-view="effects"]').click();page.locator('[data-image-action="generate"]').click();page.wait_for_selector('#image-recovery-id')
  assert len(creates)==1;assert page.evaluate('current().imageTask.state')=='unknown';assert page.locator('[data-image-action="generate"]').is_disabled();assert '连接中断' in page.locator('[data-image-progress]').inner_text()
  assert page.evaluate('JSON.stringify(current().plan)')==saved['plan'];assert page.locator('.generated-images figure').count()==1
  page.reload();page.locator('[data-view="effects"]').click();page.wait_for_selector('#image-recovery-id');assert len(creates)==1
  page.screenshot(path=str(out/'recovery.png'),full_page=True,animations='disabled')
  page.locator('#image-recovery-id').fill('bad-task');page.locator('[data-image-action="recover"]').click();page.locator('[data-image-progress]').filter(has_text='任务编号不匹配').wait_for();assert page.evaluate('current().imageTask.state')=='unknown'
  page.locator('#image-recovery-id').fill('123456');page.locator('[data-image-action="recover"]').click();page.wait_for_function('()=>current().effectImages.length===2')
  assert len(creates)==1 and len(recovers)==2 and len(statuses)==1;assert page.evaluate('current().imageTask===null');assert page.evaluate('JSON.stringify(current().plan)')==saved['plan'];assert page.evaluate('JSON.stringify(current().versions)')==saved['versions']
  assert page.locator('[data-image-action="generate"]').is_enabled()
  # A server-confirmed rejection before dispatch must not lock the button.
  page.unroute('**/api/image/generate');page.route('**/api/image/generate',lambda r:r.fulfill(status=401,json={'error':'配置已过期','creation_state':'not_created'}));page.locator('[data-image-action="generate"]').click();page.wait_for_function("()=>current().imageTask?.state==='failed'");assert page.locator('[data-image-action="generate"]').is_enabled();assert page.locator('#image-recovery-id').count()==0
  # Configuration preflight networking failure sends no creation request and adds no unknown task.
  page.evaluate('()=>{current().imageTask=null;persist();}');page.reload();page.locator('[data-view="effects"]').click();page.route('**/api/image/config',lambda r:r.abort('failed'));page.locator('[data-image-action="generate"]').click();page.locator('#toast').filter(has_text='连接中断').wait_for();assert page.evaluate('current().imageTask===null')
  assert not errors,errors
  print(json.dumps({'lost_creation_response_reproduced':True,'unknown_task_retained_on_reload':True,'recovery_without_second_creation':True,'bad_task_preserves_original_record':True,'old_images_and_plant_plan_preserved':True,'known_preflight_rejection_unlocks':True,'config_network_failure_never_creates':True,'real_paid_calls':False,'screenshots':str(out)}));browser.close()
finally:server.shutdown();server.server_close()
