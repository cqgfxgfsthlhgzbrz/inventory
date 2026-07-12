const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

async function loadData() {
  if (!GITHUB_TOKEN) throw new Error('No GitHub token configured');
  try {
    const res = await fetch('https://api.github.com/repos/cqgfxgfsthlhgzbrz/inventory/contents/data.json', {
      headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'Vercel', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error('GitHub read: ' + res.status);
    const r = await res.json();
    const data = JSON.parse(Buffer.from(r.content, 'base64').toString('utf-8'));
    data._sha = r.sha;
    return data;
  } catch(e) { throw e; }
}

async function saveData(data) {
  if (!GITHUB_TOKEN) throw new Error('No GitHub token configured');
  const json = JSON.stringify(data);
  const base64 = Buffer.from(json, 'utf-8').toString('base64');
  const res = await fetch('https://api.github.com/repos/cqgfxgfsthlhgzbrz/inventory/contents/data.json', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'Vercel', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Auto save', content: base64, sha: data._sha }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error('GitHub write: ' + res.status);
  const r = await res.json();
  data._sha = r.content.sha;
  return true;
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, data, code) {
  res.writeHead(code || 200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  // Serve static files for non-API routes
  if (!url.startsWith('/api/')) {
    const htmlPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
      res.end(fs.readFileSync(htmlPath));
    } else {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  // Collect body for API requests
  let rawBody = '';
  req.on('data', c => rawBody += c);

  req.on('end', async () => {
    let body = {};
    try { if (rawBody) body = JSON.parse(rawBody); } catch(e) {}

    const parts = url.split('/').filter(Boolean);

    try {
      if (req.method === 'GET' && url === '/api/version') {
        const d = await loadData();
        sendJson(res, { version: d.version });
      }
      else if (req.method === 'GET' && url === '/api/data') {
        const d = await loadData();
        const { _sha, ...clean } = d;
        sendJson(res, clean);
      }
      else if (req.method === 'POST' && url === '/api/records') {
        let d = await loadData();
        let rec = body.record || {}; rec.id = Date.now();
        d[body.sheet || 'main'] = d[body.sheet || 'main'] || [];
        d[body.sheet || 'main'].push(rec);
        d.version = (d.version || 0) + 1;
        await saveData(d);
        sendJson(res, { success: true, record: rec, version: d.version });
      }
      else if (req.method === 'PUT' && parts.length >= 5 && parts[0] === 'api' && parts[1] === 'records' && parts[4] === 'field') {
        let d = await loadData();
        let sheet = parts[2], rid = parseInt(parts[3]);
        let rec = (d[sheet] || []).find(r => r.id === rid);
        if (rec) {
          rec[body.field] = body.value;
          d.version = (d.version || 0) + 1;
          await saveData(d);
          sendJson(res, { success: true, record: rec, version: d.version });
        } else {
          sendJson(res, { error: 'not found' }, 404);
        }
      }
      else if (req.method === 'DELETE' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'records') {
        let d = await loadData();
        let sheet = parts[2], rid = parseInt(parts[3]);
        d[sheet] = (d[sheet] || []).filter(r => r.id !== rid);
        d.version = (d.version || 0) + 1;
        await saveData(d);
        sendJson(res, { success: true, version: d.version });
      }
      else {
        sendJson(res, { error: 'API not found' }, 404);
      }
    } catch(e) {
      sendJson(res, { error: e.message || 'Server error' }, 500);
    }
  });
});

server.listen(PORT, () => console.log('Server running on port ' + PORT));

module.exports = server;
