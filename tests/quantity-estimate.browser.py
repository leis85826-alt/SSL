"""A-style SVG integration and export. Synthetic local project, no AI calls.
Run node scripts/build-cloudflare.mjs first. Requires verification Playwright/Chromium.
"""
import functools,http.server,json,threading,tempfile,zipfile
import xml.etree.ElementTree as ET
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
  page.locator('nav [data-view="quantities"]').click()
  assert page.locator('h1').inner_text()=='工程量估算'
  assert page.locator('[data-qa="match"]').count()==1
  csv='部位,项目名称,规格,单位,标准段数量\n人行道,香樟,胸径15cm,株,20\n侧分带,地被,密度待填,㎡,150\n'
  page.locator('#quantity-csv-import').set_input_files({'name':'清单.csv','mimeType':'text/csv','buffer':csv.encode()})
  page.wait_for_function('()=>current().quantityEstimate?.rows.length===2')
  assert page.locator('[data-q-row]').count()==2
  page.locator('[data-q-field="totalLength"]').fill('1200');page.locator('[data-q-field="totalLength"]').press('Tab')
  page.locator('[data-q="calculate"]').click()
  assert page.evaluate('RoadscapeQuantity.calculate(current().quantityEstimate)[0].quantity')==240
  assert page.evaluate('RoadscapeQuantity.calculate(current().quantityEstimate)[1].quantity')==1800
  assert page.evaluate('RoadscapeQuantity.calculate(current().quantityEstimate)[0].amount') is None
  page.locator('[data-q-cell="price"]').first.fill('350');page.locator('[data-q-cell="price"]').first.press('Tab')
  page.locator('[data-q-cell="priceSource"]').first.fill('杭州信息价，第10页，手工核对');page.locator('[data-q-cell="priceSource"]').first.press('Tab')
  page.locator('[data-q="calculate"]').click()
  assert page.evaluate('RoadscapeQuantity.calculate(current().quantityEstimate)[0].amount')==84000
  page.locator('[data-q-cell="repeat"]').first.select_option('false')
  assert page.evaluate('RoadscapeQuantity.calculate(current().quantityEstimate)[0].quantity')==20
  page.locator('[data-q-cell="repeat"]').first.select_option('true')
  page.locator('#quantity-price-upload').set_input_files({'name':'杭州信息价.pdf','mimeType':'application/pdf','buffer':b'%PDF-test'})
  page.wait_for_function('()=>current().quantityEstimate.files.length===1')
  page.locator('[data-q-field="region"]').fill('杭州');page.locator('[data-q-field="region"]').press('Tab')
  page.locator('[data-q="calculate"]').click()
  with page.expect_download() as info:page.locator('[data-q="export"]').click()
  output=Path(info.value.path()).read_text(encoding='utf-8-sig');assert '84000' in output and '杭州信息价，第10页，手工核对' in output
  # Inspect the actual downloaded ZIP/XML rather than accepting a renamed CSV.
  assert not page.locator('[data-q="export-excel"]').is_disabled()
  page.evaluate("()=>{const p=current(),q=RoadscapeQuantity.getData(p);q.rows.push({id:uid(),part:'中分带',category:'其他',name:'=1+1',spec:'零价一次性测试',unit:'套',quantity:2,price:0,priceSource:'人工确认零价',adjustment:1,repeat:false});q.ready=false;RoadscapeQuantity.commit(p,q);render();}")
  assert page.locator('[data-q="export-excel"]').is_disabled()
  page.locator('[data-q="calculate"]').click()
  with page.expect_download() as info:page.locator('[data-q="export-excel"]').click()
  assert info.value.suggested_filename.endswith('-工程量估算.xlsx')
  with zipfile.ZipFile(info.value.path()) as xlsx:
   ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
   strings=ET.fromstring(xlsx.read('xl/sharedStrings.xml'))
   values=[''.join(t.itertext()) for t in strings.findall('s:si',ns)]
   def cells(path):
    result={}
    for c in ET.fromstring(xlsx.read(path)).findall('.//s:sheetData/s:row/s:c',ns):
     v=c.find('s:v',ns)
     result[c.attrib['r']]=(values[int(v.text)] if c.attrib.get('t')=='s' else v.text if v is not None else None,c.attrib.get('t'))
     assert c.find('s:f',ns) is None
    return result
   detail=cells('xl/worksheets/sheet2.xml');summary=cells('xl/worksheets/sheet1.xml')
   assert detail['G2'][0]=='20' and detail['K2'][0]=='240'
   assert detail['L2'][0]=='350' and detail['M2'][0]=='84000'
   assert detail['O2'][0]=='杭州信息价，第10页，手工核对'
   assert detail.get('L3',(None,))[0] is None and detail.get('M3',(None,))[0] is None
   assert detail['N3'][0]=='缺价'
   assert detail['D4']==('=1+1','s')
   assert detail['I4'][0]=='1' and detail['J4'][0]=='1' and detail['K4'][0]=='3'
   assert detail['L4'][0]=='0' and detail['M4'][0]=='0'
   assert summary['B12'][0]=='1' and summary['B13'][0]=='84000'
   assert '不代表完整工程造价' in summary['B14'][0]
  # Restore two rows for the existing reload and persistence checks.
  page.evaluate("()=>{const p=current(),q=RoadscapeQuantity.getData(p);q.rows.pop();RoadscapeQuantity.commit(p,q);render();}")
  page.reload();page.locator('nav [data-view="quantities"]').click()
  assert page.locator('[data-q-row]').count()==2
  assert page.locator('[data-q-field="region"]').input_value()=='杭州'
  assert page.locator('.quantity-files a').count()==1
  page.evaluate("()=>{window.realSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota')};}")
  page.locator('[data-q="add"]').click();assert page.locator('[data-q-row]').count()==2
  page.evaluate('()=>{Storage.prototype.setItem=window.realSet;}')
  page.screenshot(path='/tmp/quantity-estimate-ui.png',full_page=True)
  page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  print('PASS: CSV import, detailed rows, length scaling, missing price, manual price, one-off items, file persistence, CSV/XLSX export, numeric workbook cells, missing vs zero prices, one-off adjustments, formula-like names preserved as text, reload and save failure; production CSP and mobile layout.')
  browser.close()
finally:server.shutdown();server.server_close()
