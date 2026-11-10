"""Client fetch failures, stream completion and read-only diagnostics. No model calls."""
import functools,http.server,json,threading
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
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1600,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(8000)
  page.goto(f'http://127.0.0.1:{server.server_port}');page.locator('nav [data-view="quantities"]').click()
  mode={'config':'ok'};config_calls=[];post_calls=[]
  def config(route):
   config_calls.append(route.request.method)
   if mode['config']=='fail':route.abort()
   else:route.fulfill(json={'configured':True,'model':'mock-quantity-model'})
  def failed_post(route):post_calls.append(route.request.post_data_json);route.abort()
  page.route('**/api/quantity/config',config);page.route('**/api/quantity/analyze',failed_post)
  page.locator('#quantity-standard-upload').set_input_files({'name':'标准段.csv','mimeType':'text/csv','buffer':'名称,单位,标准段数量\n香樟,株,20\n'.encode()})
  page.wait_for_function('()=>current().quantityEstimate.files.length===1')
  page.locator('[data-qa="extract"]').click()
  issue=page.locator('#quantity-connection-issue');issue.wait_for()
  assert '请求未能取得响应' in issue.inner_text() and '当前可达' in issue.inner_text()
  assert len(post_calls)==1 and len(config_calls)==2
  assert page.evaluate('current().quantityEstimate.rows.length')==0
  mode['config']='fail';page.locator('[data-qa="extract"]').click()
  page.wait_for_function("()=>document.querySelector('#quantity-connection-issue')?.textContent.includes('配置读取')")
  assert '尚未开始模型识别' in issue.inner_text() and '自检也未取得响应' in issue.inner_text()
  assert len(post_calls)==1 and len(config_calls)==4
  mode['config']='ok'
  # A full result must be accepted without waiting for EOF; a late disconnect
  # would otherwise throw TypeError('Failed to fetch') and discard valid data.
  page.evaluate("""()=>{const real=window.fetch;window.syntheticMode='complete';window.syntheticCalls=0;window.cancelledStreams=0;
   window.fetch=async(input,options={})=>{if(String(input)!=='/api/quantity/analyze'||options.method!=='POST')return real(input,options);window.syntheticCalls++;if(window.syntheticMode==='http413')return new Response(JSON.stringify({error:'资料过大'}),{status:413,headers:{'Content-Type':'application/json'}});
    const body=JSON.parse(options.body),d=body.documents.find(d=>d.text.includes('香樟')),encode=v=>new TextEncoder().encode(JSON.stringify(v)+'\\n');let timer,handler;
    const stream=new ReadableStream({start(c){c.enqueue(encode({type:'progress',stage:'模型处理中'}));handler=()=>c.error(new DOMException('Stopped','AbortError'));options.signal?.addEventListener('abort',handler);
     if(window.syntheticMode==='complete')c.enqueue(encode({type:'result',data:{model:'mock-quantity-model',rows:[{name:'香樟',part:'行道树',category:'乔木',spec:'',unit:'株',quantity:20,evidence:{source_id:d.id,quote:d.text,fileName:d.fileName,location:d.location}}]}}));
     if(window.syntheticMode!=='wait')timer=setTimeout(()=>{try{c.error(new TypeError('Failed to fetch'));}catch{}},50);
    },cancel(){window.cancelledStreams++;clearTimeout(timer);options.signal?.removeEventListener('abort',handler);}});
    return new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}});
   };}""")
  page.locator('[data-qa="extract"]').click();page.locator('[data-qa="apply-rows"]').wait_for()
  assert page.evaluate('current().quantityEstimate.agent.result.rows[0].quantity')==20
  assert page.evaluate('window.cancelledStreams')==1 and page.evaluate('window.syntheticCalls')==1
  assert issue.count()==0
  saved=page.evaluate('JSON.stringify(current().quantityEstimate.agent)')
  page.evaluate("window.syntheticMode='partial'");before=len(config_calls)
  page.locator('[data-qa="extract"]').click()
  page.wait_for_function("()=>document.querySelector('#quantity-connection-issue')?.textContent.includes('结果接收')")
  assert '尚未收到完整结果' in issue.inner_text()
  assert page.evaluate('JSON.stringify(current().quantityEstimate.agent)')==saved
  assert len(config_calls)==before+2 and page.evaluate('window.syntheticCalls')==2
  page.evaluate("window.syntheticMode='http413'");before=len(config_calls)
  page.locator('[data-qa="extract"]').click()
  page.wait_for_function("()=>document.querySelector('#quantity-agent-status').textContent.includes('HTTP 413')")
  assert len(config_calls)==before+1 and page.evaluate('window.syntheticCalls')==3
  assert issue.count()==0
  page.evaluate("window.syntheticMode='wait'");before=len(config_calls)
  page.locator('[data-qa="extract"]').click()
  page.wait_for_function("()=>document.querySelector('#quantity-agent-status').textContent.includes('模型处理中')")
  page.locator('[data-qa="cancel"]').click()
  page.wait_for_function("()=>document.querySelector('#quantity-agent-status').textContent.includes('已停止等待')")
  assert len(config_calls)==before+1 and page.evaluate('window.syntheticCalls')==4
  assert page.evaluate('JSON.stringify(current().quantityEstimate.agent)')==saved
  before=len(config_calls);posted=len(post_calls)
  page.route('**/quantity-reader.mjs*',lambda r:r.abort())
  page.reload();page.locator('nav [data-view="quantities"]').click()
  page.locator('[data-qa="extract"]').click()
  page.wait_for_function("()=>document.querySelector('#quantity-connection-issue')?.textContent.includes('文件读取组件加载')")
  assert '尚未向模型发送资料' in issue.inner_text()
  assert len(post_calls)==posted and len(config_calls)==before+2
  assert not errors,errors
  print('PASS: configuration vs POST vs mid-stream failures; one read-only probe, no paid retries; complete result accepted before late disconnect; partial results and old data protected; HTTP413 and cancellation distinguished; production CSP. No real model calls.')
  browser.close()
finally:server.shutdown();server.server_close()
