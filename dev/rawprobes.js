const dns = require('dns');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','providers.js'),'utf8'));
const targets = window.PROVIDERS.filter(p=>!p.doh && p.ipv4?.length);
async function query(ip){
 const resolver = new dns.Resolver(); resolver.setServers([ip]);
 return new Promise(resolve=>{
  const started=Date.now();
  const timer=setTimeout(()=>{resolver.cancel();resolve({ip,ok:false,ms:Date.now()-started,error:'timeout'});},4000);
  resolver.resolve4('example.com',(err,addresses)=>{
   clearTimeout(timer); resolve(err?{ip,ok:false,ms:Date.now()-started,error:err.code||err.message}:{ip,ok:addresses.length>0,ms:Date.now()-started,addresses});
  });
 });
}
(async()=>{
 await Promise.all(targets.map(async p=>{
  const checks=await Promise.all((p.ipv4||[]).slice(0,2).map(query));
  console.log(p.id.padEnd(16),JSON.stringify(checks));
 }));
})().catch(e=>{console.error(e);process.exitCode=1});
