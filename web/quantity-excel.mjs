import {loadExcelJS} from './quantity-reader.mjs?v=20261110-xlsx-01';

// Export the same calculated snapshot shown by the quantity page. No model calls.
export async function exportWorkbook(project,q,rows){
 const ExcelJS=await loadExcelJS(),book=new ExcelJS.Workbook();
 book.creator='道路绿化方案工作台';book.created=new Date();
 const missing=rows.filter(r=>r.price===null).length,total=rows.reduce((sum,r)=>sum+(r.amount??0),0);
 const summary=book.addWorksheet('估算汇总');
 summary.columns=[{width:36},{width:70},{width:18},{width:24}];
 summary.addRows([
  ['工程量与费用估算'],['项目名称',project.name],['导出时间',new Date().toLocaleString('zh-CN')],
  ['标准段长度 / m',q.standardLength],['道路总长度 / m',q.totalLength],['标准段范围',q.scope],
  ['地区',q.region||'未填写'],['信息价年月',q.period||'未填写'],['计价口径',q.priceBasis],
  ['长度换算系数',q.totalLength/q.standardLength],['清单项目数',rows.length],['缺价项目数',missing],
  ['已填单价项目金额 / 元',total],
  ['说明',missing?'存在缺价项目：金额为已填单价项目小计，不代表完整工程造价。':'金额按已确认单价计算。'],
  ['费用范围','苗木材料价不自动包含施工、运输、养护及税费，计价范围须核对。'],
  ['换算规则','株、套、个按比例换算后向上取整，再加人工增减；其他单位保留两位小数。'],
  ['范围规则','按清单实际范围换算，不自动乘二；一次性项目系数为1。'],[],
  ['部位','清单项目数','缺价项目数','已填单价项目金额 / 元']
 ]);
 const groups=new Map();for(const r of rows){const key=r.part||'未注明部位',g=groups.get(key)||{count:0,missing:0,amount:0};g.count++;g.missing+=Number(r.price===null);g.amount+=r.amount??0;groups.set(key,g);}
 for(const [part,g] of groups)summary.addRow([part,g.count,g.missing,Number(g.amount.toFixed(2))]);
 summary.getCell('B13').numFmt='#,##0.00';summary.getCell('B10').numFmt='0.########';
 summary.getRow(1).font={bold:true,size:16};summary.getRow(19).font={bold:true};
 for(let i=14;i<=17;i++){summary.getRow(i).height=38;summary.getCell('B'+i).alignment={wrapText:true,vertical:'middle'};}
 for(let i=20;i<=summary.rowCount;i++)summary.getCell('D'+i).numFmt='#,##0.00';
 const detail=book.addWorksheet('工程量明细',{views:[{state:'frozen',ySplit:1,xSplit:3}]});
 const headers=['序号','部位','工程类型','项目名称','规格／做法','单位','标准段数量','计算方式','换算系数','增减量','总工程量','单价 / 元','金额 / 元','价格状态','价格来源／页码','识别依据','信息价原单价 / 元','信息价原单位','种植密度 / 株每㎡','单价换算依据'];
 detail.columns=headers.map((header,i)=>({header,width:[8,18,14,24,30,10,16,18,16,14,18,18,20,14,42,50,20,16,22,56][i]}));
 const originals=new Map(q.rows.map(r=>[r.id,r]));
 const source=e=>e?[e.fileName,e.location,e.quote].filter(Boolean).join(' · '):'';
 for(let i=0;i<rows.length;i++){const r=rows[i];detail.addRow([i+1,r.part,r.category||'其他',r.name,r.spec,r.unit,originals.get(r.id).quantity,r.repeat?'按长度重复':'一次性',r.factor,r.adjustment||0,r.quantity,r.price,r.amount,r.price===null?'缺价':'已填单价',r.priceSource||source(r.priceEvidence)||(r.price===null?'':'手动单价，来源待补'),source(r.evidence),r.priceInput?.price??null,r.priceInput?.unit||'',r.category==='灌木'&&r.unit==='㎡'&&r.priceInput?.unit==='株'?r.density??64:null,r.priceRule||'手工单价']);}
 detail.autoFilter={from:'A1',to:'T'+(rows.length+1)};
 for(const col of ['G','J','K','L','M','Q','S'])detail.getColumn(col).numFmt='#,##0.00';detail.getColumn('I').numFmt='0.########';
 detail.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};detail.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF667660'}};detail.getRow(1).height=28;
 detail.eachRow(row=>{row.alignment={vertical:'middle',wrapText:true};});
 detail.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
 return book.xlsx.writeBuffer();
}
