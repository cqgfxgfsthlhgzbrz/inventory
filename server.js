const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN environment variable required');
const DATA_PATH = 'https://api.github.com/repos/cqgfxgfsthlhgzbrz/inventory/contents/data.json';

const defaultData = {
  version: 1,
  main: [],
  delivery: []
};

let cache = null;

function githubRequest(method, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(DATA_PATH);
    const opts = {
      hostname: 'api.github.com',
      path: u.pathname + u.search,
      method: method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + GITHUB_TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Vercel-App',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json; charset=utf-8';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
        } else {
          reject(new Error('GitHub ' + res.statusCode + ': ' + data.slice(0, 100)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function loadData() {
  try {
    const r = await githubRequest('GET');
    const content = Buffer.from(r.content, 'base64').toString('utf-8');
    const data = JSON.parse(content);
    data._sha = r.sha; // store SHA for later updates
    cache = data;
    return data;
  } catch(e) {
    console.error('Load error:', e.message);
    if (cache) return JSON.parse(JSON.stringify(cache));
    return JSON.parse(JSON.stringify(defaultData));
  }
}

async function saveData(data) {
  try {
    const json = JSON.stringify(data);
    const base64 = Buffer.from(json, 'utf-8').toString('base64');
    const body = JSON.stringify({
      message: 'Auto save',
      content: base64,
      sha: data._sha
    });
    const r = await githubRequest('PUT', body);
    data._sha = r.content.sha;
    cache = data;
    return true;
  } catch(e) {
    console.error('Save error:', e.message);
    return false;
  }
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, code) {
  res.writeHead(code || 200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// Create server
const server = http.createServer(async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let url = req.url.split('?')[0];
  let body = '';
  req.on('data', c => body += c);

  req.on('end', async () => {
    let jsonBody = {};
    try { if (body) jsonBody = JSON.parse(body); } catch(e) {}

    try {
      // GET /api/version
      if (req.method === 'GET' && url === '/api/version') {
        const d = await loadData();
        json(res, { version: d.version });
        return;
      }

      // GET /api/data
      if (req.method === 'GET' && url === '/api/data') {
        const d = await loadData();
        const { _sha, ...clean } = d;
        json(res, clean);
        return;
      }

      // POST /api/records
      if (req.method === 'POST' && url === '/api/records') {
        let d = await loadData();
        let rec = jsonBody.record || {};
        rec.id = Date.now();
        d[jsonBody.sheet || 'main'] = d[jsonBody.sheet || 'main'] || [];
        d[jsonBody.sheet || 'main'].push(rec);
        d.version = (d.version || 0) + 1;
        const ok = await saveData(d);
        if (!ok) { json(res, { error: 'Save failed' }, 500); return; }
        json(res, { success: true, record: rec, version: d.version });
        return;
      }

      // PUT /api/records/:sheet/:id/field
      let parts = url.split('/').filter(Boolean);
      if (req.method === 'PUT' && parts.length >= 5 && parts[0] === 'api' && parts[1] === 'records' && parts[4] === 'field') {
        let d = await loadData();
        let sheet = parts[2], rid = parseInt(parts[3]);
        let rec = (d[sheet] || []).find(r => r.id === rid);
        if (rec) {
          rec[jsonBody.field] = jsonBody.value;
          d.version = (d.version || 0) + 1;
          const ok = await saveData(d);
          if (!ok) { json(res, { error: 'Save failed' }, 500); return; }
          json(res, { success: true, record: rec, version: d.version });
          return;
        }
        json(res, { error: 'not found' }, 404);
        return;
      }

      // DELETE /api/records/:sheet/:id
      if (req.method === 'DELETE' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'records') {
        let d = await loadData();
        let sheet = parts[2], rid = parseInt(parts[3]);
        d[sheet] = (d[sheet] || []).filter(r => r.id !== rid);
        d.version = (d.version || 0) + 1;
        const ok = await saveData(d);
        if (!ok) { json(res, { error: 'Save failed' }, 500); return; }
        json(res, { success: true, version: d.version });
        return;
      }

      // Serve index.html for everything else
      let htmlPath = path.join(__dirname, 'index.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
        res.end(fs.readFileSync(htmlPath));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    } catch(e) {
      console.error('Server error:', e);
      json(res, { error: e.message }, 500);
    }
  });
});

server.listen(PORT, () => { console.log('Server running on port ' + PORT); });

module.exports = server;
