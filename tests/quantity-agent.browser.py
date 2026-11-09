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
  import base64
  page.route('**/api/model/config',lambda r:r.fulfill(json={'configured':True,'model':'saved-quantity-model'}))
  calls=[]
  def agent(route):
   d=route.request.post_data_json;calls.append(d)
   source=next(x for x in d['documents'] if ('香樟' in x['text'] if d['mode']=='extract' else 'Price350' in x['text']))
   evidence={'source_id':source['id'],'fileName':source['fileName'],'location':source['location'],'quote':source['text']}
   result={'rows':[{'part':'人行道','name':'香樟','spec':'胸径15cm','unit':'株','quantity':20,'evidence':evidence}]} if d['mode']=='extract' else {'matches':[{'row_id':d['rows'][0]['id'],'status':'similar','price':350,'reason':'品种别名候选；地区期次及规格需要人工核实。','evidence':evidence}]}
   result.update({'model':'saved-quantity-model','checkedAt':'2026-11-09T09:00:00Z'})
   route.fulfill(content_type='application/x-ndjson',body=json.dumps({'type':'result','data':result}))
  page.route('**/api/model/quantity',agent)
  page.locator('nav [data-view="quantities"]').click()
  page.add_script_tag(url=origin+'/vendor/exceljs-4.4.0.min.js')
  book=page.evaluate("async()=>{const b=new ExcelJS.Workbook(),s=b.addWorksheet('标准段');s.addRow(['部位','名称','规格','单位','数量']);s.addRow(['人行道','香樟','胸径15cm','株',20]);const bytes=new Uint8Array(await b.xlsx.writeBuffer());let str='';for(const v of bytes)str+=String.fromCharCode(v);return btoa(str);}")
  page.locator('#quantity-standard-upload').set_input_files({'name':'本次标准段.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':base64.b64decode(book)})
  page.wait_for_function('current().quantityEstimate?.files.length===1')
  page.locator('[data-qa="extract"]').click()
  page.wait_for_selector('[data-qa="apply-rows"]',timeout=15000)
  assert '第2行' in calls[0]['documents'][-1]['location']
  assert page.evaluate('current().quantityEstimate.rows.length')==0
  page.once('dialog',lambda d:d.dismiss());page.locator('[data-qa="apply-rows"]').click();assert page.evaluate('current().quantityEstimate.rows.length')==0
  page.once('dialog',lambda d:d.accept());page.locator('[data-qa="apply-rows"]').click();assert page.evaluate('current().quantityEstimate.rows.length')==1
  page.locator('#quantity-price-upload').set_input_files({'name':'杭州信息价.pdf','mimeType':'application/pdf','buffer':(root/'tests/fixtures/quantity-price.pdf').read_bytes()})
  page.wait_for_function('current().quantityEstimate.files.length===2')
  page.locator('[data-qa="match"]').click()
  page.wait_for_selector('[data-qa="apply-price"]',timeout=20000)
  assert '第1页' in calls[1]['documents'][0]['location']
  assert page.evaluate('current().quantityEstimate.rows[0].price') is None
  page.once('dialog',lambda d:d.dismiss());page.locator('[data-qa="apply-price"]').click();assert page.evaluate('current().quantityEstimate.rows[0].price') is None
  page.once('dialog',lambda d:d.accept());page.locator('[data-qa="apply-price"]').click()
  assert page.evaluate('current().quantityEstimate.rows[0].price')==350
  assert '第1页' in page.evaluate('current().quantityEstimate.rows[0].priceSource')
  page.locator('[data-q-cell="price"]').fill('100');page.locator('[data-q-cell="price"]').press('Tab')
  page.locator('[data-qa="apply-price"]').click();assert page.evaluate('current().quantityEstimate.rows[0].price')==100
  assert '已变化' in page.locator('#toast').inner_text()
  page.screenshot(path='/tmp/quantity-agent-ui.png',full_page=True)
  assert len(calls)==2
  assert not errors,errors
  print('PASS: real Excel and PDF extraction; model receives text and source positions; confirmed-only row and price adoption; cancel and stale candidates preserve values. No paid calls.')
  browser.close()
finally:server.shutdown();server.server_close()
