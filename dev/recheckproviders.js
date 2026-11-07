// Repeat flaky/unavailable DoH entries to separate transient/network failures from persistent failures.
const vm = require('vm');
globalThis.window = globalThis;
globalThis.document = { addEventListener(){}, getElementById:()=>({textContent:'',innerHTML:'',disabled:false,classList:{add(){},remove(){},toggle(){}}}) };
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname,'..','providers.js'),'utf8'),{filename:'providers.js'});
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname,'..','app.js'),'utf8'),{filename:'app.js'});
const sig={aborted:false,addEventListener(){}};
(async()=>{
 for (const id of ['quad9-unfiltered','adguard','nextdns','mullvad','dns0']) {
  const p=window.PROVIDERS.find(x=>x.id===id);
  const outcomes=[];
  for(let i=0;i<2;i++) {
   const r=await testProvider(p,{freq:2,timeout:7000,adTest:false},sig,()=>{},()=>{});
   outcomes.push(`${r.status}${r.samples.length?` ${Math.round(median(r.samples))}ms`:''}${r.why?` (${r.why})`:''}`);
  }
  console.log(id.padEnd(20),outcomes.join(' | '));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
