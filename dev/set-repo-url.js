// Optional local helper: replace the Pages source-link placeholder before committing.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname,'..');
const repo = process.argv[2] || process.env.GITHUB_REPOSITORY_URL;
if (!repo || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(repo)) {
  console.error('Usage: node dev/set-repo-url.js https://github.com/owner/repo');
  process.exit(1);
}
const normalized = repo.replace(/\/$/,'');
for (const file of ['index.html','legal.html']) {
  const filePath = path.join(root,file);
  const html = fs.readFileSync(filePath,'utf8');
  if (!html.includes('__SOURCE_URL__')) throw new Error(`Source URL placeholder not found in ${file}`);
  fs.writeFileSync(filePath,html.replaceAll('__SOURCE_URL__',normalized));
}
console.log('Updated GitHub source links in index.html and legal.html.');
