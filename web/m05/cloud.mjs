import { validateWorkspaceData } from './workspace-backup.mjs';
import { checksumSnapshot } from './contracts/snapshot-codec.mjs';
const MAX_TOTAL=100*1024*1024, MAX_FILE=25*1024*1024;
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function cloudAPI(path,{method='GET',body,headers={},binary=false}={}){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),60000);
  try{
    const response=await fetch('/api/v1'+path,{method,credentials:'same-origin',redirect:'error',headers:{...(body&&!(body instanceof Blob)&&!(body instanceof Uint8Array)?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:body instanceof Blob||body instanceof Uint8Array?body:JSON.stringify(body)}:{}),signal:abort.signal});
    if(!response.ok){let data;try{data=await response.json();}catch{}const error=Error(data?.error?.message||'云端请求失败，请先登录并检查配置。');error.status=response.status;error.code=data?.error?.code;throw error;}
    if(binary){const reader=response.body.getReader(),chunks=[];let length=0;try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_FILE)throw Error('附件响应超出限制。');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
    const data=await response.json();if(!data.success)throw Error('云端响应格式无效。');return data.data;
  }catch(error){if(error.name==='AbortError')throw Error('云端请求超时，本机数据保留。请核对云端版本后再操作。');if(error instanceof TypeError||error instanceof SyntaxError)throw Error('云端连接未返回有效数据，请先登录云端或检查管理员配置。');throw error;}finally{clearTimeout(timer);}
}
export const currentAccount=()=>cloudAPI('/me');
export const listCloudProjects=()=>cloudAPI('/projects');
export function collectFileReferences(value,result=new Set()){
  if(!value||typeof value!=='object')return result;
  for(const [key,v]of Object.entries(value)){
    if(['__proto__','constructor','prototype'].includes(key))throw Error('数据包含不支持的字段。');
    if(['fileId','coverId'].includes(key)&&typeof v==='string')result.add(v);
    if(key==='files'&&Array.isArray(v))for(const file of v)if(typeof file?.id==='string')result.add(file.id);
    collectFileReferences(v,result);
  }return result;
}
function subset(project,workspace){
  const cases=new Set(project.references||[]),norms=new Set(project.normIds||[]);
  for(const version of project.versions||[]){for(const id of version.inputs?.references||[])cases.add(id);for(const id of version.inputs?.normIds||[])norms.add(id);}
  const missing=[...cases].some(id=>!workspace.cases.some(c=>c.id===id))||[...norms].some(id=>!(workspace.norms||[]).some(n=>n.id===id));
  if(missing)throw Error('项目引用的案例或规范缺失，请先检查工作台备份。');
  return {projects:[structuredClone(project)],cases:workspace.cases.filter(c=>cases.has(c.id)),norms:(workspace.norms||[]).filter(n=>norms.has(n.id)),active:project.id};
}
export async function uploadProject({project,workspace,archive,records,link,signatureState,onLink,onProgress=()=>{}}){
  const account=await currentAccount();if(!account.files_ready)throw Error('云端附件存储未配置。');
  // Freeze a single source snapshot; edits made while uploading remain local.
  const engineering=structuredClone(archive),selected=subset(structuredClone(project),structuredClone(workspace));
  validateWorkspaceData(selected);
  const wanted=collectFileReferences(selected);
  for(const revision of engineering.revisions)for(const asset of revision.snapshot.assets)wanted.add(asset.asset_id);
  const available=new Map(records.map(r=>[r.id,r.file])),files=[];let total=0;
  for(const sourceId of wanted){const file=available.get(sourceId);if(!(file instanceof Blob))throw Error('存在缺失附件或工程资源原件，未开始上传。');if(file.size>MAX_FILE)throw Error('单个附件不得超过25MB。');total+=file.size;if(total>MAX_TOTAL||wanted.size>100)throw Error('首版云端同步单项目限制100个文件、合计100MB。');const sha=await hash(await file.arrayBuffer());files.push({source_id:sourceId,asset_id:'file_'+(await hash(new TextEncoder().encode(sourceId+'\n'+sha))).slice(0,48),name:file.name||'attachment',type:file.type||'application/octet-stream',original_type:file.type,lastModified:file.lastModified||0,size:file.size,sha256:sha,file});}
  const bySource=new Map(files.map(f=>[f.source_id,f]));
  for(const revision of engineering.revisions)for(const asset of revision.snapshot.assets){const file=bySource.get(asset.asset_id);if(!file||file.sha256!==asset.sha256||file.size!==asset.size_bytes||(file.original_type&&file.original_type!==asset.media_type))throw Error('工程历史中的资源与本机原件不一致，未开始上传。');if(!file.original_type)file.type=asset.media_type;}
  const manifest={format:'roadscape-cloud-workbench-v1',workspace:selected,signature_state:signatureState,engineering_archive:engineering,files:files.map(({file,...row})=>row)};
  const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest));if(manifestBytes.length>2*1024*1024)throw Error('版本清单超过2MB，请先导出本机备份并减少同步范围。');
  let state=link&&link.account_id===account.account_id?{...link}:null;
  const source=engineering.revisions.at(-1).snapshot;
  if(!state){state={account_id:account.account_id,cloud_project_id:crypto.randomUUID(),base_revision_id:null};await onLink(state);}
  let remote;
  try{remote=await cloudAPI('/projects/'+state.cloud_project_id);}catch(error){if(error.status!==404)throw error;}
  if(!remote){
    const initial=structuredClone(source);initial.assets=[];
    onProgress('正在建立云端工程副本…');
    remote=await cloudAPI('/projects',{method:'POST',body:{project_id:state.cloud_project_id,snapshot:initial,change_summary:'建立云端同步工程'}});
    state.base_revision_id=remote.revision.revision_id;await onLink(state);
  }else if(!state.base_revision_id){
    if(remote.revision.revision_number!==1||remote.snapshot.assets.length!==0)throw Error('云端工程状态不一致，请先下载云端副本核对。');
    state.base_revision_id=remote.revision.revision_id;await onLink(state);
  }else if(remote.revision.revision_id!==state.base_revision_id){
    const error=Error('云端已有其他设备的新版本，未覆盖；请先下载云端副本核对。');error.status=409;throw error;
  }
  const descriptors=[];
  for(let i=0;i<files.length;i++){
    const row=files[i];onProgress('正在上传附件 '+(i+1)+' / '+files.length+'：'+row.name);
    const data=await cloudAPI('/projects/'+state.cloud_project_id+'/assets/'+row.asset_id,{method:'PUT',body:row.file,headers:{'Content-Type':row.type,'X-File-Name':encodeURIComponent(row.name),'X-File-Sha256':row.sha256}});
    descriptors.push({asset_id:data.asset_id,storage_key:data.storage_key,sha256:data.sha256,media_type:data.media_type,size_bytes:data.size_bytes});
  }
  const manifestId='manifest_'+crypto.randomUUID(),manifestHash=await hash(manifestBytes);
  const meta=await cloudAPI('/projects/'+state.cloud_project_id+'/assets/'+manifestId,{method:'PUT',body:manifestBytes,headers:{'Content-Type':'application/json','X-File-Name':'roadscape-workbench.json','X-File-Sha256':manifestHash,'X-Asset-Purpose':'WORKBENCH_MANIFEST'}});
  descriptors.push({asset_id:meta.asset_id,storage_key:meta.storage_key,sha256:meta.sha256,media_type:meta.media_type,size_bytes:meta.size_bytes});
  const snapshot=structuredClone(source);snapshot.assets=descriptors;
  onProgress('正在保存云端版本并核对文件引用…');
  const saved=await cloudAPI('/projects/'+state.cloud_project_id+'/snapshots',{method:'POST',body:{base_revision_id:state.base_revision_id,snapshot,change_summary:'同步工作台、工程历史及附件'}});
  state.base_revision_id=saved.revision.revision_id;state.synced_at=new Date().toISOString();await onLink(state);
  return {project:saved.project,revision:saved.revision,account_id:account.account_id};
}
const asDataURL=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
export async function downloadProject(projectId,onProgress=()=>{}){
  const remote=await cloudAPI('/projects/'+encodeURIComponent(projectId));
  const all=await cloudAPI('/projects/'+encodeURIComponent(projectId)+'/assets');
  const references=new Set(remote.snapshot.assets.map(a=>a.asset_id));
  const manifests=all.assets.filter(a=>references.has(a.asset_id)&&a.purpose==='WORKBENCH_MANIFEST');
  if(manifests.length!==1)throw Error('该云端工程尚未完成工作台上传，请在原设备继续上传。');
  const raw=await cloudAPI('/projects/'+projectId+'/assets/'+manifests[0].asset_id,{binary:true});
  if(await hash(raw)!==manifests[0].sha256)throw Error('云端清单校验失败。');
  const manifest=JSON.parse(new TextDecoder().decode(raw));
  if(manifest?.format!=='roadscape-cloud-workbench-v1'||!Array.isArray(manifest.workspace?.projects)||manifest.workspace.projects.length!==1||!Array.isArray(manifest.files)||manifest.files.length>100)throw Error('云端工作台清单格式不正确。');
  const archive=manifest.engineering_archive;if(archive?.format!=='roadscape-m05-project-v1'||!Array.isArray(archive.revisions)||!archive.revisions.length||archive.revisions.length>1000)throw Error('工程版本清单无效。');
  let parent=null;const seen=new Set();for(let i=0;i<archive.revisions.length;i++){const row=archive.revisions[i];if(seen.has(row.revision_id)||row.project_id!==archive.project_id||row.parent_revision_id!==parent||row.revision_number!==i+1||await checksumSnapshot(row.snapshot)!==row.checksum)throw Error('工程历史校验失败。');seen.add(row.revision_id);parent=row.revision_id;}if(parent!==archive.current_revision_id)throw Error('工程版本指针无效。');
  const metadata=new Map(all.assets.map(a=>[a.asset_id,a])),files=[],ids=new Map(),sourceIds=new Set();let total=0;
  for(const revision of archive.revisions)for(const asset of revision.snapshot.assets){const f=manifest.files.find(f=>f.source_id===asset.asset_id);if(!f||f.sha256!==asset.sha256||f.size!==asset.size_bytes||f.type!==asset.media_type)throw Error('工程资源与清单原件不一致。');}
  const reserve=value=>{if(typeof value==='string'&&!ids.has(value))ids.set(value,crypto.randomUUID());};
  function scan(value){if(!value||typeof value!=='object')return;for(const [k,v]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(k))throw Error('清单包含不支持字段。');if(k==='id')reserve(v);scan(v);}}
  scan(manifest.workspace);
  for(let i=0;i<manifest.files.length;i++){
    const f=manifest.files[i],stored=metadata.get(f.asset_id);if(typeof f.source_id!=='string'||!f.source_id||sourceIds.has(f.source_id)||!stored||stored.file_name!==f.name||stored.media_type!==f.type||typeof f.original_type!=='string'||(f.original_type&&f.original_type!==f.type)||!references.has(f.asset_id)||stored.sha256!==f.sha256||stored.size_bytes!==f.size||!Number.isSafeInteger(f.size)||f.size<0||f.size>MAX_FILE)throw Error('云端附件引用不一致。');total+=f.size;if(total>MAX_TOTAL)throw Error('云端附件总量超过本版本限制。');
    sourceIds.add(f.source_id);reserve(f.source_id);onProgress('正在下载并校验附件 '+(i+1)+' / '+manifest.files.length);
    const bytes=await cloudAPI('/projects/'+projectId+'/assets/'+f.asset_id,{binary:true});if(bytes.length!==f.size||await hash(bytes)!==f.sha256)throw Error('附件校验失败，未导入。');
    files.push({id:ids.get(f.source_id),name:f.name,type:f.original_type??f.type,lastModified:f.lastModified,size:f.size,sha256:f.sha256,data:await asDataURL(new Blob([bytes],{type:f.type}))});
  }
  function rewrite(value,key=''){
    if(typeof value==='string')return ids.has(value)&&['id','active','fileId','coverId','primaryCaseId','references','normIds'].includes(key)?ids.get(value):value;
    if(Array.isArray(value))return value.map(v=>rewrite(v,key));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v,k)]));return value;
  }
  const workspace=rewrite(manifest.workspace);
  for(const revision of archive.revisions){revision.snapshot.assets=revision.snapshot.assets.map(asset=>{const mapped=ids.get(asset.asset_id);if(!mapped)throw Error('工程资源原件未包含在清单中。');return {...asset,asset_id:mapped,storage_key:'indexeddb:'+mapped};});revision.checksum=await checksumSnapshot(revision.snapshot);}
  return {bundle:{format:'roadscape-backup-v1',workspace,files},engineering:archive,legacyId:workspace.projects[0].id,signatureState:{current:manifest.signature_state?.current===true,versions:(manifest.signature_state?.versions||[]).map(id=>ids.get(id)).filter(Boolean)},cloud_revision_id:remote.revision.revision_id,cloud_project_id:projectId};
}
