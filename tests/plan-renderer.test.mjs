import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function renderer(){const saved=new Map(),scope={window:{},localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)}};vm.runInNewContext(readFileSync(new URL('../web/plan-renderer.js',import.meta.url),'utf8'),scope);return {api:scope.window.RoadscapePlan,saved};}
function plan(){return {title:'测试道路',geometry:{segments:[{type:'walk',width:3},{type:'trees',width:2.5},{type:'road',width:11},{type:'road',width:11},{type:'trees',width:2.5},{type:'walk',width:3}],spacing:8,treeLayout:'isolated',moduleLength:24},strips:{trees:{plants:[{name:'国槐',role:'乔木'},{name:'麦冬',role:'草本'}]}}};}
test('A plan keeps widths and station positions, uses vector detail and never changes the source',()=>{
 const {api}=renderer(),source=plan(),before=JSON.stringify(source),drawing=api.render(source),frame=api.layout(source);
 assert.equal(frame.total,33);assert.equal(frame.length,24);assert.equal(frame.sx,frame.sy);
 assert.deepEqual(Array.from(api.stations(source,24)),[4,12,20]);
 assert.equal((drawing.match(/data-plan-tree="true"/g)||[]).length,6);assert.equal((drawing.match(/data-tree-pit="true"/g)||[]).length,6);
 for(const width of [3,2.5,11])assert.ok(drawing.includes('data-width-m="'+width+'"'));
 assert.ok(drawing.includes('<pattern'));assert.ok(drawing.includes('<use href="#'));assert.ok(!drawing.includes('<image'));assert.ok(!drawing.includes('https://'));
 assert.equal(JSON.stringify(source),before);assert.equal(api.render(source),drawing);
});
test('continuous bands have no invented tree pits; nonrepeat segments do not fill an unspecified tail',()=>{
 const {api}=renderer(),source=plan();source.geometry.treeLayout='continuous';assert.equal((api.render(source).match(/data-tree-pit="true"/g)||[]).length,0);
 source.strips.trees.plants.push({name:'银杏',role:'乔木'});source.strips.trees.pattern={repeat:false,segments:[{length:6,plants:['国槐']},{length:6,plants:['银杏']}]};source.strips.side={plants:[{name:'麦冬',role:'草本'}]};
 const chunks=api.intervals(source.strips.trees,24);assert.equal(chunks.length,3);assert.equal(chunks[2].unspecified,true);
 const drawing=api.render(source);assert.ok(drawing.includes('余段未指定'));assert.equal((drawing.match(/data-plan-tree="true"/g)||[]).length,2);
 source.strips.trees.pattern.repeat=true;assert.equal(api.intervals(source.strips.trees,24).length,4);assert.equal((api.render(source).match(/data-plan-tree="true"/g)||[]).length,6);
});
test('nonrepeat and repeated pattern lengths, long display limits and geometry guards stay explicit',()=>{
 const {api}=renderer(),source=plan();source.strips.trees.pattern={repeat:true,segments:[{length:1200,plants:['国槐']}]};
 const frame=api.layout(source);assert.equal(frame.length,1000);assert.ok(frame.distorted);assert.ok(api.render(source).includes('截取前1000 m'));
 const dense={plants:[],pattern:{repeat:true,segments:[{length:.001,plants:[]}]}};assert.ok(api.intervals(dense,24).some(c=>c.unspecified));
 source.geometry.segments[0].width=-1;assert.equal(api.layout(source),null);assert.equal(api.render(source),'');
});
test('text and species attributes are escaped; style changes are independent from business storage',()=>{
 const {api,saved}=renderer(),source=plan();source.strips.trees.plants[0].name='国槐"><script>alert(1)</script>';source.geometry.segments[0].name='<unsafe>';
 const svg=api.render(source);assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(svg.includes('&lt;unsafe&gt;'));
 api.setView('simple');assert.equal(api.view(),'simple');assert.equal(saved.size,1);assert.equal(saved.get('roadscape-plan-view-v1'),'simple');assert.equal(saved.has('roadscape-workspace-v1'),false);
 api.setView('unknown');assert.equal(api.view(),'simple');
});
