// Простейший статический сервер без зависимостей (для local-запуска тулзы).
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const port = process.env.PORT || 8484;

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\.\./g, '');
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(root, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`DNS Тестер: http://localhost:${port}`));
