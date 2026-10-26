import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export class LocalD1 {
  constructor(path=':memory:') {
    this.raw=new DatabaseSync(path);this.raw.exec('PRAGMA foreign_keys = ON');
    for(const file of ['0001_s1.sql','0002_cloud_files.sql'])this.raw.exec(readFileSync(new URL('../../migrations/m05/'+file,import.meta.url),'utf8'));
    this.failAt=-1;
  }
  prepare(sql){return {bind:(...args)=>({sql,args,first:async()=>this.raw.prepare(sql).get(...args)||null,all:async()=>({results:this.raw.prepare(sql).all(...args)}),run:async()=>this.raw.prepare(sql).run(...args)})};}
  async batch(items){this.raw.exec('BEGIN IMMEDIATE');try{for(let i=0;i<items.length;i++){if(i===this.failAt)throw Error('injected disk error');const x=items[i];this.raw.prepare(x.sql).run(...x.args);}this.raw.exec('COMMIT');}catch(e){this.raw.exec('ROLLBACK');throw e;}}
}
export class MemoryR2 {
  constructor(){this.objects=new Map();this.puts=0;}
  async put(key,bytes,options){this.puts++;if(this.objects.has(key)&&options.onlyIf?.etagDoesNotMatch==='*')return null;this.objects.set(key,{bytes:new Uint8Array(bytes),customMetadata:options.customMetadata});return {key};}
  async head(key){const value=this.objects.get(key);return value?{key,size:value.bytes.length,customMetadata:value.customMetadata}:null;}
  async get(key){const value=this.objects.get(key);return value?{key,body:new Blob([value.bytes]).stream()}:null;}
}
