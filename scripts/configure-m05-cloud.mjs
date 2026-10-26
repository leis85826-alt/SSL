import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2),values={};
if(args.includes('--help')){console.log('Generate config only; never creates resources or runs migrations.\nnode scripts/configure-m05-cloud.mjs --database-id UUID --bucket BUCKET --access-domain TEAM.cloudflareaccess.com --aud AUD [--account-id ACCOUNT] [--out wrangler.m05-cloud.jsonc] [--enable]');process.exit(0);}
for(let i=0;i<args.length;i++){if(args[i]==='--enable'){values.enable=true;continue;}if(!['--database-id','--bucket','--access-domain','--aud','--account-id','--out'].includes(args[i])||!args[i+1])throw Error('Unknown/missing option; use --help');values[args[i].slice(2)]=args[++i];}
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(values['database-id']||'')||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(values.bucket||'')||!/^[a-z0-9][a-z0-9-]{0,62}\.cloudflareaccess\.com$/.test(values['access-domain']||'')||!/^[A-Za-z0-9_-]{8,128}$/.test(values.aud||''))throw Error('Provide real database UUID, bucket, Access team domain and AUD; no API keys are accepted.');
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(root,values.out||'wrangler.m05-cloud.jsonc');
if(path.dirname(out)!==root)throw Error('Configuration must stay in repository root for relative paths.');
if(fs.existsSync(out))throw Error('Output exists; preserve/review it instead of overwriting.');
const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
if(values['account-id']){if(!/^[a-f0-9]{32}$/i.test(values['account-id']))throw Error('Invalid account ID');config.account_id=values['account-id'];}
config.vars={...(config.vars||{}),M05_ENABLED:values.enable?'true':'false',M05_REQUIRE_ASSETS:'true',M05_ACCESS_TEAM_DOMAIN:values['access-domain'],M05_ACCESS_AUD:values.aud};
config.d1_databases=[{binding:'M05_DB',database_name:'roadscape-m05',database_id:values['database-id'],migrations_dir:'migrations/m05'}];
config.r2_buckets=[{binding:'M05_FILES',bucket_name:values.bucket}];
fs.writeFileSync(out,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
console.log('Wrote '+path.basename(out)+'. M05_ENABLED='+config.vars.M05_ENABLED+'. No cloud resources or data were changed.');
