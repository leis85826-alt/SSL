// File decoding is local; only extracted text is sent to the saved model provider.
let sheetPromise;
async function sheets(){if(window.ExcelJS)return window.ExcelJS;if(!sheetPromise)sheetPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/exceljs-4.4.0.min.js';script.onload=()=>resolve(window.ExcelJS);script.onerror=()=>{sheetPromise=null;reject(Error('Excel解析组件加载失败，请刷新重试。'));};document.head.append(script);});return sheetPromise;}
export async function extractDocuments(files,status=()=>{}){
 const documents=[];let chars=0;
 function add(file,location,text){text=String(text).trim();if(!text)return;if(text.length>4000)throw Error(file.name+'有超长段落，请拆分资料。');chars+=text.length;if(chars>160000||documents.length>=2000)throw Error('本次资料超过16万字或2000段，请减少选择的文件。');documents.push({id:file.id+'-'+documents.length,fileName:file.name,location,text});}
 for(const file of files){status('读取 '+file.name);const record=await fileStore('get',file.fileId);if(!record)throw Error('本机找不到文件：'+file.name);const blob=record.file,name=file.name.toLowerCase();
  if(name.endsWith('.xls'))throw Error('旧版.xls请先另存为.xlsx或CSV后识别。');
  else if(name.endsWith('.xlsx')){const ExcelJS=await sheets(),book=new ExcelJS.Workbook();await book.xlsx.load(await blob.arrayBuffer());if(book.worksheets.length>30)throw Error('工作表过多，请拆分后上传。');for(const sheet of book.worksheets){if(sheet.rowCount>10000||sheet.columnCount>100)throw Error('工作表范围过大，请删除空白格式区域后重试。');sheet.eachRow((row,i)=>{const values=[];row.eachCell({includeEmpty:true},cell=>values.push(cell.text));add(file,'工作表 '+sheet.name+' · 第'+i+'行',values.join(' | '));});}}
  else if(name.endsWith('.csv')){const rows=RoadscapeQuantity.parseCSV((await blob.text()).replace(/^\uFEFF/,''));rows.forEach((row,i)=>add(file,'第'+(i+1)+'行',row.join(' | ')));}
  else if(name.endsWith('.pdf')){const pdfjs=await import('/vendor/pdf-4.10.38.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker-4.10.38.min.mjs';const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,disableFontFace:true});const pdf=await task.promise;let readable=false;try{if(pdf.numPages>80)throw Error('PDF超过80页，请按章节拆分上传。');for(let p=1;p<=pdf.numPages;p++){status('读取 '+file.name+' 第'+p+'/'+pdf.numPages+'页');const page=await pdf.getPage(p),content=await page.getTextContent();let text='',line=1;const flush=()=>{if(text.trim()){readable=true;add(file,'第'+p+'页 · 文本段'+line++,text);text='';}};for(const item of content.items){if(!('str' in item))continue;if(text.length+item.str.length>2000)flush();text+=item.str+' ';if(item.hasEOL)flush();}flush();page.cleanup();}if(!readable)throw Error(file.name+'没有可读取文字，可能是扫描件；请先OCR或换用Excel/文本PDF。');}finally{await pdf.destroy();}}
  else throw Error('暂不支持识别：'+file.name);
 }
 if(!documents.length)throw Error('所选资料中没有可识别的文字。');return documents;
}
