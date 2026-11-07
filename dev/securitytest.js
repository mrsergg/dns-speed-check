// Publication boundary check: the repository must stay a static site with no local server code.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const copyStep = workflow.match(/cp ([^\n]+) _site\//)?.[1] || '';
if (!copyStep) throw new Error('Pages workflow does not use an explicit static-asset allowlist');
if (copyStep.split(/\s+/).includes('server.js')) throw new Error('A local server must not be published to Pages');
if (fs.existsSync(path.join(root, 'server.js'))) throw new Error('Legacy server.js must not be present in the public repository');
if (String(pkg.scripts?.start || '').includes('server.js')) throw new Error('package.json start script still references server.js');

console.log('Publication check: static-only repository, no local server in repo or Pages artifact');
