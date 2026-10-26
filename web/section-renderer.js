'use strict';
// A-style elevation symbols. No vertical engineering dimensions are inferred.
window.RoadscapeSection=(()=>{
 const names={walk:'人行道',trees:'行道树带',bike:'非机动车道',side:'侧分带',road:'机动车道',median:'中分带'};
 const n=value=>Number(value.toFixed(3));
 function variants(plan){
  const rows=Object.entries(plan.strips||{}).flatMap(([key,part])=>(part.pattern?.segments||[]).map((segment,index)=>({key,index,length:segment.length,names:segment.plants||[]})));
  return rows.length?rows.slice(0,12):[{key:null}];
 }
 function render(plan){
  const frame=window.RoadscapePlan?.layout(plan);if(!frame)return '';
  const {color,outline,hash,escape:esc}=RoadscapePlan.appearance,{items,left,right,total,sx}=frame;
  const prefix='section-a-'+hash(JSON.stringify({geometry:plan.geometry,parts:plan.strips})).toString(36),panels=variants(plan);
  const plants=[...new Map(Object.values(plan.strips||{}).flatMap(p=>p.plants||[]).map(p=>[p.name,p])).values()];
  const ids=new Map(plants.map((p,i)=>[p.name,'P'+String(i+1).padStart(2,'0')])),symbols=new Map(),clips=[];
  const clipping=(x,y,w,h)=>{const id=prefix+'-clip-'+clips.length;clips.push(`<clipPath id="${id}"><rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0,w))}" height="${n(Math.max(0,h))}"/></clipPath>`);return `clip-path="url(#${id})"`;};
  function crown(plant){
   const key=plant.name+'|'+plant.role;if(symbols.has(key))return symbols.get(key).id;
   const id=prefix+'-crown-'+symbols.size,seed=hash(key);let layers='';
   for(let i=0;i<14;i++){const a=(i*137.5+seed%360)*Math.PI/180,r=7+i%3*5;layers+=`<circle cx="${n(Math.cos(a)*r)}" cy="${n(Math.sin(a)*r)}" r="${7+i%4}" fill="${i%2?'#dce5ad':'#54794c'}" opacity="${i%2?.34:.16}"/>`;}
   for(let i=0;i<7;i++){const x=-23+i*7,y=-5-Math.sin(i*.9)*14;layers+=`<path d="M0 28Q${n(x*.15)} 3 ${n(x)} ${n(y)}M${n(x*.6)} ${n(y*.45+8)}l${i%2?-7:7} -10" fill="none" stroke="#5d724d" stroke-width=".7" opacity=".65"/>`;}
   for(let i=0;i<28;i++){const a=(i*137.5+seed%360)*Math.PI/180,r=4+Math.sqrt(i/28)*23;layers+=`<path d="M${n(Math.cos(a)*r)} ${n(Math.sin(a)*r)}l2-1-1-2" fill="none" stroke="#e0e8b8" stroke-width=".65" opacity=".65"/>`;}
   symbols.set(key,{id,svg:`<g id="${id}"><path d="${outline(seed)}" fill="${color(plant)}" stroke="#627c51" stroke-width=".6"/>${layers}</g>`});return id;
  }
  function tree(plant,x,ground,index){
   const small=plant.role==='小乔木',ry=small?29:45,rx=Math.max(15,Math.min(small?37:62,sx*(small?1.4:2.1))),cy=ground-(small?76:145);
   const id=crown(plant),base=ground-1;
   return `<g data-section-tree="true" data-species="${esc(plant.name)}"><ellipse cx="${n(x+8)}" cy="${n(ground+1)}" rx="${n(rx*.74)}" ry="4" fill="#738367" opacity=".12"/><path d="M${n(x-2)} ${n(base)}Q${n(x-3)} ${n(cy+50)} ${n(x)} ${n(cy+12)}L${n(x+3)} ${n(base)}Z" fill="#8a8064" stroke="#6d7358" stroke-width=".7"/><path d="M${n(x)} ${n(cy+51)}l${n(-rx*.36)} -29M${n(x)} ${n(cy+43)}l${n(rx*.35)} -31" fill="none" stroke="#7c795b" stroke-width="2.2"/><use href="#${id}" transform="translate(${n(x)} ${n(cy)}) scale(${n(rx/32)} ${n(ry/32)})"/><text x="${n(x)}" y="${n(cy-ry-13-index%2*7)}" text-anchor="middle" font-size="10" fill="#536b46">${ids.get(plant.name)} · ${esc(plant.name)}</text></g>`;
  }
  function understory(plants,x,ground,width){
   if(!plants.length)return '';const clip=clipping(x,ground-30,width,36);let art='';
   // Plant groups are layer symbols, not exact instance counts or densities.
   plants.forEach((plant,i)=>{
    const start=x+width*i/plants.length,span=width/plants.length,woody=plant.role==='灌木',h=woody?24:13;
    if(woody){art+=`<path d="M${n(start)} ${n(ground)}q${n(span*.12)} ${-h} ${n(span*.31)} ${n(-h*.7)}q${n(span*.22)} ${-h} ${n(span*.42)} 0q${n(span*.2)} ${-h*.5} ${n(span*.27)} ${n(h*.7)}Z" fill="${color(plant)}" stroke="#7f986a" stroke-width=".7"/>`;for(let j=0;j<3;j++){const cx=start+(j+.5)*span/3;art+=`<path d="M${n(cx)} ${n(ground-1)}v-12m0 5l-3-4m3 3 3-4" stroke="#dfe7b9" stroke-width=".65" fill="none"/>`;}}
    else{for(let j=0;j<Math.max(1,Math.min(8,Math.ceil(span/10)));j++){const cx=start+(j+.5)*span/Math.max(1,Math.min(8,Math.ceil(span/10)));art+=`<path d="M${n(cx)} ${n(ground)}q-6-3-5-${h}m5 ${h}q1-9 5-${h}m-5 ${h}v-${h+3}" stroke="${color(plant)}" stroke-width="1.2" fill="none"/>`;}}
   });return `<g ${clip} data-section-understory="true">${art}</g>`;
  }
  let drawings='';const panelHeight=360,panelTop=132;
  panels.forEach((variant,panelIndex)=>{
   const y=panelTop+panelIndex*panelHeight,ground=y+215,caption=variant.key?`${names[variant.key]} · 第${variant.index+1}段 · ${variant.length} m · ${variant.names.join('＋')}`:'典型树位断面';
   let surfaces='',vegetation='',dimension='';
   items.forEach((s,index)=>{
    const x=s.x,w=s.widthPx,mid=x+w/2,source=plan.strips?.[s.type];
    const part=source&&variant.key===s.type?{...source,plants:source.plants.filter(p=>variant.names.includes(p.name))}:source;
    const dip=part?.sponge?18:0,isolated=s.type==='trees'&&plan.geometry.treeLayout==='isolated';
    const surface=s.type==='road'?'asphalt':s.type==='walk'||isolated?'paving':s.type==='bike'?'bike':'soil';
    surfaces+=`<g data-section-band="${s.type}" data-width-m="${s.width}"><path d="M${n(x)} ${ground}L${n(x+(dip?w*.18:0))} ${ground+dip}H${n(x+w-(dip?w*.18:0))}L${n(x+w)} ${ground}V${ground+38}H${n(x)}Z" fill="url(#${prefix}-soil)" stroke="#aaa791" stroke-width=".7"/>`;
    if(!part||!['trees','side','median'].includes(s.type)){surfaces+=`<rect x="${n(x)}" y="${ground-5}" width="${n(w)}" height="13" fill="url(#${prefix}-${surface})" stroke="#bbc1b2" stroke-width=".6"/>`;}
    else{
     const clip=clipping(x+1,ground,w-2,39);
     if(isolated){surfaces+=`<rect data-section-pit="true" x="${n(x+2)}" y="${ground}" width="${n(Math.max(0,w-4))}" height="33" fill="url(#${prefix}-soil)" stroke="#8e9a80" stroke-width="1"/><path ${clip} d="M${n(mid)} ${ground}q-4 15 -11 26m11-26q4 15 12 25m-12-19v24" fill="none" stroke="#a29b79" stroke-width=".8" opacity=".7"/>`;}
     if(dip){surfaces+=`<path d="M${n(x+w*.21)} ${ground+dip-2}h${n(w*.58)}" stroke="#b5c7bc" stroke-width="2"/><text x="${n(mid)}" y="${ground+53}" text-anchor="middle" font-size="8.5" fill="#879b85">下凹示意</text>`;}
     if(part.gravel)surfaces+=`<path d="M${n(x+w*.23)} ${ground+dip}h${n(w*.54)}" stroke="url(#${prefix}-gravel)" stroke-width="5"/>`;
    }
    surfaces+='</g>';
    if(part){vegetation+=understory(part.plants.filter(p=>!/乔木/.test(p.role)),x+2,ground+dip,Math.max(0,w-4));const topTree=part.plants.find(p=>/乔木/.test(p.role));if(topTree)vegetation+=tree(topTree,mid,ground,panelIndex);}
    dimension+=`<path d="M${n(x)} ${ground+66}v8h${n(w)}v-8" fill="none" stroke="#8d9b85" stroke-width=".7"/><text x="${n(mid)}" y="${ground+93+index%2*13}" text-anchor="middle" font-size="9.5" fill="#65725f">${s.width} m</text><text x="${n(mid)}" y="${ground+25}" text-anchor="middle" font-size="8" fill="#849078">${String(index+1).padStart(2,'0')}</text>`;
   });
   drawings+=`<g data-section-panel="${panelIndex}"${variant.key?` data-part="${variant.key}" data-segment-index="${variant.index}"`:''}><text x="64" y="${y-12}" font-size="11" fill="#77896a">${esc(caption)}</text>${surfaces}${vegetation}${dimension}${variant.key?`<text x="64" y="${y+337}" font-size="9" fill="#939c87">本图对比所选分段的植物；其他部位仍为典型配置。</text>`:''}</g>`;
  });
  const footer=panelTop+panels.length*panelHeight+5;
  let schedule='',legend='';
  items.forEach((s,i)=>{schedule+=`<text x="${94+i%3*344}" y="${footer+30+Math.floor(i/3)*22}" font-size="11"><tspan fill="#95a18b">${String(i+1).padStart(2,'0')}</tspan><tspan dx="12">${esc(s.type==='trees'&&plan.geometry.treeLayout==='isolated'?'独立树池带':s.name||names[s.type])}</tspan><tspan dx="12" fill="#839078">${s.width} m</tspan></text>`;});
  const legendTop=footer+Math.ceil(items.length/3)*22+60;
  plants.forEach((plant,i)=>{const x=94+i%3*344,cy=legendTop+Math.floor(i/3)*30;legend+=`<rect x="${x}" y="${cy-12}" width="17" height="14" rx="3" fill="${color(plant)}" stroke="#8c9e78" stroke-width=".6"/><text x="${x+27}" y="${cy}" font-size="11">${ids.get(plant.name)} · ${esc(plant.name)}<tspan dx="7" font-size="9" fill="#8a9680">${esc(plant.role)}</tspan></text>`;});
  const count=Object.values(plan.strips||{}).reduce((v,p)=>v+(p.pattern?.segments?.length||0),0),notes=legendTop+Math.ceil(plants.length/3)*30+26,height=notes+(count>12?58:38),scaleLength=Math.max(1,Math.min(5,Math.floor(total/5)));
  const patterns=`<pattern id="${prefix}-soil" width="18" height="14" patternUnits="userSpaceOnUse"><rect width="18" height="14" fill="#e9e3d4"/><path d="M0 14L14 0M8 14L18 4" stroke="#d7cfba" stroke-width=".6"/><circle cx="5" cy="5" r=".7" fill="#c2b99f"/></pattern><pattern id="${prefix}-paving" width="26" height="12" patternUnits="userSpaceOnUse"><rect width="26" height="12" fill="#f0ede5"/><path d="M0 0H26M0 11H26M1 0V12M14 0V12" stroke="#cfcaba" stroke-width=".6"/></pattern><pattern id="${prefix}-asphalt" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#d3d7d3"/><circle cx="4" cy="4" r=".6" fill="#afb8aa"/><circle cx="9" cy="8" r=".4" fill="#edf0e8"/></pattern><pattern id="${prefix}-bike" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#e0e6df"/><path d="M0 6H12" stroke="#c4cec1" stroke-width=".6"/></pattern><pattern id="${prefix}-gravel" width="10" height="6" patternUnits="userSpaceOnUse"><rect width="10" height="6" fill="#dedcc9"/><ellipse cx="3" cy="3" rx="2" ry="1.3" fill="#bfc0ad"/><ellipse cx="8" cy="4" rx="1.8" ry="1" fill="#f0eee3"/></pattern>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="plant-drawing landscape-section" viewBox="0 0 1200 ${height}" data-drawing="section" data-section-style="landscape-a" data-total-width="${total}" role="img" aria-label="A风格道路典型断面，总宽${n(total)}米"><title>精细矢量道路断面</title><desc>横向宽度来自已保存方案；树高、冠幅、结构层和下凹深度为示意，不是竖向设计或施工尺寸。</desc><defs>${patterns}${clips.join('')}${[...symbols.values()].map(v=>v.svg).join('')}</defs><rect width="1200" height="${height}" fill="#fbfcf8"/><g font-family="Microsoft YaHei, PingFang SC, sans-serif" fill="#475d40"><text x="64" y="35" font-size="10" letter-spacing="2.4" fill="#8b9d7b">ROADSCAPE / STREET SECTION</text><text x="64" y="66" font-size="22">道路断面 · 精细矢量表现</text><text x="64" y="90" font-size="11" fill="#87947b">道路总宽 ${n(total)} m · 横向按输入宽度 · 竖向形态为示意</text><g transform="translate(${n(right-scaleLength*sx)} 75)"><path d="M0-5V0H${n(scaleLength*sx)}V-5" stroke="#66785b" stroke-width="1" fill="none"/><text y="15" font-size="9" fill="#87947b">0</text><text x="${n(scaleLength*sx)}" y="15" text-anchor="end" font-size="9" fill="#87947b">横向 ${scaleLength} m</text></g>${drawings}<text x="64" y="${footer+5}" font-size="10" letter-spacing="1" fill="#8b9d7b">道路组成 / 左 → 右</text>${schedule}<path d="M64 ${legendTop-23}H1136" stroke="#dbe2d2" stroke-width=".8"/>${legend}<text x="64" y="${notes}" font-size="10" fill="#8c9782">树高、冠幅、结构层和下凹深度均为图示；实际竖向及工程量需依据工程资料核定。</text>${count>12?`<text x="64" y="${notes+20}" font-size="9" fill="#9b8d6e">仅展示前12种分段典型断面；完整内容以分段配置文字为准。</text>`:''}</g></svg>`;
 }
 return {render,variants};
})();
