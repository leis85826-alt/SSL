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
  before=page.evaluate('JSON.stringify(current().plan)')
  page.locator('[data-se="open"]').click()
  page.wait_for_selector('#section-editor-canvas')
  count=page.locator('#section-editor-canvas [data-section-object]').count();assert count>=2
  page.locator('[data-se="add"]').first.click()
  assert page.locator('#section-editor-canvas [data-section-object]').count()==count+1
  positions=page.evaluate('JSON.stringify(current().sectionScene.objects)')
  page.locator('#section-style').select_option('line')
  assert page.locator('[data-editor-style="line"]').count()==1
  assert page.locator('[data-bold-ground]').first.get_attribute('stroke-width')=='3'
  assert page.locator('[data-entourage="pedestrian"]').first.get_attribute('fill')=='#dc3548'
  assert page.locator('[data-entourage="car"]').first.get_attribute('fill')=='#07506c'
  assert page.locator('#section-editor-canvas image').count()==0
  assert page.locator('[data-line-plant]').count()==count+1
  assert page.evaluate('JSON.stringify(current().sectionScene.objects)')==positions
  page.locator('#section-editor-canvas').screenshot(path='/tmp/line-section-preview.png')
  with page.expect_download() as line_info:page.locator('[data-se="export"]').click()
  line_svg=Path(line_info.value.path()).read_text();assert '<image' not in line_svg and '彩色剪影' in line_svg
  page.locator('[data-se="undo"]').click()
  assert page.locator('#section-style').input_value()=='collage'
  page.locator('[data-se="redo"]').click()
  assert page.locator('#section-style').input_value()=='line'
  page.reload();page.locator('[data-se="open"]').click()
  assert page.locator('#section-style').input_value()=='line'
  page.locator('#section-style').select_option('collage')
  page.locator('#section-editor-canvas [data-section-object] > rect').last.click()
  page.locator('[data-se="duplicate"]').click()
  assert page.locator('#section-editor-canvas [data-section-object]').count()==count+2
  page.locator('[data-se="delete"]').click()
  assert page.locator('#section-editor-canvas [data-section-object]').count()==count+1
  page.locator('[data-se="undo"]').click()
  assert page.locator('#section-editor-canvas [data-section-object]').count()==count+2
  page.locator('[data-se="redo"]').click()
  assert page.locator('#section-editor-canvas [data-section-object]').count()==count+1
  obj=page.locator('#section-editor-canvas [data-section-object] > rect').first
  obj.scroll_into_view_if_needed();box=obj.bounding_box();page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
  old=page.evaluate('current().sectionScene.objects[0].h')
  page.locator('[data-se="larger"]').click()
  assert page.evaluate('current().sectionScene.objects[0].h')>old
  obj=page.locator('#section-editor-canvas [data-section-object] > rect').first;box=obj.bounding_box()
  oldx=page.evaluate('current().sectionScene.objects[0].x')
  page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']/2+35,box['y']+box['height']/2,steps=5);page.mouse.up()
  assert page.evaluate('current().sectionScene.objects[0].x')>oldx
  assert page.evaluate('current().sectionScene.objects[0].y')==385
  handle=page.locator('[data-section-handle]').bounding_box();oldh=page.evaluate('current().sectionScene.objects[0].h')
  page.mouse.move(handle['x']+5,handle['y']+5);page.mouse.down();page.mouse.move(handle['x']+5,handle['y']-20,steps=5);page.mouse.up()
  assert page.evaluate('current().sectionScene.objects[0].h')>oldh
  assert page.evaluate('JSON.stringify(current().plan)')==before
  with page.expect_download() as info:page.locator('[data-se="export"]').click()
  exported=Path(info.value.path()).read_text();assert 'data-section-handle' not in exported and 'data:image/png;base64,' in exported
  page.locator('[data-action="close-modal"]').click()
  page.locator('[data-section-view="realistic"]').click()
  before_preview=page.evaluate('JSON.stringify(current().sectionScene.objects)')
  page.locator('#section-preview-style').select_option('line')
  assert page.locator('main [data-editor-style="line"]').count()==1
  assert page.evaluate('JSON.stringify(current().sectionScene.objects)')==before_preview
  page.reload();assert page.locator('#section-preview-style').input_value()=='line'
  page.locator('[data-se="open"]').click()
  assert page.locator('#section-style').input_value()=='line'
  page.locator('#section-style').select_option('collage')
  page.locator('[data-action="close-modal"]').click()
  page.wait_for_function('document.querySelector("#section-preview-style")?.value==="collage"')
  page.reload();page.locator('[data-se="open"]').click();assert page.locator('#section-editor-canvas [data-section-object]').count()==count+1
  page.locator('[data-action="close-modal"]').click()
  page.locator('nav [data-view="cases"]').click();page.locator('[data-se="materials"]').click()
  assert page.locator('.section-material-grid article').count()==11
  # Upload a transparent PNG; remove catalogue entry after placing an instance.
  import base64
  png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')
  # Use a known-valid local PNG fixture.
  png=(root/'web/assets/boulevard.png').read_bytes()
  page.locator('#section-material-upload').set_input_files({'name':'测试植物.png','mimeType':'image/png','buffer':png})
  page.wait_for_function('db.sectionMaterials?.length===1')
  page.locator('[data-se="open"]').click();page.locator('[data-se="add"]').last.click()
  assert page.locator('#section-editor-canvas [data-section-object]').count()==count+2
  page.locator('[data-action="close-modal"]').click()
  page.once('dialog',lambda d:d.accept());page.locator('[data-se="remove-material"]').click()
  assert page.locator('.section-material-grid article').count()==11
  page.locator('[data-se="open"]').click();assert page.locator('#section-editor-canvas [data-section-object]').count()==count+2
  with page.expect_download() as info:page.locator('[data-se="scene-backup"]').click()
  bundle=json.loads(Path(info.value.path()).read_text());assert bundle['assets']
  backup_path=info.value.path()
  page.locator('[data-se="add"]').first.click()
  assert page.locator('#section-editor-canvas [data-section-object]').count()==count+3
  page.locator('#section-scene-import').set_input_files(backup_path)
  page.wait_for_function('(n)=>current().sectionScene.objects.length===n',arg=count+2)
  page.locator('[data-se="add"]').first.click()
  oldscene=page.evaluate('JSON.stringify(current().sectionScene)')
  page.evaluate("()=>{window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota')};}")
  page.locator('[data-se="delete"]').click()
  assert page.evaluate('JSON.stringify(current().sectionScene)')==oldscene
  page.evaluate('()=>{Storage.prototype.setItem=window.savedSetItem;}')
  page.screenshot(path='/tmp/section-editor-preview.png')
  page.locator('[data-action="close-modal"]').click()
  page.locator('#section-material-upload').set_input_files({'name':'备份植物.png','mimeType':'image/png','buffer':png})
  page.wait_for_function('db.sectionMaterials?.length===1')
  with page.expect_download() as lib:page.locator('[data-se="library-export"]').click()
  page.locator('#section-material-import').set_input_files(lib.value.path())
  page.wait_for_function('db.sectionMaterials?.length===2')
  page.evaluate("()=>{current().plan.geometry.segments[0].type='bike';current().sectionScene=null;persist();render();}")
  page.locator('[data-se="open"]').click()
  page.locator('#section-style').select_option('line')
  assert page.locator('[data-entourage="cyclist"]').first.get_attribute('stroke')=='#d6ad25'
  page.locator('#section-editor-canvas').screenshot(path='/tmp/colored-section-preview.png')
  page.locator('[data-action="close-modal"]').click()
  assert not errors,errors
  print('PASS: library upload, catalogue deletion preserves scene, add/duplicate/delete/undo/redo, move/resize/snap, plan untouched, persistence and embedded export.')
  browser.close()
finally:server.shutdown();server.server_close()
