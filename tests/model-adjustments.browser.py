"""Actual adjustment UI with local synthetic model responses; never calls a paid provider."""
import functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   body={'configured':True,'ready':True,'model':'deepseek-v4-pro','baseURL':'https://api.lk888.ai/v1'}
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'web')));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:'+str(server.server_port));page.wait_for_selector('[data-ai-key-state][data-configured="true"]')
  page.evaluate("()=>{const p=current();p.geometryConfirmed=true;p.generationMode='rules';p.plan=buildPlan(p);p.plan.signature=signature(p);persist();render();}")
  text='中分带上层乔木为金叶复叶槭+白皮松+紫叶李交替种植，下层地被搭配麦冬+金叶女贞+胶东卫矛'
  plants=[{'name':name,'role':role,'position':layer,'form':'混合配置，规格待核实'} for name,role,layer in [('金叶复叶槭','乔木','上层'),('白皮松','乔木','上层'),('紫叶李','小乔木','上层'),('麦冬','草本','下层'),('金叶女贞','灌木','下层'),('胶东卫矛','灌木','下层')]]
  part={'description':'保留上层三种乔木与下层三种灌木地被的搭配','plants':plants,'pattern':None}
  design={'title':'模型调整测试方案','spacing':8,'treeLayout':'continuous','parts':{k:part for k in ['trees','side','median']},'warnings':['交替段长度和适生性待核实']}
  calls=[]
  def success(route):
   calls.append(route.request.post_data_json);route.fulfill(json={'design':design,'model':'deepseek-v4-pro','provider':'https://api.lk888.ai/v1'})
  page.route('**/api/model/generate',success)
  assert page.locator('#revision-mode').input_value()=='api';assert 'DS-V4-Pro' in page.locator('#revision-help').inner_text()
  before=page.evaluate('JSON.stringify(current().plan)');widths=page.evaluate('JSON.stringify(RoadscapeWorkspace.segments(current()))')
  page.locator('#revision-text').fill(text);page.locator('[data-rules-action="revise"]').click();page.wait_for_function("()=>current().plan.ai?.model==='deepseek-v4-pro'")
  assert len(calls)==1 and calls[0]['adjustment']==text and calls[0]['currentPlan']['parts']
  assert page.evaluate("current().generationMode")=='api';assert page.evaluate('JSON.stringify(RoadscapeWorkspace.segments(current()))')==widths
  assert page.evaluate('current().plan.strips.median.plants.length')==6;assert page.evaluate('current().adjustmentReports.at(-1).pending[0]')=='交替段长度和适生性待核实'
  assert page.evaluate('current().versions.length')==1;assert not page.locator('#revision-feedback').count()
  assert page.locator('#revision-text').input_value()==''
  # Errors and stale returns preserve the entire original project, keeping the user's text.
  before=page.evaluate('JSON.stringify(current())');page.unroute('**/api/model/generate',success)
  page.route('**/api/model/generate',lambda route:route.fulfill(status=502,json={'error':'模拟服务商失败'}))
  page.locator('#revision-text').fill(text);page.locator('[data-rules-action="revise"]').click();page.wait_for_selector('#ai-last-error')
  assert page.evaluate('JSON.stringify(current())')==before;assert page.locator('#revision-text').input_value()==text
  assert page.locator('.scheme-revision #ai-last-error').count()==1
  page.unroute('**/api/model/generate')
  def stale(route):
   page.evaluate("()=>{current().constraints='请求中发生的新修改';persist();}");route.fulfill(json={'design':design,'model':'deepseek-v4-pro'})
  page.route('**/api/model/generate',stale);page.locator('[data-rules-action="revise"]').click();page.locator('#ai-last-error').filter(has_text='设计条件已变更').wait_for();assert page.evaluate('current().versions.length')==1
  # Explicit rules mode remains local; complex text never silently calls the model.
  page.locator('#revision-mode').select_option('rules');page.locator('[data-rules-action="revise"]').click();page.wait_for_selector('#revision-feedback');assert len(calls)==1
  # No configuration: open settings; preserve draft across rendering after configuration.
  page.route('**/api/model/config',lambda route:route.fulfill(json={'configured':False,'ready':True,'model':'deepseek-v4-pro','baseURL':'https://api.lk888.ai/v1'}))
  page.locator('#revision-mode').select_option('api');page.locator('[data-rules-action="revise"]').click();page.wait_for_selector('#model-form');assert page.locator('#revision-text').input_value()==text
  page.evaluate('()=>render()');assert page.locator('#revision-text').input_value()==text
  assert not errors,errors
  print(json.dumps({'model_adjusts_rule_origin_plan':True,'complete_text_and_current_plan_sent':True,'six_species_and_layers_preserved':True,'widths_and_history_preserved':True,'error_and_stale_response_do_not_overwrite':True,'rules_mode_stays_local':True,'missing_config_retains_draft':True,'real_paid_calls':False}));browser.close()
finally:server.shutdown();server.server_close()
