// Security boundary check for the public build: legacy server.js must never ship with Pages.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const copyStep = workflow.match(/cp ([^\n]+) _site\//)?.[1] || '';
if (!copyStep) throw new Error('Pages workflow does not use an explicit static-asset allowlist');
if (copyStep.split(/\s+/).includes('server.js')) throw new Error('Legacy local server must not be published to Pages');
if (!readme.includes('not hardened for public/network exposure')) throw new Error('README must warn that server.js is local-only');
console.log('Publication security check: explicit static allowlist excludes legacy server.js');
