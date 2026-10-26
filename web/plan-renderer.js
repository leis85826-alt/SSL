'use strict';
// Presentation only: no project mutation, engineering object generation or model calls.
window.RoadscapePlan=(()=>{
 const KEY='roadscape-plan-view-v1';
 const names={walk:'人行道',trees:'行道树带',bike:'非机动车道',side:'侧分带',road:'机动车道',median:'中分带'};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=value=>Number(value.toFixed(3));
 const hash=text=>{let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
 let view='landscape';try{if(localStorage.getItem(KEY)==='simple')view='simple';}catch{}
 function setView(next){if(!['landscape','simple'].includes(next))return;view=next;try{localStorage.setItem(KEY,next);}catch{}}
 function layout(plan){
  const g=plan?.geometry;
  if(!g||!Array.isArray(g.segments)||!g.segments.length||g.segments.some(s=>!names[s.type]||!Number.isFinite(s.width)||s.width<=0))return null;
  const total=g.segments.reduce((v,s)=>v+s.width,0),parts=Object.values(plan.strips||{}),hasPattern=parts.some(p=>p.pattern?.segments?.length);
  const requested=hasPattern?Math.max(...parts.map(p=>p.pattern?.segments?.reduce((v,s)=>v+s.length,0)||24)):(Number.isFinite(g.moduleLength)&&g.moduleLength>0?g.moduleLength:24);
  if(!Number.isFinite(requested)||requested<=0)return null;
  const length=Math.min(1000,requested),sx=Math.min(960/total,28),height=Math.min(760,Math.max(280,length*sx)),sy=height/length;
  let x=(1200-total*sx)/2;
  const items=g.segments.map((segment,index)=>{const item={...segment,index,x,widthPx:segment.width*sx};x+=item.widthPx;return item;});
  return {items,total,length,requested,sx,sy,height,left:items[0].x,right:x,top:130,hasPattern,distorted:Math.abs(sx-sy)>.001};
 }
 function intervals(part,length){
  const segments=part?.pattern?.segments;
  if(!segments?.length)return [{start:0,end:length,plants:part?.plants||[],label:'',pattern:false}];
  const result=[];let at=0,guard=0;
  while(at<length&&guard<512){
   for(const segment of segments){if(at>=length||guard>=512)break;if(!Number.isFinite(segment.length)||segment.length<=0)return result;const end=Math.min(length,at+segment.length);result.push({start:at,end,plants:(part.plants||[]).filter(p=>segment.plants?.includes(p.name)),label:segment.length+' m',pattern:true});at=end;guard++;}
   if(!part.pattern.repeat)break;
  }
  if(at<length)result.push({start:at,end:length,plants:[],label:guard>=512?'分段过密，略示':'余段未指定',pattern:true,unspecified:true});
  return result;
 }
 function stations(plan,length){const spacing=Number(plan.geometry.spacing);if(!Number.isFinite(spacing)||spacing<=0)return [];const step=Math.max(1,spacing),result=[];for(let at=spacing/2;at<length&&result.length<1000;at+=step)result.push(at);return result;}
 function contour(seed,r=32){const points=[];const phase=(seed%360)*Math.PI/180;for(let i=0;i<64;i++){const angle=i*Math.PI/32,rad=r*(.89+.055*Math.sin(angle*3+phase)+.06*Math.sin(angle*7-phase*.7)+.035*Math.cos(angle*13+phase*.3));points.push([Math.cos(angle)*rad,Math.sin(angle)*rad]);}let path='';for(let i=0;i<points.length;i++){const p=points[i],next=points[(i+1)%points.length],mid=[(p[0]+next[0])/2,(p[1]+next[1])/2];if(i===0){const previous=points.at(-1);path='M'+n((previous[0]+p[0])/2)+' '+n((previous[1]+p[1])/2);}path+=' Q'+n(p[0])+' '+n(p[1])+' '+n(mid[0])+' '+n(mid[1]);}return path+' Z';}
 function render(plan){
  const frame=layout(plan);if(!frame)return '';
  const {items,total,length,sx,sy,height,left,right,top}=frame,bottom=top+height;
  const prefix='plan-a-'+hash(JSON.stringify({geometry:plan.geometry,parts:plan.strips})).toString(36);
  const symbols=new Map(),clips=[],canopies=[],notes=new Set();
  const palette=['#a1b36d','#aabb78','#87a16b','#b4bf84','#8da575','#a6b580'];
  const plantList=[...new Map(Object.values(plan.strips||{}).flatMap(p=>p.plants||[]).map(p=>[p.name,p])).values()];
  const plantIndex=new Map(plantList.map((p,i)=>[p.name,'P'+String(i+1).padStart(2,'0')]));
  const color=plant=>palette[hash(plant?.name||'green')%palette.length];
  const clip=(id,x,y,w,h)=>{clips.push(`<clipPath id="${id}"><rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0,w))}" height="${n(Math.max(0,h))}"/></clipPath>`);return `clip-path="url(#${id})"`;};
  function symbol(plant){
   const key=plant.name+'|'+plant.role;if(symbols.has(key))return symbols.get(key).id;
   const id=prefix+'-crown-'+symbols.size,seed=hash(key),path=contour(seed);let inside='';
   for(let i=0;i<11;i++){const a=(i*137.5+seed%80)*Math.PI/180,d=8+(i%3)*5;inside+=`<circle cx="${n(Math.cos(a)*d)}" cy="${n(Math.sin(a)*d)}" r="${8+i%4}" fill="${i%2?'#d5dda1':'#4a7049'}" opacity="${i%2?.36:.17}"/>`;}
   for(let i=0;i<9;i++){const a=([13,57,98,148,197,246,286,319,348][i]+seed%19)*Math.PI/180,x=Math.cos(a)*24,y=Math.sin(a)*24;inside+=`<path d="M0 2 Q${n(x*.23-2)} ${n(y*.36)} ${n(x)} ${n(y)} M${n(x*.48)} ${n(y*.48)} l${n(Math.cos(a+.6)*9)} ${n(Math.sin(a+.6)*9)} M${n(x*.66)} ${n(y*.66)} l${n(Math.cos(a-.7)*7)} ${n(Math.sin(a-.7)*7)}" fill="none" stroke="#50694b" stroke-width=".58" opacity=".56"/>`;}
   for(let i=0;i<36;i++){const a=(i*137.5+seed%360)*Math.PI/180,d=4+Math.sqrt(i/36)*23;inside+=`<path d="M${n(Math.cos(a)*d)} ${n(Math.sin(a)*d)} l2 -1 -1 -2" fill="none" stroke="${i%3?'#e2e8be':'#4e764d'}" stroke-width=".6" opacity=".6"/>`;}
   const svg=`<g id="${id}"><path d="${path}" fill="${color(plant)}" stroke="#5b7753" stroke-width=".7"/>${inside}<path d="${contour(seed+41,26)}" fill="none" stroke="#e1e7b9" stroke-width=".4" opacity=".3"/><circle r="1.4" fill="#586845"/></g>`;
   symbols.set(key,{id,svg});return id;
  }
  function ground(plants,x,y,w,h,clipId){
   if(!plants.length)return '';
   const entry=plants[0],woody=entry.role==='灌木';let art=`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${color(entry)}" opacity=".5"/><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${prefix}-${woody?'shrubs':'meadow'})"/>`;
   // Color washes indicate layers, not a prescribed species partition or quantity.
   plants.slice(1,4).forEach((p,i)=>{art+=`<path d="M${n(x+w*(.12+i*.18))} ${n(y-5)} Q${n(x+w*.95)} ${n(y+h*.32)} ${n(x+w*.35)} ${n(y+h*.6)} T${n(x+w*.68)} ${n(y+h+5)}" stroke="${color(p)}" stroke-width="${n(Math.max(2,w*.33))}" fill="none" opacity=".37"/>`;});
   return `<g ${clipId}>${art}</g>`;
  }
  const overallClip=clip(prefix+'-corridor',left,top,right-left,height);
  let base='',planting='',dimensions='',schedule='';
  const centers=stations(plan,length);
  items.forEach((s,index)=>{
   const x=s.x,w=s.widthPx,mid=x+w/2,part=plan.strips?.[s.type],isolated=s.type==='trees'&&plan.geometry.treeLayout==='isolated';
   const hard=s.type==='walk'||isolated;
   const fill=s.type==='road'?`url(#${prefix}-asphalt)`:hard?`url(#${prefix}-paving)`:s.type==='bike'?'#e0e6df':'#e5ebdb';
   base+=`<rect data-band-type="${s.type}" data-width-m="${s.width}" x="${n(x)}" y="${top}" width="${n(w)}" height="${n(height)}" fill="${fill}"/>`;
   if(s.type==='road'){
    const lanes=Math.max(1,Math.round(s.width/3.5));for(let i=1;i<lanes;i++)base+=`<path d="M${n(x+w*i/lanes)} ${top+12}V${n(bottom-12)}" stroke="#fbfcf6" stroke-width="1.5" stroke-dasharray="20 22"/>`;
   }
   if(index>0){const adjacent=s.type==='road'&&items[index-1].type==='road';base+=`<path d="M${n(x)} ${top}V${n(bottom)}" stroke="${adjacent?'#fbfcf6':'#c1c5b9'}" stroke-width="${adjacent?1:2.2}"/>`;if(!adjacent)base+=`<path d="M${n(x+2)} ${top}V${n(bottom)}" stroke="#fbfaf4" stroke-width=".8"/>`;}
   if(part){
    const chunks=intervals(part,length);
    chunks.forEach((chunk,j)=>{
     const y=top+chunk.start*sy,h=(chunk.end-chunk.start)*sy;
     const regionClip=clip(prefix+'-bed-'+index+'-'+j,x+1,y,Math.max(0,w-2),h);
     const groundPlants=chunk.plants.filter(p=>!/乔木/.test(p.role));
     if(!isolated&&!chunk.unspecified)planting+=ground(groundPlants,x,y,w,h,regionClip);
     if(chunk.unspecified){notes.add(chunk.label+'，详见分段配置文字');planting+=`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${prefix}-unspecified)"/>`;}
     if(part.sponge&&!isolated&&!chunk.unspecified){planting+=`<g ${regionClip}><path d="M${n(mid)} ${n(y)} Q${n(mid-w*.22)} ${n(y+h*.25)} ${n(mid)} ${n(y+h*.5)} T${n(mid)} ${n(y+h)}" stroke="${part.gravel?'#dedcc9':'#93a892'}" stroke-width="${n(w*(part.gravel?.26:.45))}" fill="none"/><path d="M${n(mid)} ${n(y)}Q${n(mid-w*.22)} ${n(y+h*.25)} ${n(mid)} ${n(y+h*.5)}T${n(mid)} ${n(y+h)}" stroke="url(#${prefix}-gravel)" stroke-width="${n(w*.17)}" fill="none"/></g>`;}
     const tree=chunk.plants.find(p=>/乔木/.test(p.role));
     if(tree){
      const positions=!chunk.pattern&&part.segmented&&part.sponge?[10,22].filter(d=>d<length):centers;
      for(const d of positions){if(d<chunk.start||d>=chunk.end)continue;const cy=top+d*sy;
       if(isolated){const pitWidth=Math.max(0,w-5),pitHeight=Math.min(s.width,Math.max(1,Number(plan.geometry.spacing))*.7)*sy,pitY=Math.max(top,cy-pitHeight/2),pitH=Math.min(bottom,cy+pitHeight/2)-pitY,pitClip=clip(prefix+'-pit-'+index+'-'+n(d),x+2.5,pitY,pitWidth,pitH);planting+=`<rect data-tree-pit="true" x="${n(x+2.5)}" y="${n(pitY)}" width="${n(pitWidth)}" height="${n(pitH)}" fill="#d5dfc1" stroke="#9aa68e" stroke-width="1.2"/>`+ground(groundPlants,x+2.5,pitY,pitWidth,pitH,pitClip);}
       const r=Math.min(62,Math.max(3,Math.min(sx,sy)*(tree.role==='小乔木'?1.2:2.1))),id=symbol(tree);
       canopies.push(`<g data-plan-tree="true" data-station-m="${n(d)}" data-species="${esc(tree.name)}"><ellipse cx="${n(mid+r*.12)}" cy="${n(cy+r*.16)}" rx="${n(r*.92)}" ry="${n(r*.84)}" fill="#485d43" opacity=".12"/><use href="#${id}" transform="translate(${n(mid)} ${n(cy)}) scale(${n(r/32)}) rotate(${hash(tree.name+d)%90-45})"/></g>`);
      }
     }
     if(chunk.pattern&&j>0)planting+=`<path d="M${n(x)} ${n(y)}h${n(w)}" stroke="#819174" stroke-width=".7" stroke-dasharray="3 3"/>`;
     if(chunk.pattern&&w>34&&h>30&&!chunk.unspecified){const text=[chunk.label,...chunk.plants.map(p=>plantIndex.get(p.name))].join(' · ');planting+=`<text x="${n(x+4)}" y="${n(y+14)}" font-size="8.5" fill="#3e5940" stroke="#f5f7ec" stroke-width="2.8" paint-order="stroke">${esc(text)}</text>`;}
    });
   }
   const number=String(index+1).padStart(2,'0');
   dimensions+=`<path d="M${n(x)} ${n(bottom+15)}v9h${n(w)}v-9" fill="none" stroke="#8d9b85" stroke-width=".7"/><text x="${n(mid)}" y="${n(bottom+40+index%2*14)}" text-anchor="middle" font-size="9.5" fill="#65725f">${s.width}m</text><text x="${n(mid)}" y="${top+19}" text-anchor="middle" font-size="${w<20?7:9}" fill="#5c6955" stroke="#fbfcf7" stroke-width="3" paint-order="stroke">${number}</text>`;
   const col=index%3,row=Math.floor(index/3),y=bottom+104+row*22;
   schedule+=`<text x="${94+col*344}" y="${n(y)}" font-size="11"><tspan fill="#95a18b">${number}</tspan><tspan dx="12">${esc(isolated?'独立树池带':s.name||names[s.type])}</tspan><tspan dx="12" fill="#839078">${s.width} m</tspan></text>`;
  });
  const scheduleRows=Math.ceil(items.length/3),legendTop=bottom+130+scheduleRows*22;
  let legend='';plantList.forEach((plant,i)=>{const x=94+i%3*344,y=legendTop+Math.floor(i/3)*32;const woody=/乔木/.test(plant.role);legend+=woody?`<use href="#${symbol(plant)}" transform="translate(${x+10} ${y-4}) scale(.31)"/>`:`<rect x="${x}" y="${y-14}" width="20" height="18" rx="3" fill="${color(plant)}" stroke="#9aaa89" stroke-width=".6"/><rect x="${x}" y="${y-14}" width="20" height="18" fill="url(#${prefix}-meadow)"/>`;legend+=`<text x="${x+30}" y="${y}" font-size="11">${plantIndex.get(plant.name)} · ${esc(plant.name)}<tspan dx="7" fill="#8a9680" font-size="9">${esc(plant.role)}</tspan></text>`;});
  const footer=legendTop+Math.ceil(plantList.length/3)*32+15,boardHeight=footer+66;
  const maxScale=Math.max(1,Math.min(5,Math.floor(total/5))),scaleWidth=maxScale*sx;
  const patterns=`<pattern id="${prefix}-paving" width="42" height="28" patternUnits="userSpaceOnUse"><rect width="42" height="28" fill="#f0ede5"/><path d="M0 0H42M0 14H42M0 28H42M0 0V14M28 0V14M14 14V28M42 14V28" stroke="#d8d4c8" stroke-width=".65"/><path d="M1 1H41M1 15H41" stroke="#fbfaf5" stroke-width=".65"/></pattern><pattern id="${prefix}-asphalt" width="13" height="13" patternUnits="userSpaceOnUse"><rect width="13" height="13" fill="#d3d7d3"/><circle cx="3" cy="5" r=".45" fill="#adb6ac" opacity=".35"/><circle cx="9" cy="10" r=".35" fill="#edf0e8"/></pattern><pattern id="${prefix}-meadow" width="15" height="15" patternUnits="userSpaceOnUse"><path d="M3 10l1-4 1 4M9 4l1-2 1 3M10 13l1-3 2 2" fill="none" stroke="#82976f" stroke-width=".65" opacity=".65"/><circle cx="5" cy="3" r=".7" fill="#dce5b6"/><circle cx="12" cy="7" r=".6" fill="#dce5b6"/></pattern><pattern id="${prefix}-shrubs" width="22" height="20" patternUnits="userSpaceOnUse"><path d="M3 6q4-6 8 0q4-4 7 1q0 6-6 6q-6 4-10-2Z" fill="#9caf88" stroke="#7b936c" stroke-width=".6" opacity=".66"/><path d="M5 8l6-2-2 5" fill="none" stroke="#e2e8bf" stroke-width=".65"/></pattern><pattern id="${prefix}-gravel" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#dedcc9"/><ellipse cx="3" cy="4" rx="2" ry="1.4" fill="#c9c9b8"/><ellipse cx="9" cy="9" rx="2.1" ry="1.5" fill="#efeee3"/></pattern><pattern id="${prefix}-unspecified" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#edf0e8"/><path d="M0 9L9 0" stroke="#cfd7c6" stroke-width=".7"/></pattern>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="plant-drawing landscape-plan" viewBox="0 0 1200 ${n(boardHeight)}" data-drawing="plan" data-plan-style="landscape-a" data-module-length="${length}" data-total-width="${total}" role="img" aria-label="A风格精细矢量种植彩平，道路总宽${n(total)}米"><title>精细矢量种植彩平</title><desc>植物冠幅和地被纹理为示意，不用于推算工程量。道路组成及分段读取已有方案。</desc><defs>${patterns}${clips.join('')}${[...symbols.values()].map(v=>v.svg).join('')}</defs><rect width="1200" height="${n(boardHeight)}" fill="#fbfcf8"/><g font-family="Microsoft YaHei, PingFang SC, sans-serif" fill="#475d40"><text x="64" y="35" fill="#8b9d7b" font-size="10" letter-spacing="2.4">ROADSCAPE / PLANTING PLAN</text><text x="64" y="66" font-size="22">种植平面 · 精细矢量彩平</text><text x="64" y="90" font-size="11" fill="#87947b">${frame.hasPattern?'分段模块':'典型模块'} ${length} m · 横向总宽 ${n(total)} m${frame.requested>length?' · 截取前1000 m':''}${frame.distorted?' · 纵向示意伸缩':''}</text><g transform="translate(${n(right-scaleWidth)} 75)"><path d="M0-5V0H${n(scaleWidth)}V-5" fill="none" stroke="#66785b" stroke-width="1"/><text y="15" font-size="9" fill="#87947b">0</text><text x="${n(scaleWidth)}" y="15" text-anchor="end" font-size="9" fill="#87947b">横向 ${maxScale} m</text></g><g ${overallClip}>${base}${planting}${canopies.join('')}</g><rect x="${n(left)}" y="${top}" width="${n(right-left)}" height="${n(height)}" fill="none" stroke="#9aa68e" stroke-width=".8"/>${dimensions}<text x="64" y="${n(bottom+78)}" font-size="10" fill="#8b9d7b" letter-spacing="1">道路组成 / 左 → 右</text>${schedule}<path d="M64 ${n(legendTop-24)}H1136" stroke="#dbe2d2" stroke-width=".8"/>${legend}<text x="64" y="${n(footer+16)}" font-size="10" fill="#8c9782">植物冠幅、林下纹理及树池纵向尺寸为图示；精确规格和数量以工程数据为准。</text>${notes.size?`<text x="64" y="${n(footer+36)}" font-size="9" fill="#9b8d6e">${esc([...notes].join('；'))}</text>`:''}</g></svg>`;
 }
 return {render,layout,intervals,stations,view:()=>view,setView};
})();
