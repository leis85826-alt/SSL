import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const scope={window:{},document:{addEventListener(){}}};vm.runInNewContext(readFileSync(new URL('../web/quantity-estimate.js',import.meta.url),'utf8'),scope);const api=scope.window.RoadscapeQuantity;
const source=()=>({standardLength:100,totalLength:250,rows:[{id:'a',name:'香樟',quantity:3,unit:'株',repeat:true,adjustment:-1,price:100},{id:'b',name:'地被',quantity:12.25,unit:'㎡',repeat:true,adjustment:0,price:null},{id:'c',name:'节点',quantity:2,unit:'项',repeat:false,adjustment:0,price:0}]});
test('scales each detailed row, rounds discrete counts, separates missing prices and zero, never mutates source',()=>{const q=source(),before=JSON.stringify(q),r=api.calculate(q);assert.equal(r[0].quantity,7);assert.equal(r[0].amount,700);assert.equal(r[1].quantity,30.63);assert.equal(r[1].amount,null);assert.equal(r[2].quantity,2);assert.equal(r[2].amount,0);assert.equal(JSON.stringify(q),before);});
test('requires length, named rows and quantities and rejects negative adjusted quantities',()=>{for(const change of [q=>q.totalLength=0,q=>q.rows=[],q=>q.rows[0].quantity=null,q=>q.rows[0].name='',q=>q.rows[0].adjustment=-100]){const q=source();change(q);assert.throws(()=>api.calculate(q));}});
test('CSV supports quoted comma, newline and escaped quotes without silent malformed quote handling',()=>{const r=api.parseCSV('名称,规格\r\n"树,种","高\n度"\r\n"树""形",2');assert.equal(r[1][0],'树,种');assert.equal(r[1][1],'高\n度');assert.equal(r[2][0],'树"形');assert.throws(()=>api.parseCSV('"未闭合'));});
