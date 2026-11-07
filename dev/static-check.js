const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const siteFiles = ['index.html','style.css','app.js','providers.js','speedtest.js','dnsinfo.js','legal.html','LICENSE','THIRD-PARTY-NOTICES.md','NOTICE','social-preview.png'];
const missing = [];
for (const file of siteFiles) {
  const attr = file.endsWith('.css') ? `href="${file}"` : file.endsWith('.js') ? `src="${file}"` : null;
  if (attr && !html.includes(attr)) missing.push(`index.html does not reference ${file}`);
  if (!fs.existsSync(path.join(root,file))) missing.push(`Missing ${file}`);
}
if (!html.includes('href="legal.html"')) missing.push('index.html does not link to legal.html');
if (!html.includes('social-preview.png')) missing.push('index.html does not reference the social preview image');
if (!html.includes('<footer class="legal-notice"')) missing.push('Legal info must be a plain bottom bar (footer.legal-notice), not a card');
if (html.includes('class="card legal-notice"')) missing.push('Legal info must not use the card style');
const workflow = fs.readFileSync(path.join(root,'.github','workflows','pages.yml'),'utf8');
const allowlisted = workflow.match(/cp ([^\n]+) _site\//)?.[1]?.split(/\s+/) || [];
for (const file of siteFiles) if (!allowlisted.includes(file)) missing.push(`Pages artifact allowlist omits ${file}`);
for (const forbidden of ['server.js','node_modules','package.json','package-lock.json','dev']) {
  if (allowlisted.includes(forbidden)) missing.push(`Pages artifact must not include ${forbidden}`);
}
if (!workflow.includes('__SOURCE_URL__') || !workflow.includes('GITHUB_REPOSITORY')) missing.push('Pages deployment does not configure source URL substitution');
if (!fs.existsSync(path.join(root,'.gitignore'))) missing.push('.gitignore missing');
if (missing.length) { console.error(missing.join('\n')); process.exitCode=1; }
else console.log('Static publishing check: required assets, legal documents and deployment allowlist OK');
