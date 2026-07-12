const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const defaultData = {
  version: 1,
  main: [
    {id:1,date:'2026-06-23',style:'DC1015',qty:'11（齐色）',inPerson:'吴文校',outDate:'',outPerson:'',location:'仓库',imgStatus:'已交付',shootType:'定稿样拍摄',colorStatus:'齐色',remark:'收到',imageUrl:'',extra:''},
  ],
  delivery: []
};
let cache = null;

async function loadData() {
  if (!GITHUB_TOKEN) { if (cache) return JSON.parse(JSON.stringify(cache)); return JSON.parse(JSON.stringify(defaultData)); }
  try {
    const res = await fetch('https://api.github.com/repos/cqgfxgfsthlhgzbrz/inventory/contents/data.json', {
      headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'Vercel', 'X-GitHub-Api-Version': '2022-11-28' }
    });
    if (!res.ok) throw new Error('read err: ' + res.status);
    const r = await res.json();
    const data = JSON.parse(Buffer.from(r.content, 'base64').toString('utf-8'));
    data._sha = r.sha; cache = data; return data;
  } catch(e) { console.error(e.message); if (cache) return JSON.parse(JSON.stringify(cache)); return JSON.parse(JSON.stringify(defaultData)); }
}

async function saveData(data) {
  if (!GITHUB_TOKEN) return false;
  try {
    const json = JSON.stringify(data);
    const res = await fetch('https://api.github.com/repos/cqgfxgfsthlhgzbrz/inventory/contents/data.json', {
      method: 'PUT', headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'Vercel', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Auto save', content: Buffer.from(json).toString('base64'), sha: data._sha })
    });
    if (!res.ok) throw new Error('write err: ' + res.status);
    const r = await res.json(); data._sha = r.content.sha; cache = data; return true;
  } catch(e) { console.error(e.message); return false; }
}

function setCORS(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); }

function sendJson(res, data, code) { res.writeHead(code || 200, { 'Content-Type': 'application/json;charset=utf-8' }); res.end(JSON.stringify(data)); }

const server = http.createServer(async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = req.url.split('?')[0];

  // Non-API: serve index.html
  if (!url.startsWith('/api/')) {
    try { const fp = path.join(__dirname, 'index.html'); res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' }); res.end(fs.readFileSync(fp)); } catch(e) { res.writeHead(404); res.end('Not found'); }
    return;
  }

  let rawBody = ''; req.on('data', c => rawBody += c);
  req.on('end', async () => {
    let body = {}; try { if (rawBody) body = JSON.parse(rawBody); } catch(e) {}
    const parts = url.split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && url === '/api/version') { const d = await loadData(); sendJson(res, { version: d.version }); }
      else if (req.method === 'GET' && url === '/api/data') { const d = await loadData(); const { _sha, ...clean } = d; sendJson(res, clean); }
      else if (req.method === 'POST' && url === '/api/records') {
        let d = await loadData(); let rec = body.record || {}; rec.id = Date.now(); d[body.sheet || 'main'] = d[body.sheet || 'main'] || []; d[body.sheet || 'main'].push(rec); d.version = (d.version || 0) + 1; await saveData(d); sendJson(res, { success: true, record: rec, version: d.version });
      }
      else if (req.method === 'PUT' && parts.length >= 5 && parts[0] === 'api' && parts[1] === 'records' && parts[4] === 'field') {
        let d = await loadData(); let sheet = parts[2], rid = parseInt(parts[3]); let rec = (d[sheet] || []).find(r => r.id === rid);
        if (rec) { rec[body.field] = body.value; d.version = (d.version || 0) + 1; await saveData(d); sendJson(res, { success: true, record: rec, version: d.version }); } else { sendJson(res, { error: 'not found' }, 404); }
      }
      else if (req.method === 'DELETE' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'records') {
        let d = await loadData(); let sheet = parts[2], rid = parseInt(parts[3]); d[sheet] = (d[sheet] || []).filter(r => r.id !== rid); d.version = (d.version || 0) + 1; await saveData(d); sendJson(res, { success: true, version: d.version });
      }
      else { sendJson(res, { error: 'API not found' }, 404); }
    } catch(e) { sendJson(res, { error: e.message }, 500); }
  });
});

server.listen(PORT, () => console.log('Server running on ' + PORT));
module.exports = server;
