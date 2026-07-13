// Vercel native serverless handler
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const defaultData = {
  version: 1,
  main: [
    {id:1,date:'2026-06-23',style:'DC1015',qty:'11（齐色）',inPerson:'吴文校',outDate:'',outPerson:'',location:'仓库',imgStatus:'已交付',shootType:'定稿样拍摄',colorStatus:'齐色',remark:'收到',imageUrl:'',extra:''},
  ],
  delivery: []
};
let cache = null;

async function loadFromGitHub(retries=2) {
  if (!GITHUB_TOKEN) return JSON.parse(JSON.stringify(cache || defaultData));
  for(let i=0;i<retries;i++){
    try {
      const res = await fetch('https://api.github.com/repos/cqgfxgfsthlhgzbrz/inventory/contents/data.json', {
        headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'Vercel', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) throw new Error('GitHub read error: ' + res.status);
      const r = await res.json();
      const data = JSON.parse(Buffer.from(r.content, 'base64').toString('utf-8'));
      data._sha = r.sha; cache = data; return data;
    } catch(e) {
      if(i===retries-1){console.error('Load error (exhausted):', e.message);if(cache)return JSON.parse(JSON.stringify(cache));return JSON.parse(JSON.stringify(defaultData));}
      await new Promise(r=>setTimeout(r,1000));
    }
  }
}

async function saveToGitHub(data,retries=3) {
  if (!GITHUB_TOKEN) return false;
  for(let i=0;i<retries;i++){
    try {
      const json = JSON.stringify(data);
      const res = await fetch('https://api.github.com/repos/cqgfxgfsthlhgzbrz/inventory/contents/data.json', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'Vercel', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Auto save', content: Buffer.from(json).toString('base64'), sha: data._sha }),
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) throw new Error('GitHub write error: ' + res.status);
      const r = await res.json(); data._sha = r.content.sha; cache = data; return true;
    } catch(e) {
      if(i===retries-1){console.error('Save error (exhausted):', e.message);return false;}
      // Re-load SHA on 409 conflict, then retry
      if(e.message.includes('409')||e.message.includes('422')){
        try{
          const r2=await fetch('https://api.github.com/repos/cqgfxgfsthlhgzbrz/inventory/contents/data.json',{headers:{'Authorization':'Bearer '+GITHUB_TOKEN,'Accept':'application/vnd.github+json','User-Agent':'Vercel'},signal:AbortSignal.timeout(10000)});
          if(r2.ok){const j2=await r2.json();data._sha=j2.sha;cache=JSON.parse(Buffer.from(j2.content,'base64').toString('utf-8'));cache._sha=j2.sha}
        }catch(e2){}
      }
      await new Promise(r=>setTimeout(r,800));
    }
  }
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  const url = (req.url || '/').split('?')[0];
  const parts = url.split('/').filter(Boolean);

  // Handle body
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => handleApi(req, res, url, parts, body));
    return;
  }
  handleApi(req, res, url, parts, '');
};

async function handleApi(req, res, url, parts, rawBody) {
  let body = {};
  try { if (rawBody) body = JSON.parse(rawBody); } catch(e) {}

  // API routes
  if (url.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && url === '/api/version') {
        const d = await loadFromGitHub();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: d.version }));
        return;
      }
      if (req.method === 'GET' && url === '/api/data') {
        const d = await loadFromGitHub();
        const { _sha, ...clean } = d;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(clean));
        return;
      }
      if (req.method === 'POST' && url === '/api/records') {
        let d = await loadFromGitHub();
        let rec = body.record || {};
        rec.id = Date.now();
        d[body.sheet || 'main'] = d[body.sheet || 'main'] || [];
        d[body.sheet || 'main'].push(rec);
        d.version = (d.version || 0) + 1;
        await saveToGitHub(d);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, record: rec, version: d.version }));
        return;
      }
      if (req.method === 'PUT' && parts.length >= 5 && parts[0] === 'api' && parts[1] === 'records' && parts[4] === 'field') {
        let d = await loadFromGitHub();
        let sheet = parts[2], rid = parseInt(parts[3]);
        let rec = (d[sheet] || []).find(r => r.id === rid);
        if (rec) {
          rec[body.field] = body.value;
          d.version = (d.version || 0) + 1;
          await saveToGitHub(d);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, record: rec, version: d.version }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'not found' }));
        }
        return;
      }
      if (req.method === 'DELETE' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'records') {
        let d = await loadFromGitHub();
        let sheet = parts[2], rid = parseInt(parts[3]);
        d[sheet] = (d[sheet] || []).filter(r => r.id !== rid);
        d.version = (d.version || 0) + 1;
        await saveToGitHub(d);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, version: d.version }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API not found' }));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || 'Server error' }));
    }
    return;
  }

  // Serve static file
  try {
    const fp = path.join(__dirname, 'index.html');
    if (fs.existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
      res.end(fs.readFileSync(fp));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>OK</h1></body></html>');
    }
  } catch(e) {
    res.writeHead(500);
    res.end('Error');
  }
}
