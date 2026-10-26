import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function renderers(){const scope={window:{},localStorage:{getItem:()=>null,setItem:()=>{}}};vm.runInNewContext(readFileSync(new URL('../web/plan-renderer.js',import.meta.url),'utf8'),scope);scope.RoadscapePlan=scope.window.RoadscapePlan;vm.runInNewContext(readFileSync(new URL('../web/section-renderer.js',import.meta.url),'utf8'),scope);return {plan:scope.window.RoadscapePlan,section:scope.window.RoadscapeSection};}
function source(){return {geometry:{segments:[{type:'walk',width:3},{type:'trees',width:2.5},{type:'road',width:11},{type:'road',width:11},{type:'trees',width:2.5},{type:'walk',width:3}],treeLayout:'isolated',spacing:8,moduleLength:24},strips:{trees:{plants:[{name:'国槐',role:'乔木'},{name:'麦冬',role:'草本'}]}}};}
test('section shares A palette and horizontal widths, stays vector, and leaves source and plan unchanged',()=>{
 const api=renderers(),data=source(),before=JSON.stringify(data),plan=api.plan.render(data),svg=api.section.render(data);
 assert.ok(svg.includes('data-section-style="landscape-a"'));assert.ok(svg.includes('data-total-width="33"'));
 assert.equal((svg.match(/data-section-band=/g)||[]).length,6);assert.equal((svg.match(/data-section-tree="true"/g)||[]).length,2);assert.equal((svg.match(/data-section-pit="true"/g)||[]).length,2);
 for(const plant of data.strips.trees.plants){assert.ok(svg.includes(api.plan.appearance.color(plant)));assert.ok(plan.includes(api.plan.appearance.color(plant)));}
 assert.ok(svg.includes('竖向形态为示意'));assert.ok(svg.includes('<pattern'));assert.ok(svg.includes('<use href="#'));assert.ok(!svg.includes('<image'));assert.ok(!svg.includes('https://'));
 assert.equal(JSON.stringify(data),before);assert.equal(api.plan.render(data),plan);assert.equal(api.section.render(data),svg);
});
test('segment variants keep requested species, a single export root and explicit 12-variant limit',()=>{
 const api=renderers(),data=source();data.strips.trees.plants.push({name:'银杏',role:'乔木'});data.strips.trees.pattern={repeat:true,segments:[{length:12,plants:['国槐','麦冬']},{length:18,plants:['银杏','麦冬']}]};
 const before=JSON.stringify(data),svg=api.section.render(data);assert.equal(api.section.variants(data).length,2);assert.equal((svg.match(/<svg /g)||[]).length,1);assert.equal((svg.match(/data-section-panel=/g)||[]).length,2);assert.equal((svg.match(/data-section-tree="true" data-species="国槐"/g)||[]).length,2);assert.equal((svg.match(/data-section-tree="true" data-species="银杏"/g)||[]).length,2);assert.ok(svg.includes('12 m'));assert.ok(svg.includes('18 m'));assert.equal(JSON.stringify(data),before);
 data.strips.trees.pattern.segments=Array.from({length:15},()=>({length:4,plants:['国槐']}));const many=api.section.render(data);assert.equal((many.match(/data-section-panel=/g)||[]).length,12);assert.ok(many.includes('仅展示前12种'));
});
test('continuous strip has no pits; sponge/gravel and ground-only planting do not invent trees',()=>{
 const api=renderers(),data=source();data.geometry.treeLayout='continuous';assert.equal((api.section.render(data).match(/data-section-pit="true"/g)||[]).length,0);
 data.strips.trees={sponge:true,gravel:true,plants:[{name:'金森女贞',role:'灌木'},{name:'鸢尾',role:'草本'}]};const svg=api.section.render(data);assert.equal((svg.match(/data-section-tree="true"/g)||[]).length,0);assert.ok(svg.includes('下凹示意'));assert.ok(svg.includes('data-section-understory="true"'));
});
test('labels and attributes are escaped and invalid geometry falls back safely',()=>{
 const api=renderers(),data=source();data.strips.trees.plants[0].name='树"><script>alert(1)</script>';data.geometry.segments[0].name='<unsafe>';
 const svg=api.section.render(data);assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(svg.includes('&lt;unsafe&gt;'));
 data.geometry.segments[0].width=-1;assert.equal(api.section.render(data),'');
});
