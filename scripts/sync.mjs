import {publishPackage,deletePackage} from './github-release.mjs';
const origin='https://hyper-lane-chart-hub.arcane-bard-0210.chatgpt.site';
const secret=process.env.CHART_SYNC_SECRET,token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPOSITORY;
if(!secret||!token||repo!=='ampere112coulomb/hyper-lane-charts')throw Error('Missing sync configuration');
async function site(path,body,lease){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{'X-HyperLane-Sync':secret,...(body?{'Content-Type':'application/json'}:{}),...(lease?{'X-HyperLane-Lease':String(lease)}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`Site request failed (${r.status})`);return r;}
const queue=await (await site('/api/sync')).json();if(queue.repo!==repo)throw Error('Repository mismatch');
let failures=0;
for(const item of queue.items){
 if(!/^[a-f0-9-]{36}$/.test(item.id))throw Error('Invalid chart ID');
 const path=`/api/sync/${item.id}`;let claim;
 try{
  claim=await (await site(path,{action:'claim'})).json();let result={};
  if(claim.action==='delete')await deletePackage({repo,token},item);
  else{const response=await site(path,null,claim.lease);if(Number(response.headers.get('Content-Length'))>100*1024*1024)throw Error('ZIP too large');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>100*1024*1024)throw Error('ZIP too large');result=await publishPackage({repo,token},item,bytes);}
  await site(path,{action:'complete',lease:claim.lease,...result});console.log(`${item.id}: ${claim.action} complete`);
 }catch{failures++;console.error(`${item.id}: failed; source retained for retry`);if(claim)try{await site(path,{action:'abort',lease:claim.lease});}catch{}}
}
if(failures)process.exitCode=1;else console.log(`Sync finished: ${queue.items.length} jobs`);
