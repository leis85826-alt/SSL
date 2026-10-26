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
  before=page.evaluate('JSON.stringify(db)');section=page.locator('svg[data-drawing="section"]').evaluate('(e)=>e.outerHTML');drawing=page.locator('svg[data-plan-style="landscape-a"]');assert drawing.locator('[data-plan-tree]').count()==6;assert drawing.locator('[data-tree-pit]').count()==6
  drawing.screenshot(path=str(out/'style-a-screen.png'));(out/'plan-a.svg').write_text(drawing.evaluate('(e)=>e.outerHTML'))
  cross=page.locator('svg[data-section-style="landscape-a"]');assert cross.locator('[data-section-tree]').count()==2;assert cross.locator('[data-section-pit]').count()==2;cross.screenshot(path=str(out/'section-a-screen.png'));(out/'section-a.svg').write_text(cross.evaluate('(e)=>e.outerHTML'))
  page.locator('[data-plan-view="simple"]').click();assert page.locator('svg[data-plan-style="landscape-a"]').count()==0;assert page.locator('svg[data-section-style="landscape-a"]').count()==0;assert page.evaluate('JSON.stringify(db)')==before
  page.locator('[data-plan-view="landscape"]').click();assert page.locator('svg[data-drawing="section"]').evaluate('(e)=>e.outerHTML')==section;assert page.evaluate('JSON.stringify(db)')==before
  page.reload();page.wait_for_selector('svg[data-plan-style="landscape-a"]');assert page.evaluate('JSON.stringify(db)')==before
  with page.expect_download() as info:page.locator('[data-work-action="plan"]').click()
  exported=Path(info.value.path()).read_text();assert 'landscape-a' in exported and '<pattern' in exported and '<image' not in exported
  with page.expect_download() as section_info:page.locator('[data-work-action="section"]').click()
  section_export=Path(section_info.value.path()).read_text();assert 'data-section-style="landscape-a"' in section_export and '<pattern' in section_export and '<image' not in section_export
  # Render exported SVG as a standalone document: local defs and symbols must resolve.
  standalone=browser.new_page(viewport={'width':1200,'height':1200});standalone.set_content(exported);standalone.locator('svg').screenshot(path=str(out/'style-a-export.png'));assert standalone.locator('svg').get_attribute('data-total-width')=='33'
  standalone.set_content(section_export);standalone.locator('svg').screenshot(path=str(out/'section-a-export.png'));assert standalone.locator('[data-section-tree]').count()==2
  page.evaluate('''()=>{const p=current(),part=p.plan.strips.trees;part.plants.push({name:'银杏',role:'乔木',position:'树池',form:'分段'});part.pattern={repeat:true,segments:[{length:12,plants:['国槐','麦冬'],description:'国槐段'},{length:12,plants:['银杏','麦冬'],description:'银杏段'}]};p.plan.signature=signature(p);persist();render();}''')
  assert page.locator('[data-plan-tree][data-species="国槐"]').count()==2;assert page.locator('[data-plan-tree][data-species="银杏"]').count()==4
  assert page.locator('svg[data-drawing="section"]').count()==1;assert page.locator('[data-section-panel]').count()==2;assert page.locator('[data-section-tree][data-species="国槐"]').count()==2;assert page.locator('[data-section-tree][data-species="银杏"]').count()==2
  # Continuous band: do not leave any isolated tree-pit symbols.
  page.evaluate("()=>{current().plan.geometry.treeLayout='continuous';render();}");assert page.locator('[data-tree-pit]').count()==0
  assert not errors,errors
  print(json.dumps({'six_trees_and_pits_preserved':True,'switching_and_reload_do_not_change_project':True,'plan_section_style_switch_together':True,'typical_section_pits_and_trees_preserved':True,'segmented_section_species_preserved':True,'standalone_section_svg_verified':True,'pattern_species_preserved':True,'continuous_band_has_no_pits':True,'standalone_svg_export_verified':True,'real_model_called':False,'screenshots':str(out)},ensure_ascii=False));browser.close()
finally:server.shutdown();server.server_close()
