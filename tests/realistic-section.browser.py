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
  origin=f'http://127.0.0.1:{server.server_port}';page.goto(origin)
  page.evaluate('''()=>{const p=current();p.scope={trees:true,side:false,median:false};p.roadSegments=[{type:'walk',width:3,name:'人行道'},{type:'trees',width:2.5,name:'行道树带'},{type:'road',width:11,name:'机动车道'},{type:'road',width:11,name:'机动车道'},{type:'trees',width:2.5,name:'行道树带'},{type:'walk',width:3,name:'人行道'}];p.geometryConfirmed=true;p.spacing=8;p.treeLayout='isolated';p.references=[];p.plan=buildPlan(p);p.plan.strips.trees.plants=[{name:'国槐',role:'乔木',position:'独立树池',form:'单排，株距8m'},{name:'麦冬',role:'草本',position:'树池内',form:'林下覆盖'}];p.plan.signature=signature(p);persist();render();}''')
  before=page.evaluate('JSON.stringify(db)')
  page.locator('[data-section-view="realistic"]').click()
  cross=page.locator('svg[data-section-style="realistic"]')
  assert cross.get_attribute('data-total-width')=='33'
  assert cross.locator('[data-real-band]').count()==6
  assert cross.locator('[data-real-tree]').count()==2
  assert cross.locator('image[id$="-plants"]').get_attribute('href').startswith('data:image/png;base64,')
  assert cross.locator('[data-plant-material]').count()>0
  assert cross.locator('clipPath').count()==0
  assert page.evaluate('JSON.stringify(db)')==before
  cross.screenshot(path=str(out/'realistic-section.png'))
  page.reload();page.wait_for_selector('svg[data-section-style="realistic"]')
  assert page.evaluate('JSON.stringify(db)')==before
  with page.expect_download() as info:page.locator('[data-work-action="section"]').click()
  exported=Path(info.value.path()).read_text()
  assert 'data:image/png;base64,' in exported
  standalone=browser.new_page(viewport={'width':1200,'height':700})
  standalone.set_content(exported)
  assert standalone.locator('parsererror').count()==0
  standalone.locator('svg').first.screenshot(path=str(out/'realistic-export.png'))
  page.locator('[data-plan-view="simple"]').click()
  assert page.locator('svg[data-section-style="realistic"]').count()==1
  page.locator('[data-section-view="vector"]').click()
  assert page.locator('svg[data-section-style="realistic"]').count()==0
  assert page.evaluate('JSON.stringify(db)')==before
  page.evaluate("""()=>{const p=current();p.plan.strips.trees.pattern={segments:[{length:12,plants:['国槐']},{length:12,plants:['麦冬']}]};render();}""")
  page.locator('[data-section-view="realistic"]').click()
  assert page.locator('[data-real-panel]').count()==2
  assert page.locator('[data-real-tree]').count()==2
  assert page.locator('[data-real-understory]').count()==2
  page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  assert not errors,errors
  print(json.dumps({'realistic_section':True,'widths_and_project_preserved':True,'independent_switch_and_reload':True,'embedded_export':True,'segment_species':True,'screenshots':str(out)}))
  browser.close()
finally:server.shutdown();server.server_close()
