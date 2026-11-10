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
  page.route('**/api/quantity/config',lambda r:r.fulfill(json={'configured':True,'model':'saved-quantity-model'}))
  calls=[]
  def agent(route):
   d=route.request.post_data_json;calls.append(d)
   source=next(x for x in d['documents'] if ('香樟' in x['text'] if d['mode']=='extract' else 'Price350' in x['text']))
   evidence={'source_id':source['id'],'fileName':source['fileName'],'location':source['location'],'quote':source['text']}
   result={'rows':[{'part':'人行道','name':'香樟','spec':'胸径15cm','unit':'株','quantity':20,'evidence':evidence}]} if d['mode']=='extract' else {'matches':[{'row_id':d['rows'][0]['id'],'status':'similar','price':350,'reason':'品种别名候选；地区期次及规格需要人工核实。','evidence':evidence}]}
   result.update({'model':'saved-quantity-model','checkedAt':'2026-11-09T09:00:00Z'})
   route.fulfill(content_type='application/x-ndjson',body=json.dumps({'type':'result','data':result}))
  page.route('**/api/quantity/analyze',agent)
  page.locator('nav [data-view="quantities"]').click()
  def vision(route):
   payload=route.request.post_data_json
   assert payload['image'].startswith('data:image/png;base64,') and len(payload['expected'])==6
   route.fulfill(content_type='application/x-ndjson',body=json.dumps({'type':'result','data':{'passed':True,'model':'saved-quantity-model','checkedAt':'2026-11-10T08:00:00Z','message':'测试图片通过，图纸统计尚未接入。'}}))
  page.route('**/api/quantity/vision-test',vision)
  page.locator('[data-qa="vision"]').click()
  page.wait_for_function('()=>current().quantityEstimate?.visionCheck?.passed===true')
  assert '看图统计PDF' in page.locator('.quantity-page').inner_text()

  page.add_script_tag(url=origin+'/vendor/exceljs-4.4.0.min.js')
  book=page.evaluate("async()=>{const b=new ExcelJS.Workbook(),s=b.addWorksheet('标准段');s.addRow(['部位','名称','规格','单位','数量']);s.addRow(['人行道','香樟','胸径15cm','株',20]);const bytes=new Uint8Array(await b.xlsx.writeBuffer());let str='';for(const v of bytes)str+=String.fromCharCode(v);return btoa(str);}")
  page.locator('#quantity-standard-upload').set_input_files({'name':'本次标准段.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':base64.b64decode(book)})
  page.wait_for_function('()=>current().quantityEstimate?.files.length===1')
  page.locator('[data-qa="extract"]').click()
  page.wait_for_selector('[data-qa="apply-rows"]',timeout=15000)
  assert '第2行' in calls[0]['documents'][-1]['location']
  assert page.evaluate('current().quantityEstimate.rows.length')==0
  page.once('dialog',lambda d:d.dismiss());page.locator('[data-qa="apply-rows"]').click();assert page.evaluate('current().quantityEstimate.rows.length')==0
  page.once('dialog',lambda d:d.accept());page.locator('[data-qa="apply-rows"]').click();assert page.evaluate('current().quantityEstimate.rows.length')==1
  page.locator('#quantity-price-upload').set_input_files({'name':'杭州信息价.pdf','mimeType':'application/pdf','buffer':(root/'tests/fixtures/quantity-price.pdf').read_bytes()})
  page.wait_for_function('()=>current().quantityEstimate.files.length===2')
  page.locator('[data-qa="match"]').click()
  page.wait_for_selector('[data-qa="apply-price"]',timeout=20000)
  assert '第1页' in calls[1]['documents'][0]['location']
  assert page.evaluate('current().quantityEstimate.rows[0].price') is None
  # Native browser confirmation is unavailable: price adoption must use page controls.
  page.evaluate("()=>{window.confirm=()=>{throw Error('native confirm unavailable')};}")
  # Existing saved candidates without the new field must also remain usable.
  page.evaluate('()=>{delete current().quantityEstimate.agent.priceInputSignature;}')
  # Changing only quantities/road length must not invalidate a price lookup.
  page.locator('[data-q-field="totalLength"]').fill('600');page.locator('[data-q-field="totalLength"]').press('Tab')
  page.locator('[data-q="calculate"]').click()
  page.locator('[data-qa="apply-price"]').click()
  assert page.locator('[data-qa="confirm-price"]').is_visible()
  assert page.evaluate('current().quantityEstimate.rows[0].price') is None
  page.locator('[data-qa="cancel-price"]').click()
  assert page.evaluate('current().quantityEstimate.rows[0].price') is None
  page.locator('[data-qa="apply-price"]').click();page.locator('[data-qa="confirm-price"]').click()
  assert page.evaluate('current().quantityEstimate.rows[0].price')==350
  assert page.evaluate('current().quantityEstimate.ready') is True
  assert page.locator('[data-qa="apply-price"]').is_disabled()
  assert '已采用' in page.locator('#quantity-adoption-message').inner_text()
  assert '42,000' in page.locator('.quantity-card').last.inner_text()
  page.reload();page.locator('nav [data-view="quantities"]').click()
  assert page.evaluate('current().quantityEstimate.rows[0].price')==350
  assert page.locator('[data-qa="apply-price"]').is_disabled()
  assert '42,000' in page.locator('.quantity-card').last.inner_text()
  assert '第1页' in page.evaluate('current().quantityEstimate.rows[0].priceSource')
  page.evaluate("()=>{window.confirm=()=>{throw Error('native confirm unavailable')};}")
  page.locator('[data-q-cell="price"]').fill('100');page.locator('[data-q-cell="price"]').press('Tab')
  page.locator('[data-qa="apply-price"]').click();page.locator('[data-qa="cancel-price"]').click()
  assert page.evaluate('current().quantityEstimate.rows[0].price')==100
  assert '已取消' in page.locator('#quantity-adoption-message').inner_text()
  # Changing a target price while inline confirmation is open must not overwrite it.
  page.locator('[data-qa="apply-price"]').click()
  page.evaluate("()=>{const p=current(),q=RoadscapeQuantity.getData(p);q.rows[0].price=101;RoadscapeQuantity.commit(p,q);}")
  page.locator('[data-qa="confirm-price"]').click()
  assert page.evaluate('current().quantityEstimate.rows[0].price')==101
  assert '确认期间' in page.locator('#quantity-adoption-message').inner_text()
  page.locator('[data-q-cell="price"]').fill('100');page.locator('[data-q-cell="price"]').press('Tab')
  # A failed save must not show adoption success or overwrite the saved price.
  page.evaluate("()=>{window.realQuantitySet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota')};}")
  page.locator('[data-qa="apply-price"]').click();page.locator('[data-qa="confirm-price"]').click()
  assert page.evaluate('current().quantityEstimate.rows[0].price')==100
  assert '保存失败' in page.locator('#quantity-adoption-message').inner_text()
  page.evaluate('()=>{Storage.prototype.setItem=window.realQuantitySet;}')
  page.locator('[data-q-cell="spec"]').fill('胸径18cm');page.locator('[data-q-cell="spec"]').press('Tab')
  page.locator('[data-qa="apply-price"]').click();assert page.evaluate('current().quantityEstimate.rows[0].price')==100
  assert '已变化' in page.locator('#quantity-adoption-message').inner_text()
  page.screenshot(path='/tmp/quantity-agent-ui.png',full_page=True)
  assert len(calls)==2
  # Two full information-price CSV files exceed the old 160k/2000 passage limit.
  text='名称,规格,单价,说明\n'+''.join('香樟,胸径15cm,Price350,'+'资料说明'*25+'\n' for _ in range(1200))
  page.locator('#quantity-price-upload').set_input_files([{'name':name,'mimeType':'text/csv','buffer':text.encode()} for name in ['信息价一.csv','信息价二.csv']])
  page.wait_for_function('()=>current().quantityEstimate.files.length===4')
  page.locator('[data-qa="match"]').click()
  page.wait_for_function('()=>current().quantityEstimate.agent?.batchCount>1',timeout=30000)
  batches=page.evaluate('current().quantityEstimate.agent.batchCount')
  assert batches>1 and len(calls)==2+batches
  passages=[d for call in calls[2:] for d in call['documents']]
  assert len(passages)>2000 and sum(len(d['text']) for d in passages)>160000
  assert {'信息价一.csv','信息价二.csv'}.issubset({d['fileName'] for d in passages})
  assert page.evaluate('current().quantityEstimate.rows[0].price')==100
  # One click fills the editable standard list, never calculating until reviewed.
  page.locator('[data-q-cell="price"]').fill('');page.locator('[data-q-cell="price"]').press('Tab')
  page.locator('[data-q="calculate"]').click()
  assert page.evaluate('current().quantityEstimate.ready') is True
  unavailable_modules=[]
  def block_price_module(route):
   unavailable_modules.append(route.request.url);route.abort()
  page.route('**/quantity-prices.mjs*',block_price_module)
  before_bulk=len(calls)
  page.locator('[data-qa="apply-all-prices"]').click()
  page.wait_for_function('()=>current().quantityEstimate.priceFillSummary?.filled===1')
  assert page.locator('[data-q-cell="price"]').input_value()=='350'
  assert page.evaluate('current().quantityEstimate.ready') is False
  assert page.locator('[data-q="export-excel"]').is_disabled()
  assert '预填 1 项' in page.locator('#quantity-price-review-summary').inner_text()
  assert page.locator('[data-q-row] details').count()==1
  assert len(calls)==before_bulk
  assert unavailable_modules==[]
  page.reload();page.locator('nav [data-view="quantities"]').click()
  assert page.locator('[data-q-cell="price"]').input_value()=='350'
  assert page.evaluate('current().quantityEstimate.ready') is False
  page.locator('[data-q-cell="price"]').fill('100');page.locator('[data-q-cell="price"]').press('Tab')
  page.locator('[data-qa="apply-all-prices"]').click()
  page.wait_for_function('()=>current().quantityEstimate.priceFillSummary?.preserved===1')
  assert page.locator('[data-q-cell="price"]').input_value()=='100'
  page.locator('[data-q="calculate"]').click()
  assert '12,000' in page.locator('.quantity-card').last.inner_text()
  assert page.evaluate('current().quantityEstimate.ready') is True
  saved=page.evaluate('JSON.stringify(current().quantityEstimate.agent)')
  failed=[]
  def fail_batch(route):
   failed.append(route.request.post_data_json)
   if len(failed)==1:agent(route)
   else:route.fulfill(content_type='application/x-ndjson',body=json.dumps({'type':'error','message':'模拟第二批失败'}))
  page.route('**/api/quantity/analyze',fail_batch)
  page.locator('[data-qa="match"]').click()
  page.wait_for_function("()=>document.querySelector('#quantity-agent-status').textContent.includes('模拟第二批失败')",timeout=30000)
  assert len(failed)==2
  assert page.evaluate('JSON.stringify(current().quantityEstimate.agent)')==saved
  assert page.evaluate('current().quantityEstimate.rows[0].price')==100
  assert not errors,errors
  print('PASS: real Excel and PDF extraction; model receives text and source positions; confirmed-only row and price adoption; page confirmation works with native confirm disabled; length changes keep legacy price candidates valid; adoption recalculates amounts and survives reload; bulk fills editable prices without model calls or calculation, preserves manual prices and supports review before final calculation; cancel, stale specifications and save failure preserve values. No paid calls.')
  browser.close()
finally:server.shutdown();server.server_close()
