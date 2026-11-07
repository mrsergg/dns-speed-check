const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url:'http://localhost:8484/', runScripts:'outside-only', pretendToBeVisual:true });
const { window } = dom;
window.fetch = async url => {
  const u = String(url);
  if (u.includes('myipv4.addr.tools/plain')) return { ok:true, text:async ()=>'203.0.113.45' };
  if (u.includes('myipv6.addr.tools/plain')) return { ok:false, text:async()=>'' };
  if (u.includes('ws.dnscheck.tools')) throw new Error('mock websocket');
  if (u.includes('ip.addr.tools')) return { ok:true, json:async()=>({ ip:'203.0.113.45', org:'Example ISP', asn:64500 }) };
  if (u.includes('addr.tools/dns')) return { ok:true, json:async()=>({ Answer:[{ type:12, data:'example.isp.test.' }] }) };
  throw new Error('unexpected URL '+u);
};
window.WebSocket = class {
  static OPEN=1; static CLOSING=2;
  constructor() { this.readyState=0; setTimeout(()=>this.onerror?.(),0); }
  addEventListener(type, cb) { if(type==='error') setTimeout(cb,0); }
  close() { this.readyState=3; }
};
window.crypto = require('crypto').webcrypto;
window.eval(fs.readFileSync(path.join(root,'dnsinfo.js'),'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
const btn = window.document.getElementById('btnDnsInfo');
btn.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
setTimeout(()=>{
 const client = window.document.getElementById('dnsInfoClient').textContent;
 if(!client.includes('203.0.113.45') || !client.includes('Example ISP') || !client.includes('example.isp.test')) {
   console.error('IP info render failed:', client); process.exitCode=1;
 } else console.log('DNS info UI mock test: external IP, owner and PTR rendered');
},100);
