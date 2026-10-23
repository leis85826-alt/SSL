'use strict';
window.RoadscapePlants=(()=>{
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={trees:'行道树',side:'侧分带',median:'中分带'};
 const refs={
  zhejiang:{title:'浙江省海绵城市规划设计导则',url:'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3162/site/attach/-1/1904041808195524740.pdf'},
  hangzhou:{title:'杭州道路项目植物配置案例',url:'https://epb.hangzhou.gov.cn/module/download/downfile.jsp?classid=0&filename=cda8013f90d240adaa426ad51e673c25.pdf'},
  beijing:{title:'北京市园林绿化局：行道树选择',url:'https://yllhj.beijing.gov.cn/zwgk/tajydf/202110/t20211014_2512486.shtml'},
  beijingGround:{title:'北京园林绿化植物应用参考',url:'https://yllhj.beijing.gov.cn/sdlh/ylkj/bzgf/201911/P020220208599531377556.pdf'},
  guangzhou:{title:'广州市绿地系统规划（2021—2035）',url:'https://www.gz.gov.cn/zwgk/fggw/sfbgtwj/content/mpost_9224696.html'},
  guangzhouGround:{title:'广州道路项目植物应用参考',url:'https://sthjj.gz.gov.cn/attachment/7/7330/7330659/9012102.pdf'},
  sponge:{title:'海绵绿地设施与雨水路径参考',url:'https://www.beijing.gov.cn/zhengce/gfxwj/201905/t20190522_60725.html'}
 };
 const catalogs={
  '江南参考（浙江）':{tree:'香樟',seasonTree:'无患子',alternate:'榉树',shrub:'金森女贞',color:'红叶石楠',ground:'麦冬',flower:'鸢尾',wet:'千屈菜',slope:'鸢尾',sources:['hangzhou','zhejiang']},
  '华北参考（北京）':{tree:'国槐',seasonTree:'栾树',alternate:'白蜡',shrub:'冬青卫矛',color:'连翘',ground:'马蔺',flower:'萱草',wet:'千屈菜',slope:'马蔺',sources:['beijing','beijingGround']},
  '华南参考（广州）':{tree:'秋枫',seasonTree:'宫粉紫荆',alternate:'香樟',shrub:'福建茶',color:'龙船花',ground:'银边草',flower:'美人蕉',wet:'千屈菜',slope:'美人蕉',sources:['guangzhou','guangzhouGround']}
 };
 function region(p){if(catalogs[p.plantRegion])return p.plantRegion;const city=String(p.city||'');if(/杭州|宁波|绍兴|嘉兴|湖州|金华|衢州|台州|丽水|温州|舟山|浙江|苏州|南京|上海/.test(city))return '江南参考（浙江）';if(/北京|天津|石家庄|济南|华北/.test(city))return '华北参考（北京）';if(/广州|深圳|佛山|东莞|珠海|中山|广东/.test(city))return '华南参考（广州）';return null;}
 function row(name,role,position,form,alternative='',note=''){return {name,role,position,form,alternative,note};}
 function enrich(p,plan){
  const matched=region(p),c=catalogs[matched],low=p.maintenance==='低'||p.lowFlowers;
  const sponge=p.sponge||'待定',targets=p.spongeTargets||['side'],kind=p.spongeType||'雨水花园';
  plan.engineVersion='plants-sponge-v2';plan.plantRegion=matched;plan.sources=[];
  plan.checks[0]='植物品种是区域参考库形成的方案初选；现场土壤、日照、苗源、地下设施及地方要求仍需校核。';
  if(!c)plan.checks.unshift(`当前城市「${p.city}」尚未匹配植物参考库。请在左侧选择适用的区域参考；不自动套用异地品种。`);
  else {plan.sources=c.sources.map(k=>refs[k]);plan.summary+=` 植物初选采用「${matched}」参考库；区域外项目需要单独验证适用性。`;}
  for(const [key,part] of Object.entries(plan.strips)){
   const w=Number(p[key==='trees'?'treeWidth':key+'Width']),narrow=w<1.5;
   part.plants=[];part.plantingForm='';part.sponge=false;
   if(c){
    if(key==='trees'){
     const tree=p.goal==='四季景观'?c.seasonTree:c.tree;
     part.plants=[row(tree,'骨干乔木','人行道行道树带',`单排等距树列；沿线概念株距 ${p.spacing} m，出入口和保留树处调整`,p.goal==='四季景观'?c.tree:c.seasonTree,'株距由输入值形成，需按成年树冠与根系空间校核'),row(c.ground,'林下地被','树池或连续树带','连续带状密植，树干基部留出养护空间','', '冠幅与土壤条件确定后再落实种植密度')];
     part.plantingForm=w<1.5?'单排树列作为设计意向；先核实根系空间，可局部扩大树池，暂不直接确定实施点位。':`采用 ${tree} 单排等距树列，株距暂按 ${p.spacing} m；树池连通为连续绿带，林下用 ${c.ground} 连续覆盖。`;
    }else if(narrow){
     part.plants=[row(c.ground,'低矮地被',`${labels[key]}全幅`,'连续条带式密植，形成单一基底',c.flower,'路口段保持低矮通透，避免叠加高层植物')];
     part.plantingForm=`${w} m 窄带以 ${c.ground} 全幅连续条带种植；保持少品种、单层次，节点变化另行布置。`;
    }else{
     part.plants=[row(c.shrub,'低灌木',key==='median'?'中分带中部连续条带':'侧分带中部条带','连续绿篱或成片密植；同段保持统一修剪界面',c.color,'路口和端头按视线要求降低植物高度'),row(c.ground,'地被',`${labels[key]}边缘`,'沿两侧连续带状种植，衔接灌木基底',c.flower)];
     if(!low&&w>=3)part.plants.push(row(c.flower,'季相草本','非视距控制的局部节点','自然片植，成片重复，避免零星点缀',c.ground,'养护低投入时可减少这一层'));
     part.plantingForm=key==='median'?`中部以 ${c.shrub} 形成连续低灌木条带，两侧用 ${c.ground} 收边；端头转为低矮地被，保持视线通透。`:`以 ${c.shrub} 成片或带状重复种植，外围用 ${c.ground} 连续衔接；${!low&&w>=3?`${c.flower} 在局部节点成片出现。`:'减少零碎花卉，保持统一基底。'}`;
    }
   }else part.plantingForm=key==='trees'?`单排等距树列，概念株距 ${p.spacing} m；具体品种待匹配参考库。`:narrow?'单层地被连续条带种植；具体品种待匹配参考库。':'低灌木连续条带＋两侧地被收边；具体品种待匹配参考库。';
   if(sponge==='考虑'&&targets.includes(key)&&key!=='trees'){
    part.sponge=true;part.spongeType=kind;
    if(narrow){part.plants=[];part.plantingForm=`${w} m 带宽较窄，暂不直接套用${kind}植物配置；先核实断面、有效设施宽度与维护空间，再确定种植形式。`;part.palette=[];part.layers='海绵设施可行性待确认';part.title='海绵可行性 · 先核实断面';}
    else {
     if(c)part.plants=[row(c.ground,'高区地被','不直接积水的边缘高区','沿上缘连续条带种植，不布置于低点积水区',c.slope),row(c.slope,'过渡区草本','设施坡面或过渡区','顺坡成片种植，避开进水和溢流口','', '实际淹水时长决定位置，不能由名称认定耐淹性'),row(c.wet,'低区候选草本','季节性短时积水的低区','自然片植，按汇水路径留出进水与溢流空间','', '需按本地越冬、淹水时长和养护条件验证')];
     part.plantingForm=`采用「高区—过渡区—低区」分区片植；${c?`边缘高区用 ${c.ground}，坡面候选 ${c.slope}，短时积水低区候选 ${c.wet}。`:'具体品种待匹配参考库。'}进水口和溢流口周围留出检修空间。`;
     part.layers='高区地被＋过渡区草本＋低区草本';part.title=`${kind} · 分区片植`;
    }
    part.approach+=` 将${labels[key]}作为${kind}的候选位置，先协调道路径流入口、预处理和溢流排放。`;
    part.notes.push('入口沉积与垃圾需要预处理和清理通道；不能只凭植物配置确定海绵功能。');
    part.reference.forEach(r=>r.adapt+=' 海绵模式只借鉴景观组织，普通植物不直接套用于积水区。');
   }
   part.specs=part.specs.map(([label,value])=>label==='配置层次'?[label,part.layers]:label==='组织方式'&&part.sponge?[label,narrow?'先核实设施可行性':'高区、过渡区、低区分区片植']:[label,value]);
   part.palette=part.plants.length?part.plants.map(x=>x.name):['品种待匹配 / 设施条件待核实'];
   part.specs.push(['种植形式',part.sponge?'按高区、坡面、低区分区':key==='trees'?'单排树列＋连续地被':narrow?'单层条带式':'连续条带＋成片种植']);
  }
  const active=targets.filter(k=>plan.strips[k]&&k!=='trees');
  plan.sponge={status:sponge,type:kind,targets:active.map(k=>labels[k]),soil:p.soil||'未知',drainage:p.drainage||'未知',steps:sponge==='考虑'?['道路径流','进水与预处理','绿地滞留 / 过滤','溢流排入雨水系统']:[],notes:sponge==='考虑'?'当前为设施与植物配置意向；下凹深度、调蓄容积和达标情况需结合竖向、汇水面积、降雨及渗透条件计算。':sponge==='待定'?'先核实项目海绵要求、道路汇水方向与场地排水条件，再决定是否设置设施。':'本方案按常规绿化组织，不加入海绵设施植物分区。'};
  if(sponge==='考虑'){
   plan.summary+=` ${active.length?active.map(k=>labels[k]).join('、'):'尚未选定有效部位'}考虑设置${kind}，以分区种植衔接雨水路径。`;
   plan.sources.push(refs.sponge);if(c)plan.sources.push(refs.zhejiang);
   plan.checks.push(`海绵条件：土壤渗透「${plan.sponge.soil}」，溢流排放「${plan.sponge.drainage}」；需核实地下水、污染土壤、管线、竖向与汇水面积。`);
   plan.checks.push('下凹深度、溢流标高、调蓄容积和降雨控制指标待专项计算，不由本规则模板判定。');
   if(!active.length)plan.checks.unshift('已选择考虑海绵设施，但没有启用对应侧分带或中分带，请检查设计范围与海绵部位。');
  }
  plan.sources=[...new Map(plan.sources.map(x=>[x.url,x])).values()];
  return plan;
 }
 function table(plan,key){const parts=Object.entries(plan.strips).filter(([k])=>!key||key===k);const rows=parts.flatMap(([k,p])=>(p.plants||[]).map(x=>`<tr><td>${labels[k]}<small>${safe(x.role)}</small></td><td><strong>${safe(x.name)}</strong>${x.alternative?`<small>备选：${safe(x.alternative)}</small>`:''}</td><td>${safe(x.position)}</td><td>${safe(x.form)}${x.note?`<small>${safe(x.note)}</small>`:''}</td></tr>`));return rows.length?`<div class="plant-table-wrap"><table class="plant-table species-table"><thead><tr><th>部位 / 层次</th><th>主选植物</th><th>种植位置</th><th>种植形式</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'<div class="reference-note">尚未形成具体植物清单。请匹配区域参考库；海绵窄带需要先确认设施可行性。</div>';}
 function sources(plan){return plan.sources?.length?`<details class="plant-sources"><summary>植物参考依据与适用范围</summary><p>以下资料用于植物初选与设施思路参考；本页面的组合和布置由规则模板形成，不代表原文给出了当前项目的设计结论。</p>${plan.sources.map(x=>`<a href="${safe(x.url)}" target="_blank" rel="noopener">${safe(x.title)} ↗</a>`).join('')}</details>`:'';}
 function spongeCard(plan){if(!plan.sponge)return '';const s=plan.sponge;return `<section class="sponge-card"><div class="sponge-heading"><h3>海绵设施 <small>${safe(s.status)}</small></h3>${s.status==='考虑'?`<span>${safe(s.type)} · ${safe(s.targets.join(' / ')||'部位待选')}</span>`:''}</div>${s.steps.length?`<div class="water-flow">${s.steps.map(x=>`<span>${safe(x)}</span>`).join('<i>→</i>')}</div>`:''}<p>${safe(s.notes)}</p>${s.status==='考虑'?`<small>土壤渗透：${safe(s.soil)}　｜　溢流排放：${safe(s.drainage)}</small>`:''}</section>`;}
 function markdown(plan){return `\n\n## 具体植物与种植形式\n\n区域参考：${plan.plantRegion||'未匹配'}\n\n${Object.entries(plan.strips).map(([k,p])=>`### ${labels[k]}\n\n${p.plantingForm||'旧版本未记录具体形式'}\n\n${(p.plants||[]).map(x=>`- ${x.name}（${x.role}）：${x.position}；${x.form}${x.alternative?`；备选 ${x.alternative}`:''}${x.note?`；${x.note}`:''}`).join('\n')||'暂无具体品种，需重新生成或核实设施条件。'}`).join('\n\n')}\n\n## 海绵设施\n\n${plan.sponge?`是否考虑：${plan.sponge.status}\n\n设施：${plan.sponge.status==='考虑'?plan.sponge.type:'未确定 / 未启用'}\n\n候选部位：${plan.sponge.targets.join('、')||'未选定'}\n\n${plan.sponge.steps.join(' → ')}\n\n${plan.sponge.notes}\n\n土壤渗透：${plan.sponge.soil}；溢流排放：${plan.sponge.drainage}`:'旧版本未记录海绵选项。'}\n\n## 植物参考依据\n\n${(plan.sources||[]).map(s=>`- [${s.title}](${s.url})`).join('\n')}\n`;}
 return {enrich,table,sources,spongeCard,markdown,region};
})();
