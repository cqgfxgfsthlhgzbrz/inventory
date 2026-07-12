const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  // API routes - echo back for now
  if (url === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: 1 }));
    return;
  }

  if (url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: 1, main: [], delivery: [] }));
    return;
  }

  // POST /api/records
  if (req.method === 'POST' && url === '/api/records') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let data = {};
      try { data = JSON.parse(body); } catch(e) {}
      let rec = (data.record || {});
      rec.id = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, record: rec, version: 1 }));
    });
    return;
  }

  // PUT /api/records/:sheet/:id/field
  if (req.method === 'PUT' && url.match(/^\/api\/records\/\w+\/\d+\/field$/)) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let data = {};
      try { data = JSON.parse(body); } catch(e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, record: {}, version: 1 }));
    });
    return;
  }

  // DELETE /api/records/:sheet/:id
  if (req.method === 'DELETE' && url.match(/^\/api\/records\/\w+\/\d+$/)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, version: 1 }));
    return;
  }

  // Serve index.html
  const htmlPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(htmlPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    res.end(fs.readFileSync(htmlPath));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    res.end('<html><body><h1>OK</h1></body></html>');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on ' + PORT));
module.exports = server;
