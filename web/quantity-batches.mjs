// Keep each request within the existing worker/model bounds, including UTF-8 JSON bytes.
export function planBatches(documents,common){
 const encoder=new TextEncoder(),base=encoder.encode(JSON.stringify({...common,documents:[]})).length;
 if(base>150000)throw Error('本次清单过长，请减少规格描述后分析。');
 const batches=[];let docs=[],chars=0,bytes=base;
 for(const d of documents){const size=encoder.encode(JSON.stringify(d)).length+1;
  if(d.text.length>4000||size+base>450000)throw Error('单段资料过长，请拆分该段后分析。');
  if(docs.length&&(chars+d.text.length>60000||docs.length>=400||bytes+size>450000)){batches.push(docs);docs=[];chars=0;bytes=base;}
  docs.push(d);chars+=d.text.length;bytes+=size;
 }
 if(docs.length)batches.push(docs);
 if(batches.length>40)throw Error('本次资料需超过40批，请按信息价章节勾选文件后分析。原清单保留。');
 return batches;
}
export function combineResults(mode,results,rows=[]){
 if(mode==='extract'){const warnings=[...new Set(results.flatMap(r=>r.warnings||[]))].slice(0,20);return {rows:results.flatMap(r=>r.rows),...(warnings.length?{warnings}:{})};}
 const matches=[],seen=new Set(),unresolved=new Map();
 for(const result of results)for(const m of result.matches){if(m.status==='missing'){if(typeof m.reason==='string'&&m.reason.trim()){const list=unresolved.get(m.row_id)||[];list.push(m);unresolved.set(m.row_id,list);}continue;}
  const e=m.evidence,key=JSON.stringify([m.row_id,m.price,m.source_unit,e?.source_id,e?.quote]);
  if(!seen.has(key)){seen.add(key);matches.push(m);}
 }
 for(const row of rows)if(!matches.some(m=>m.row_id===row.id)){const candidates=unresolved.get(row.id)||[],detail=candidates.find(m=>m.evidence)||candidates[0];matches.push(detail?{...detail,status:'missing',price:null}:{row_id:row.id,status:'missing',price:null,reason:'本次各批资料中未找到可靠单价候选，请人工查阅。'});}
 return {matches};
}
