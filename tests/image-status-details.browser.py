"""Read-only task diagnostics: distinguish pending, failed lookup and completed image.
All statuses are local synthetic responses. Never creates a paid image task.
"""
import functools,http.server,json,threading,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(tempfile.mkdtemp(prefix='roadscape-task-details-'))
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'configured':True,'ready':True,'model':'banana-2.1' if '/image/' in self.path else 'deepseek-v4-pro','baseURL':'https://api.lk888.ai/v1'}).encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'web')));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  mode={'value':'running'};queries=[];creates=[];source={}
  def status(route):
   queries.append(route.request.post_data_json)
   if mode['value']=='error':route.fulfill(status=502,json={'error':'服务商状态接口暂时不可用'});return
   done=mode['value']=='success';route.fulfill(json={'task_id':'194724370','project_id':source['id'],'source_digest':'a'*64,'model':'banana-2.1','state':'success' if done else 'running','is_final':done,'progress':'100%' if done else '45%','checked_at':'2026-10-29T08:00:00.000Z','response_ms':200,'provider_status':'已完成' if done else '等待转存 <script>window.statusX=1</script>','result_type':'image','has_result':True,**({'result_url':'https://cdn.example/result.svg'} if done else {})})
  page.route('**/api/image/status',status);page.route('**/api/image/generate',lambda r:(creates.append(1),r.abort('failed'))[-1]);page.route('https://cdn.example/**',lambda r:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"/>'))
  page.goto('http://127.0.0.1:'+str(server.server_port));page.wait_for_selector('[data-ai-key-state][data-configured="true"]')
  source=page.evaluate("""()=>{const p=current();p.plan=buildPlan(p);p.imageTask={task_id:'194724370',ticket:'DO_NOT_EXPORT_TICKET',apiKey:'DO_NOT_EXPORT_KEY',prompt:'DO_NOT_EXPORT_PROMPT',state:'running',source_digest:'a'.repeat(64),created_at:new Date(Date.now()-300000).toISOString(),params:{imageSize:'2K',aspectRatio:'16:9',thinkingLevel:'high',web_search:true,apiKey:'DO_NOT_EXPORT_PARAM_KEY'}};persist();render();return {id:p.id,plan:JSON.stringify(p.plan),versions:JSON.stringify(p.versions)};}""")
  page.locator('[data-view="effects"]').click();page.locator('[data-image-action="resume"]').click();page.wait_for_function('()=>current().imageTask.lastQuery?.state==="running"')
  assert 'is_final=false' in page.locator('[data-image-task-details]').inner_text();assert '等待已超过' in page.locator('[data-image-task-details]').inner_text();assert '尚未确认终态' in page.locator('[data-image-task-details]').inner_text();assert page.evaluate('window.statusX===undefined');assert page.locator('.generated-images figure').count()==0
  page.locator('[data-image-action="stop"]').click();page.wait_for_selector('[data-image-action="resume"]:enabled');page.screenshot(path=str(out/'pending.png'),full_page=True,animations='disabled')
  page.evaluate("()=>{current().imageTask.lastQuery.untrustedTicket='DO_NOT_EXPORT_NESTED';}")
  with page.expect_download() as result:page.locator('[data-image-action="diagnostic"]').click()
  raw=Path(result.value.path()).read_text();report=json.loads(raw);assert 'DO_NOT_EXPORT' not in raw;assert report['task_id']=='194724370';assert report['last_query']['state']=='running';assert report['last_query']['is_final']==False;assert report['query_count']>=1
  mode['value']='error';page.locator('[data-image-action="resume"]').click();page.locator('[data-image-progress]').filter(has_text='服务商状态接口暂时不可用').wait_for();assert '上方状态仅为此前记录' in page.locator('[data-image-task-details]').inner_text();assert page.evaluate('current().imageTask.state')=='running'
  page.reload();page.locator('[data-view="effects"]').click();assert '最近查询失败' in page.locator('[data-image-task-details]').inner_text()
  mode['value']='success';page.locator('[data-image-action="resume"]').click();page.wait_for_function('()=>current().effectImages?.length===1');assert page.evaluate('current().imageTask===null');assert page.evaluate('JSON.stringify(current().plan)')==source['plan'];assert page.evaluate('JSON.stringify(current().versions)')==source['versions'];assert not creates;assert not errors,errors
  print(json.dumps({'pending_evidence_and_age_visible':True,'pending_result_url_not_saved_as_success':True,'query_errors_not_mislabelled_as_generating':True,'evidence_survives_reload':True,'diagnostic_excludes_keys_tickets_prompt_and_unknown_fields':True,'success_updates_images':True,'no_creation_requests':True,'real_paid_calls':False,'screenshots':str(out)}));browser.close()
finally:server.shutdown();server.server_close()
