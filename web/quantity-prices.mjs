// Fill a review draft only; never calculate totals or overwrite entered prices.
export function fillCandidatePrices(q){
 const summary={filled:0,preserved:0,missing:0,conflicts:0};
 const matches=q.agent?.kind==='match'?q.agent.result.matches:[];
 for(const row of q.rows){
  if(row.price!==null&&row.price!==undefined){summary.preserved++;continue;}
  const candidates=matches.filter(m=>m.row_id===row.id&&['exact','similar'].includes(m.status)&&Number.isFinite(m.price)&&m.price>=0&&m.evidence?.source_id&&typeof m.evidence.quote==='string').sort((a,b)=>Number(b.status==='exact')-Number(a.status==='exact'));
  const selected=candidates[0];if(!selected){summary.missing++;continue;}
  const conflict=new Set(candidates.map(m=>m.price)).size>1;
  row.price=selected.price;
  row.priceSource='候选待复核 · '+[selected.evidence.fileName,selected.evidence.location,'原文：'+selected.evidence.quote].filter(Boolean).join(' · ');
  row.priceEvidence=selected.evidence;
  row.priceReview={matchStatus:selected.status,reason:selected.reason||'',conflict};
  summary.filled++;if(conflict)summary.conflicts++;
 }
 q.ready=false;delete q.calculatedAt;
 q.priceFillSummary={...summary,at:new Date().toISOString()};
 return summary;
}
