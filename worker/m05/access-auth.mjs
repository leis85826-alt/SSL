// Cryptographic validation is required even if Access sits in front of the Worker.
const cache = new Map();
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
export function accessSettings(env) {
  const team = env.M05_ACCESS_TEAM_DOMAIN, aud = env.M05_ACCESS_AUD;
  if (typeof team !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}\.cloudflareaccess\.com$/.test(team)
      || typeof aud !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(aud)) return null;
  return { issuer: 'https://' + team, aud };
}
async function keys(issuer) {
  const now = Date.now(), old = cache.get(issuer);
  if (old && old.until > now) return old.promise;
  const promise = (async () => {
    const response = await fetch(issuer + '/cdn-cgi/access/certs', { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok || !response.body) throw Error('jwks unavailable');
    const reader = response.body.getReader(), chunks=[]; let size=0;
    try { while (true) { const {done,value}=await reader.read(); if(done)break;size+=value.length;if(size>65536)throw Error('jwks limit');chunks.push(value); } }
    finally { await reader.cancel().catch(()=>{}); }
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if(!Array.isArray(data.keys)||data.keys.length>32)throw Error('jwks format');return data.keys;
  })();
  // Keep failed requests briefly too, to bound untrusted-token network amplification.
  cache.set(issuer,{promise,until:now+300000});
  promise.catch(()=>{cache.set(issuer,{promise,until:Date.now()+10000});});
  return promise;
}
export function accessResolver(env) {
  const settings=accessSettings(env);if(!settings)return undefined;
  return async request => {
    try {
      const header=request.headers.get('Cf-Access-Jwt-Assertion');
      const cookie=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('CF_Authorization='));
      const token=header || cookie?.slice('CF_Authorization='.length);
      if(typeof token!=='string'||token.length>16384||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return null;
      const parts=token.split('.'), head=JSON.parse(new TextDecoder().decode(decode(parts[0]))), claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
      const now=Math.floor(Date.now()/1000);
      if(head.alg!=='RS256'||typeof head.kid!=='string'||head.kid.length>200||head.crit!==undefined
          ||claims.iss!==settings.issuer||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(settings.aud)
          ||!Number.isSafeInteger(claims.exp)||claims.exp<=now||!Number.isSafeInteger(claims.iat)||claims.iat>now+30
          ||(claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now+30))
          ||typeof claims.sub!=='string'||!claims.sub.trim()||claims.sub.length>256)return null;
      const jwk=(await keys(settings.issuer)).find(k=>k.kid===head.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
      if(!jwk)return null;
      const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
      if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(settings.issuer+'\n'+claims.sub));
      return 'access:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
    }catch{return null;}
  };
}
