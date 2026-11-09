'use strict';
// Proportional collage only. Never changes a plan or calls an image service.
window.RoadscapeRealisticSection=(()=>{
 const KEY='roadscape-section-view-v1';let mode='vector';
 try{if(localStorage.getItem(KEY)==='realistic')mode='realistic';}catch{}
 function setView(value){if(!['vector','realistic'].includes(value))return;mode=value;try{localStorage.setItem(KEY,value);}catch{}}
 const n=v=>Number(v.toFixed(3));
 function render(plan){
  const frame=window.RoadscapePlan?.layout(plan),atlas=window.RoadscapeSectionAtlas;if(!frame||!atlas)return '';
  const {escape:esc,hash}=RoadscapePlan.appearance,{items,total,sx,left,right}=frame;
  const prefix='real-section-'+hash(JSON.stringify(plan)).toString(36),panels=RoadscapeSection.variants(plan),panelH=440;
  const names={walk:'人行道',trees:'行道树带',bike:'非机动车道',side:'侧分带',road:'机动车道',median:'中分带'};
  const sprite=(cell,x,ground,size,extra='')=>`<svg x="${n(x-size/2)}" y="${n(ground-size*.96)}" width="${n(size)}" height="${n(size)}" viewBox="${cell%3*512} ${Math.floor(cell/3)*512} 512 512" overflow="hidden" ${extra}><use href="#${prefix}-atlas"/></svg>`;
  // Tight source regions isolate the supplied silhouettes; no rectangular crop through foliage.
  const plantSheet=window.RoadscapePlantMaterialPNG;
  const specimens=[[45,100,320,320],[375,35,365,390],[752,62,290,362],[88,495,240,288],[328,505,250,279],[575,493,241,291],[820,468,218,316],[102,828,234,188],[351,872,151,144],[521,829,215,187],[755,899,280,117]];
  function plantSprite(cell,cx,baseline,h,maxWidth){
   if(!plantSheet)return '';
   const [px,py,pw,ph]=specimens[cell],height=Math.min(h,maxWidth*ph/pw),width=height*pw/ph;
   return `<svg data-plant-material="${cell}" x="${n(cx-width/2)}" y="${n(baseline-height)}" width="${n(width)}" height="${n(height)}" viewBox="${px} ${py} ${pw} ${ph}" overflow="hidden"><use href="#${prefix}-plants"/></svg>`;
  }
  const clips=[],drawings=panels.map((variant,panelIndex)=>{
   const top=100+panelIndex*panelH,ground=top+285;let surfaces='',plants='',people='',dims='';
   const caption=variant.key?`${names[variant.key]} · 第${variant.index+1}段 · ${variant.length} m · ${variant.names.join('＋')}`:'典型树位断面';
   items.forEach((s,index)=>{
    const {x,widthPx:w}=s,mid=x+w/2,source=plan.strips?.[s.type],part=source&&variant.key===s.type?{...source,plants:source.plants.filter(p=>variant.names.includes(p.name))}:source;
    const green=['trees','side','median'].includes(s.type)&&part,isolated=s.type==='trees'&&plan.geometry.treeLayout==='isolated',dip=green&&part.sponge?10:0;
    const color=green?'#a1aa77':s.type==='road'?'#777d80':s.type==='bike'?'#b8b9aa':'#ddd9cf';
    surfaces+=`<g data-real-band="${s.type}" data-width-m="${s.width}"><rect x="${n(x)}" y="${ground}" width="${n(w)}" height="36" fill="url(#${prefix}-earth)"/><path d="M${n(x)} ${ground}L${n(x+(dip?w*.16:0))} ${ground+dip}H${n(x+w-(dip?w*.16:0))}L${n(x+w)} ${ground}" fill="none" stroke="${color}" stroke-width="6"/><path d="M${n(x)} ${ground-4}v9m${n(w)}-9v9" stroke="#555d58" fill="none"/>${isolated?`<rect x="${n(x+1)}" y="${ground+2}" width="${n(Math.max(0,w-2))}" height="5" fill="#85795c"/>`:''}</g>`;
    if(green){
     const all=part.plants||[],low=all.filter(p=>!/乔木/.test(p.role)),trees=all.filter(p=>/乔木/.test(p.role));
     // Choose reproducible silhouettes from role and form; these are generic shapes, not species photos.
     trees.forEach((tree,j)=>{
      const small=tree.role==='小乔木',seed=hash(tree.name),narrow=/柱|塔|直立|杉|柏/.test(tree.name+' '+(tree.form||'')),spreading=/伞|开展|冠幅/.test(tree.form||'');
      const cell=small?3+seed%4:narrow?6:spreading?0:seed%3;
      const maxWidth=Math.min(240,Math.max(75,w*1.8)),box=specimens[cell],h=Math.min(small?125:225,Math.max(small?55:100,sx*(small?3.8:7)),maxWidth*box[3]/box[2]),cx=mid+(j-(trees.length-1)/2)*Math.min(w*.25,25);
      plants+=`<g data-real-tree="true" data-species="${esc(tree.name)}">${plantSheet?plantSprite(cell,cx,ground+dip,h,Math.min(240,Math.max(75,w*1.8))):sprite(small?1:0,cx,ground,h)}<text x="${n(cx)}" y="${n(ground-h-10-j*13)}" text-anchor="middle" font-size="11">${esc(tree.name)} · 树形示意</text></g>`;
     });
     if(low.length){
      const count=Math.max(1,Math.min(4,Math.floor(w/30))),span=Math.max(1,w-6)/count;let layer='';
      for(let k=0;k<count;k++){const plant=low[k%low.length],shrub=plant.role==='灌木',cell=shrub?7+hash(plant.name+k)%4:10,h=shrub?Math.min(48,sx*1.5):Math.min(23,sx*.65),cx=x+3+span*(k+.5);layer+=plantSheet?plantSprite(cell,cx,ground+dip,h,span*1.15):sprite(2,cx,ground+dip,h);}
      plants+=`<g data-real-understory="true">${layer}</g>`;
     }
    }
    if(s.type==='walk'&&s.width>=1.4)people+=sprite(3,mid,ground,Math.min(60,sx*2.1));
    if(s.type==='bike'&&s.width>=1.2)people+=sprite(4,mid,ground,Math.min(63,sx*2));
    if(s.type==='road'&&s.width>=2.5){const count=Math.min(4,Math.max(1,Math.floor(s.width/3.5))),size=Math.min(61,sx*2.3);for(let i=0;i<count;i++){const cx=x+w*(i+.5)/count;people+=sprite(5,cx,ground,size);}}
    dims+=`<path d="M${n(x)} ${ground+48}v8h${n(w)}v-8" fill="none" stroke="#637267" stroke-width=".8"/><text x="${n(mid)}" y="${ground+74+(index%2)*15}" text-anchor="middle" font-size="10">${s.width} m</text><text x="${n(mid)}" y="${ground+105+(index%2)*15}" text-anchor="middle" font-size="10">${esc(s.name||names[s.type])}</text>`;
   });
   return `<g data-real-panel="${panelIndex}"><text x="64" y="${top+5}" font-size="11">${esc(caption)}</text><rect x="${n(left)}" y="${top+20}" width="${n(right-left)}" height="${ground-top-20}" fill="url(#${prefix}-sky)"/><g opacity=".4" fill="white"><ellipse cx="440" cy="${top+58}" rx="160" ry="16"/><ellipse cx="830" cy="${top+89}" rx="130" ry="14"/></g>${surfaces}${plants}${people}${dims}</g>`;
  }).join('');
  const notes=105+panels.length*panelH,height=notes+70;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="plant-drawing realistic-section" viewBox="0 0 1200 ${height}" data-drawing="section" data-section-style="realistic" data-total-width="${n(total)}" role="img" aria-label="植物插画道路断面，总宽${n(total)}米"><title>道路断面 · 植物插画</title><desc>道路顺序与横向宽度来自当前方案；植物、人物和车辆为表现素材，树高、冠幅及土层厚度不作为工程尺寸。植物形态不用于品种鉴定。</desc><defs>${plantSheet?`<image id="${prefix}-plants" width="1098" height="1433" href="${plantSheet}"/>`:''}<image id="${prefix}-atlas" width="1536" height="1024" href="${atlas}"/><linearGradient id="${prefix}-sky" x2="0" y2="1"><stop stop-color="#a8d6e6"/><stop offset="1" stop-color="#eef6f3"/></linearGradient><pattern id="${prefix}-earth" width="15" height="13" patternUnits="userSpaceOnUse"><rect width="15" height="13" fill="#d0cec6"/><path d="M0 13L13 0M8 13L15 6" stroke="#b4b3aa" stroke-width=".6"/><circle cx="4" cy="6" r=".8" fill="#a5a79c"/></pattern>${clips.join('')}</defs><rect width="1200" height="${height}" fill="#fafbf8"/><g font-family="Microsoft YaHei,PingFang SC,sans-serif" fill="#354a40"><text x="64" y="38" font-size="23">道路断面 · 植物插画</text><text x="64" y="66" font-size="12">道路总宽 ${n(total)} m · 横向按已保存尺寸 · 按方案角色搭配植物素材</text>${drawings}<text x="64" y="${notes}" font-size="11">采用提供的透明插画素材，树形不等同于植物品种；具体品种以清单为准；树高、冠幅、土层与人物车辆尺度为表现示意。</text><text x="64" y="${notes+23}" font-size="11">${panels.length>1?'分段分别展示，其他部位为典型配置。':''}${Object.values(plan.strips||{}).some(p=>p.pattern?.segments?.length>12)?'仅展示前12种分段典型断面。':''}未提供坡度、标高与车道方向时不作推定。</text></g></svg>`;
 }
 return {render,view:()=>mode,setView};
})();
