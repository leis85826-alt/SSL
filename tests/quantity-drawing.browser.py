"""A-style SVG integration and export. Synthetic local project, no AI calls.
Run node scripts/build-cloudflare.mjs first. Requires verification Playwright/Chromium.
"""
import functools,http.server,json,threading,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=Path(tempfile.mkdtemp(prefix='roadscape-plan-a-'))
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):
  self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' blob: data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
  super().end_headers()
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
  import os,base64
  calls=[]
  def config(route):
   if route.request.method=='POST':
    body=route.request.post_data_json;assert body['model']=='deepseek-v4.1-flash';assert body['reuseImageKey'] is True
   route.fulfill(json={'configured':True,'model':'deepseek-v4.1-flash','baseURL':'https://api.lk888.ai/v1','canReuseImage':True})
  page.route('**/api/quantity/config',config)
  def drawing(route):
   body=route.request.post_data_json;calls.append(body);im=body['images'][0]
   Path('/tmp/drawing-overview.jpg').write_bytes(base64.b64decode(im['data'].split(',',1)[1]))
   Path('/tmp/drawing-detail.jpg').write_bytes(base64.b64decode(body['images'][-1]['data'].split(',',1)[1]))
   assert im['data'].startswith('data:image/jpeg;base64,') and len(body['images'])>=2
   result={'model':'deepseek-v4.1-flash','checkedAt':'2026-11-10T12:00:00Z','rows':[{'part':'侧分带','name':'红叶石楠','spec':'','unit':'㎡','quantity':1000,'evidence':{'kind':'visual','image_id':im['id'],'source_id':im['id'],'fileName':im['fileName'],'location':'第1页 · 全图概览','quote':'红叶石楠1000平方米','bbox':[.1,.1,.5,.3],'method':'label'}}]}
   route.fulfill(content_type='application/x-ndjson',body=json.dumps({'type':'result','data':result}))
  page.route('**/api/quantity/drawing',drawing)
  page.locator('nav [data-view="quantities"]').click()
  page.locator('[data-qa="settings"]').click()
  assert page.locator('[name="model"]').input_value()=='deepseek-v4.1-flash'
  page.locator('[name="reuseImageKey"]').check()
  page.locator('[form="quantity-model-form"]').click()
  page.locator('#quantity-model-message').filter(has_text='工程量配置已保存').wait_for()
  page.locator('[data-action="close-modal"]').click()
  source=Path(os.environ.get('DRAWING_TEST_PDF',str(root/'tests/fixtures/quantity-price.pdf')))
  page.locator('#quantity-standard-upload').set_input_files({'name':'标准段图.pdf','mimeType':'application/pdf','buffer':source.read_bytes()})
  page.wait_for_function('()=>current().quantityEstimate?.files.length===1')
  page.locator('[data-qa="drawing"]').click()
  page.wait_for_selector('[data-qa="apply-rows"]',timeout=20000)
  assert len(calls)==1
  assert page.evaluate('current().quantityEstimate.rows.length')==0
  assert page.evaluate('current().quantityEstimate.agent.kind')=='drawing'
  assert page.evaluate('current().quantityEstimate.agent.result.rows[0].evidence.imageFileId')
  page.locator('details summary').click()
  page.wait_for_function('()=>document.querySelector("img[data-file-image]")?.naturalWidth>0')
  page.screenshot(path='/tmp/deepseek-drawing-ui.png',full_page=True)
  page.once('dialog',lambda d:d.accept());page.locator('[data-qa="apply-rows"]').click()
  assert page.evaluate('current().quantityEstimate.rows[0].quantity')==1000
  assert page.evaluate('current().quantityEstimate.rows[0].evidence.kind')=='visual'
  assert not errors,errors
  print('PASS: separate DeepSeek settings, explicit image key reuse option, actual PDF raster/crop/detail generation, image payload, local evidence previews and confirmed-only quantities. No paid calls.')
  browser.close()
finally:server.shutdown();server.server_close()
