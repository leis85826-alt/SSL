// Decoding and Excel exports are local. Vision requests send rendered page images.
let sheetPromise;
async function sheets(){if(window.ExcelJS)return window.ExcelJS;if(!sheetPromise)sheetPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/exceljs-4.4.0.min.js';script.onload=()=>resolve(window.ExcelJS);script.onerror=()=>{sheetPromise=null;reject(Error('Excel解析组件加载失败，请刷新重试。'));};document.head.append(script);});return sheetPromise;}
export async function extractDocuments(files,status=()=>{}){
 const documents=[];let chars=0;
 function add(file,location,text){text=String(text).trim();if(!text)return;for(let at=0;at<text.length;at+=2000){const piece=text.slice(at,at+2000);chars+=piece.length;if(chars>2000000||documents.length>=20000)throw Error('本次资料超过本机读取上限（200万字或2万段），请按章节选择文件；原清单保留。');documents.push({id:file.id+'-'+documents.length,fileName:file.name,location:location+(text.length>2000?' · 片段'+(Math.floor(at/2000)+1):''),text:piece});}}
 for(const file of files){status('读取 '+file.name);const record=await fileStore('get',file.fileId);if(!record)throw Error('本机找不到文件：'+file.name);const blob=record.file,name=file.name.toLowerCase();
  if(name.endsWith('.xls'))throw Error('旧版.xls请先另存为.xlsx或CSV后识别。');
  else if(name.endsWith('.xlsx')){const ExcelJS=await sheets(),book=new ExcelJS.Workbook();await book.xlsx.load(await blob.arrayBuffer());if(book.worksheets.length>30)throw Error('工作表过多，请拆分后上传。');for(const sheet of book.worksheets){if(sheet.rowCount>10000||sheet.columnCount>100)throw Error('工作表范围过大，请删除空白格式区域后重试。');sheet.eachRow((row,i)=>{const values=[];row.eachCell({includeEmpty:true},cell=>values.push(cell.text));add(file,'工作表 '+sheet.name+' · 第'+i+'行',values.join(' | '));});}}
  else if(name.endsWith('.csv')){const rows=RoadscapeQuantity.parseCSV((await blob.text()).replace(/^\uFEFF/,''));rows.forEach((row,i)=>add(file,'第'+(i+1)+'行',row.join(' | ')));}
  else if(name.endsWith('.pdf')){const pdfjs=await import('/vendor/pdf-4.10.38.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker-4.10.38.min.mjs';const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,disableFontFace:true});const pdf=await task.promise;let readable=false;try{if(pdf.numPages>300)throw Error('单份PDF超过300页，请按章节拆分上传。');for(let p=1;p<=pdf.numPages;p++){status('读取 '+file.name+' 第'+p+'/'+pdf.numPages+'页');const page=await pdf.getPage(p),content=await page.getTextContent();let text='',line=1;const flush=()=>{if(text.trim()){readable=true;add(file,'第'+p+'页 · 文本段'+line++,text);text='';}};for(const item of content.items){if(!('str' in item))continue;if(text.length+item.str.length>2000)flush();text+=item.str+' ';if(item.hasEOL)flush();}flush();page.cleanup();}if(!readable)throw Error(file.name+'没有可读取文字，可能是扫描件；请先OCR或换用Excel/文本PDF。');}finally{await pdf.destroy();}}
  else throw Error('暂不支持识别：'+file.name);
 }
 if(!documents.length)throw Error('所选资料中没有可识别的文字。');return documents;
}

export async function renderDrawing(files,pageNumber=1,status=()=>{}){
 if(files.length!==1||!files[0].name.toLowerCase().endsWith('.pdf'))throw Error('看图统计每次请只勾选一份PDF标准段文件。');
 const file=files[0],record=await fileStore('get',file.fileId);if(!record)throw Error('找不到图纸原文件。');
 const pdfjs=await import('/vendor/pdf-4.10.38.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker-4.10.38.min.mjs';const pdf=await pdfjs.getDocument({data:new Uint8Array(await record.file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true}).promise;
 try{
  if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>pdf.numPages)throw Error('所选页码超出PDF范围。');status('正在渲染图纸第'+pageNumber+'页…');const page=await pdf.getPage(pageNumber),raw=page.getViewport({scale:1}),low=page.getViewport({scale:Math.min(2,1400/Math.max(raw.width,raw.height))}),canvas=document.createElement('canvas');canvas.width=Math.ceil(low.width);canvas.height=Math.ceil(low.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:low,background:'white'}).promise;
  const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let minX=canvas.width,minY=canvas.height,maxX=0,maxY=0;
  for(let y=0;y<canvas.height;y+=2)for(let x=0;x<canvas.width;x+=2){const i=(y*canvas.width+x)*4;if(pixels[i+3]>32&&(pixels[i]<235||pixels[i+1]<235||pixels[i+2]<235)){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
  if(minX>=maxX||minY>=maxY)throw Error('该页没有可见图纸内容。');minX=Math.max(0,minX-12);minY=Math.max(0,minY-12);maxX=Math.min(canvas.width,maxX+14);maxY=Math.min(canvas.height,maxY+14);
  const width=(maxX-minX)/low.scale,height=(maxY-minY)/low.scale,scale=Math.min(6,4096/Math.max(width,height),Math.sqrt(10000000/(width*height))),viewport=page.getViewport({scale}),high=document.createElement('canvas');high.width=Math.ceil(width*scale);high.height=Math.ceil(height*scale);await page.render({canvasContext:high.getContext('2d'),viewport,transform:[1,0,0,1,-minX*scale/low.scale,-minY*scale/low.scale],background:'white'}).promise;
  const images=[];function image(id,region,sx,sy,w,h,outWidth=w){const c=document.createElement('canvas');c.width=Math.ceil(outWidth);c.height=Math.ceil(h*outWidth/w);c.getContext('2d').drawImage(high,sx,sy,w,h,0,0,c.width,c.height);images.push({id:file.id+'-'+pageNumber+'-'+id,fileName:file.name,page:pageNumber,region,width:c.width,height:c.height,data:c.toDataURL('image/jpeg',.92)});}
  image('overview','全图概览；图例计数只在此图进行，局部图不要重复计数',0,0,high.width,high.height,Math.min(1800,high.width));
  let tile=1500,cols=Math.ceil(high.width/tile),rows=Math.ceil(high.height/tile);while(cols*rows>6){tile+=200;cols=Math.ceil(high.width/tile);rows=Math.ceil(high.height/tile);}
  for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){const x=Math.max(0,col*high.width/cols-80),y=Math.max(0,r*high.height/rows-80),w=Math.min(high.width-x,high.width/cols+160),h=Math.min(high.height-y,high.height/rows+160);image('detail-'+r+'-'+col,'局部 '+(r+1)+'行'+(col+1)+'列（与邻图重叠，仅用于读标注）',x,y,w,h,Math.min(1800,w));}
  page.cleanup();return images;
 }finally{await pdf.destroy();}
}

export {sheets as loadExcelJS};
