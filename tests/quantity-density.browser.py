"""Shrub density pricing, persistence and exported audit fields. No model calls."""
import functools,http.server,json,threading,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):
  self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' blob: data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
  super().end_headers()
 def do_GET(self):
  if self.path.startswith('/api/'):
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'configured':False,'ready':True}).encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'web')));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1600,'height':1100});errors=[];calls=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:calls.append(r.url) if r.method=='POST' and '/api/' in r.url else None)
  page.set_default_timeout(6000);page.goto(f'http://127.0.0.1:{server.server_port}');page.locator('nav [data-view="quantities"]').click()
  page.evaluate("""()=>{const p=current(),q=RoadscapeQuantity.getData(p);q.standardLength=100;q.totalLength=600;q.rows=[{id:'s',part:'侧分带',category:'灌木',name:'红叶石楠',spec:'H31-40',unit:'㎡',quantity:1000,price:null,priceSource:'',repeat:true,adjustment:0},{id:'t',part:'人行道',category:'乔木',name:'香樟',spec:'胸径15cm',unit:'株',quantity:40,price:null,priceSource:'',repeat:true,adjustment:0}];q.files=[];q.ready=false;q.agent={kind:'match',model:'test-model',inputSignature:JSON.stringify(q),result:{matches:[{row_id:'s',price:1.2,status:'similar',source_unit:'株',reason:'按株原价，面积价由密度换算。',evidence:{source_id:'a',fileName:'信息价.pdf',location:'第1页',quote:'红叶石楠 H31-40 株 1.2'}},{row_id:'t',price:350,status:'exact',source_unit:'株',reason:'按株计价',evidence:{source_id:'b',fileName:'信息价.pdf',location:'第2页',quote:'香樟 胸径15cm 株 350'}}]}};RoadscapeQuantity.commit(p,q);render();}""")
  shrub=page.locator('[data-q-row="s"]');tree=page.locator('[data-q-row="t"]')
  assert shrub.locator('[data-q-cell="density"]').input_value()=='64';assert tree.locator('[data-q-cell="density"]').is_disabled()
  page.locator('[data-qa="apply-all-prices"]').click()
  assert shrub.locator('[data-q-cell="price"]').input_value()=='76.8';assert tree.locator('[data-q-cell="price"]').input_value()=='350'
  assert shrub.locator('[data-q-cell="originalPrice"]').input_value()=='1.2'
  assert page.evaluate('current().quantityEstimate.ready') is False
  def change(key,value):
   field=shrub.locator(f'[data-q-cell="{key}"]')
   if field.evaluate('(e)=>e.tagName')=='SELECT':field.select_option(value)
   else:field.fill(value);field.press('Tab')
  change('density','36');assert shrub.locator('[data-q-cell="price"]').input_value()=='43.2'
  change('density','0');assert shrub.locator('[data-q-cell="density"]').input_value()=='36';assert '种植密度须大于0' in page.locator('#toast').inner_text()
  change('originalUnit','㎡');assert shrub.locator('[data-q-cell="price"]').input_value()=='1.2'
  assert shrub.locator('[data-q-cell="density"]').is_disabled()
  change('originalPrice','20');assert shrub.locator('[data-q-cell="price"]').input_value()=='20'
  change('originalUnit','株');assert shrub.locator('[data-q-cell="price"]').input_value()=='720'
  change('originalPrice','1.2');change('density','36')
  change('originalUnit','');assert shrub.locator('[data-q-cell="price"]').input_value()==''
  assert '原单位未提供' in shrub.inner_text()
  change('originalUnit','株');assert shrub.locator('[data-q-cell="price"]').input_value()=='43.2'
  change('price','50');assert page.evaluate('RoadscapeQuantity.priceInfo(current().quantityEstimate.rows[0]).price')==50
  assert shrub.locator('[data-q-cell="originalPrice"]').input_value()=='1.2'
  change('density','49');assert shrub.locator('[data-q-cell="price"]').input_value()=='58.8';change('density','36')
  change('category','乔木');assert shrub.locator('[data-q-cell="density"]').is_disabled();assert shrub.locator('[data-q-cell="price"]').input_value()==''
  change('category','灌木');assert shrub.locator('[data-q-cell="price"]').input_value()=='43.2'
  page.reload();page.locator('nav [data-view="quantities"]').click()
  assert shrub.locator('[data-q-cell="density"]').input_value()=='36';assert shrub.locator('[data-q-cell="price"]').input_value()=='43.2'
  page.locator('[data-q="calculate"]').click()
  result=page.evaluate('RoadscapeQuantity.calculate(current().quantityEstimate)');assert result[0]['amount']==259200 and result[1]['amount']==84000
  assert '343,200' in page.locator('.quantity-card').last.inner_text()
  with page.expect_download() as info:page.locator('[data-q="export-excel"]').click()
  with zipfile.ZipFile(info.value.path()) as book:
   ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
   strings=[''.join(t.itertext()) for t in ET.fromstring(book.read('xl/sharedStrings.xml')).findall('s:si',ns)]
   cells={}
   for c in ET.fromstring(book.read('xl/worksheets/sheet2.xml')).findall('.//s:sheetData/s:row/s:c',ns):
    value=c.find('s:v',ns);cells[c.attrib['r']]=strings[int(value.text)] if c.attrib.get('t')=='s' else value.text if value is not None else None
   assert cells['Q2']=='1.2' and cells['R2']=='株' and cells['S2']=='36'
   assert cells['L2']=='43.2' and cells['M2']=='259200' and '36 株/㎡' in cells['T2']
   assert cells['L3']=='350' and cells.get('S3') is None
  with page.expect_download() as info:page.locator('[data-q="export"]').click()
  text=Path(info.value.path()).read_text(encoding='utf-8-sig');assert '信息价原单位' in text and '36 株/㎡' in text
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert calls==[] and not errors,(calls,errors)
  print('PASS: shrub-only 64 default, editable density, tree unchanged, area price not multiplied, raw units and prices, unknown units, zero rejection, manual override, persistence, reviewed calculation, CSV/XLSX audit fields, CSP/mobile. No model calls.')
  browser.close()
finally:server.shutdown();server.server_close()
