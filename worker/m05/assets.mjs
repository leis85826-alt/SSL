import { ContractError, validate, id } from '../../shared/m05/schema.mjs';
export const MAX_FILE_BYTES=25*1024*1024;
export const descriptor=row=>({asset_id:row.asset_id,storage_key:row.storage_key,sha256:row.sha256,media_type:row.media_type,size_bytes:row.size_bytes});
const reject=(message,status=422,code='INVALID_ASSET')=>{throw new ContractError(message,status,code);};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export class AssetService {
  constructor(repository,bucket){this.repo=repository;this.bucket=bucket;}
  ready(){if(!this.bucket)reject('文件存储尚未配置',503,'NOT_CONFIGURED');}
  async list(projectId,actor){this.ready();await this.repo.access(projectId,actor);const rows=await this.repo.statement('SELECT * FROM m05_asset_objects WHERE project_id = ? ORDER BY created_at, asset_id',projectId).all();return rows.results;}
  async get(projectId,assetId,actor){this.ready();await this.repo.access(projectId,actor);validate(id,assetId);const row=await this.repo.statement('SELECT * FROM m05_asset_objects WHERE project_id = ? AND asset_id = ?',projectId,assetId).first();if(!row)reject('附件不存在',404,'NOT_FOUND');const object=await this.bucket.get(row.storage_key);if(!object)reject('附件原件缺失，请检查文件存储',502,'ASSET_MISSING');return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(row.file_name),'Content-Length':String(row.size_bytes),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','X-File-Sha256':row.sha256}});}
  async put(projectId,assetId,actor,request){
    this.ready();await this.repo.access(projectId,actor,true);validate(id,assetId);
    let name;try{name=decodeURIComponent(request.headers.get('X-File-Name')||'attachment');}catch{reject('附件名称编码无效');}
    if(!name.trim()||name.length>240||/[\u0000-\u001f\u007f/\\]/.test(name))reject('附件名称无效');
    const type=(request.headers.get('Content-Type')||'application/octet-stream').split(';')[0].trim().toLowerCase();
    if(!/^(image\/[a-z0-9.+-]+|application\/(pdf|octet-stream|json|zip|x-zip-compressed|dxf|dwg|acad|x-dxf|x-autocad|vnd\.[a-z0-9.+-]+|msword)|text\/(plain|markdown|csv))$/.test(type))reject('附件类型不支持');
    const purpose=request.headers.get('X-Asset-Purpose')||'FILE';if(!['FILE','WORKBENCH_MANIFEST'].includes(purpose))reject('附件用途无效');
    const limit=purpose==='WORKBENCH_MANIFEST'?2*1024*1024:MAX_FILE_BYTES;
    if(Number(request.headers.get('Content-Length'))>limit)reject('附件超出大小限制',413);
    if(!request.body)reject('附件内容为空');const reader=request.body.getReader(),chunks=[];let length=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();reject('附件超出大小限制',413);}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    const sha=await digest(bytes);if(request.headers.get('X-File-Sha256')!==sha)reject('附件SHA256校验失败');
    if(purpose==='WORKBENCH_MANIFEST'){
      let manifest;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{reject('工作台清单格式无效');}
      if(type!=='application/json'||manifest?.format!=='roadscape-cloud-workbench-v1')reject('工作台清单格式无效');
    }
    const previous=await this.repo.statement('SELECT * FROM m05_asset_objects WHERE project_id = ? AND asset_id = ?',projectId,assetId).first();
    if(previous){if(previous.sha256===sha&&previous.file_name===name&&previous.media_type===type&&previous.purpose===purpose)return previous;reject('同ID附件内容不同，未覆盖',409,'ASSET_CONFLICT');}
    const storageKey='m05/'+projectId+'/'+assetId+'/'+sha;
    const written=await this.bucket.put(storageKey,bytes,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:sha,project_id:projectId,asset_id:assetId},httpMetadata:{contentType:type}});
    if(!written){const head=await this.bucket.head(storageKey);if(!head||head.size!==length||head.customMetadata?.sha256!==sha)reject('文件存储校验失败',502);}
    const row={project_id:projectId,asset_id:assetId,storage_key:storageKey,sha256:sha,size_bytes:length,media_type:type,file_name:name,purpose,created_by:actor,created_at:new Date().toISOString()};
    try{await this.repo.statement('INSERT INTO m05_asset_objects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',...Object.values(row)).run();}
    catch(error){if(/UNIQUE constraint failed/.test(error.message)){const found=await this.repo.statement('SELECT * FROM m05_asset_objects WHERE project_id = ? AND asset_id = ?',projectId,assetId).first();if(found?.sha256===sha&&found.file_name===name&&found.media_type===type&&found.purpose===purpose)return found;reject('附件已被其他请求保存',409,'ASSET_CONFLICT');}throw error;}
    // If metadata insertion fails, keep the unreferenced object; deleting here could race a successful writer.
    return row;
  }
  async validateReferences(projectId,actor,assets){
    this.ready();await this.repo.access(projectId,actor,true);
    for(const asset of assets){const row=await this.repo.statement('SELECT * FROM m05_asset_objects WHERE project_id = ? AND asset_id = ?',projectId,asset.asset_id).first();if(!row||Object.entries(descriptor(row)).some(([k,v])=>asset[k]!==v))reject('附件引用未上传或不属于当前项目');const object=await this.bucket.head(row.storage_key);if(!object||object.size!==row.size_bytes||object.customMetadata?.sha256!==row.sha256)reject('附件原件缺失，未保存新版本',422,'ASSET_MISSING');}
  }
}
