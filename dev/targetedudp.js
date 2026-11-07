const dns=require('dns');
const targets=[['quad9-unfiltered','9.9.9.10'],['adguard-unfiltered','94.140.14.140'],['mullvad','194.242.2.2'],['nextdns','45.90.28.0']];
async function run(id,ip){const resolver=new dns.Resolver();resolver.setServers([ip]);return new Promise(resolve=>{const start=Date.now();const timer=setTimeout(()=>{resolver.cancel();resolve(`${id.padEnd(20)} FAIL timeout`);},4000);resolver.resolve4('example.com',(err,ips)=>{clearTimeout(timer);resolve(err?`${id.padEnd(20)} FAIL ${err.code}`:`${id.padEnd(20)} OK ${Date.now()-start}ms ${ips.join(',')}`);});});}
(async()=>{for(const [id,ip] of targets)console.log(await run(id,ip));})().catch(e=>{console.error(e);process.exitCode=1});
