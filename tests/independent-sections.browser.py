"""A-style SVG integration and export. Synthetic local project, no AI calls.
Run node scripts/build-cloudflare.mjs first. Requires verification Playwright/Chromium.
"""
import functools,http.server,json,threading,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(tempfile.mkdtemp(prefix='roadscape-plan-a-'))
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   body={'success':True,'data':{'configured':False,'authenticated':False}} if self.path=='/api/v1/status' else {'configured':False,'ready':True,'model':'deepseek-v4-pro','baseURL':'https://api.lk888.ai/v1'}
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'web')));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1600,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_default_timeout(6000)
  origin=f'http://127.0.0.1:{server.server_port}';page.goto(origin)
  page.evaluate('''()=>{const p=current();p.scope={trees:true,side:false,median:false};p.roadSegments=[{type:'walk',width:3,name:'人行道'},{type:'trees',width:2.5,name:'行道树带'},{type:'road',width:11,name:'机动车道'},{type:'road',width:11,name:'机动车道'},{type:'trees',width:2.5,name:'行道树带'},{type:'walk',width:3,name:'人行道'}];p.geometryConfirmed=true;p.spacing=8;p.treeLayout='isolated';p.references=[];p.plan=buildPlan(p);p.plan.strips.trees.plants=[{name:'国槐',role:'乔木',position:'独立树池',form:'单排，株距8m'},{name:'麦冬',role:'草本',position:'树池内',form:'林下覆盖'}];p.plan.signature=signature(p);persist();render();}''')
  page.locator('[data-se="open"]').click();page.locator('[data-se="save"]').click()
  page.locator('[data-action="close-modal"]').click()
  page.evaluate("()=>{const p=current();p.sectionScene.style='line';p.sectionScene.objects[0].x+=19;p.sectionScene.objects[0].plantColor='#aa3377';delete p.sectionScenes;persist();render();}")
  legacy=page.evaluate('JSON.stringify(current().sectionScene.objects)')
  page.reload();page.locator('[data-se="open"]').click()
  assert page.locator('#section-style').input_value()=='line'
  page.locator('[data-se="add"]').first.click()
  assert page.evaluate('JSON.stringify(current().sectionScenes.collage.objects)')==legacy
  count=page.evaluate('current().sectionScene.objects.length')
  page.evaluate("()=>{const i=document.querySelector('#section-plant-color');i.value='#22aa44';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));}")
  line=page.evaluate('JSON.stringify(current().sectionScene.objects)')
  page.locator('#section-style').select_option('collage')
  assert page.evaluate('JSON.stringify(current().sectionScene.objects)')==legacy
  page.locator('[data-se="add"]').last.click();page.locator('[data-se="larger"]').click()
  page.locator('#section-plant-color').fill('#dd5522')
  collage=page.evaluate('JSON.stringify(current().sectionScene.objects)')
  assert collage!=line
  page.locator('#section-style').select_option('line')
  assert page.evaluate('JSON.stringify(current().sectionScene.objects)')==line
  page.locator('[data-se="undo"]').click()
  assert page.evaluate('JSON.stringify(current().sectionScenes.collage.objects)')==collage
  page.locator('[data-se="redo"]').click()
  assert page.evaluate('JSON.stringify(current().sectionScene.objects)')==line
  page.locator('#section-editor-canvas [data-section-object] > rect').last.click()
  page.locator('[data-se="delete"]').click()
  assert page.evaluate('current().sectionScene.objects.length')==count-1
  page.locator('#section-style').select_option('collage')
  assert page.evaluate('JSON.stringify(current().sectionScene.objects)')==collage
  page.locator('[data-action="close-modal"]').click()
  page.locator('[data-section-view="realistic"]').click()
  page.locator('#section-preview-style').select_option('line')
  assert page.evaluate('current().sectionScene.objects.length')==count-1
  page.reload();assert page.locator('#section-preview-style').input_value()=='line'
  page.locator('#section-preview-style').select_option('collage')
  assert page.evaluate('JSON.stringify(current().sectionScene.objects)')==collage
  page.locator('[data-se="open"]').click()
  before=page.evaluate('JSON.stringify(current().sectionScenes)')
  page.evaluate("()=>{window.normalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota')};}")
  page.locator('[data-se="add"]').first.click()
  assert page.evaluate('JSON.stringify(current().sectionScenes)')==before
  page.evaluate('()=>{Storage.prototype.setItem=window.normalSetItem;}')
  assert not errors,errors
  print('PASS: legacy shared layout safely copied, per-style add/delete/resize/color/history independent, preview/editor/reload switch restores each layout, failed save preserves both.')
  browser.close()
finally:server.shutdown();server.server_close()
