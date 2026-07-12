const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN required');
const DATA_PATH = 'https://api.github.com/repos/cqgfxgfsthlhgzbrz/inventory/contents/data.json';

const defaultData = { version: 1, main: [], delivery: [] };
let cache = null;

function githubRequest(method, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(DATA_PATH);
    const opts = {
      hostname: 'api.github.com', path: u.pathname + u.search,
      method: method || 'GET',
      headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'Netlify-App', 'X-GitHub-Api-Version': '2022-11-28' }
    };
    if (body) { opts.headers['Content-Type'] = 'application/json; charset=utf-8'; opts.headers['Content-Length'] = Buffer.byteLength(body); }
    const req = https.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } } else { reject(new Error('GitHub ' + res.statusCode)); } });
    });
    req.on('error', reject); req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body); req.end();
  });
}

async function loadData() {
  try {
    const r = await githubRequest('GET');
    const content = Buffer.from(r.content, 'base64').toString('utf-8');
    const data = JSON.parse(content); data._sha = r.sha; cache = data; return data;
  } catch(e) { if (cache) return JSON.parse(JSON.stringify(cache)); return JSON.parse(JSON.stringify(defaultData)); }
}

async function saveData(data) {
  try {
    const json = JSON.stringify(data); const base64 = Buffer.from(json, 'utf-8').toString('base64');
    const body = JSON.stringify({ message: 'Auto save', content: base64, sha: data._sha });
    const r = await githubRequest('PUT', body); data._sha = r.content.sha; cache = data; return true;
  } catch(e) { return false; }
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

exports.handler = async (event) => {
  let raw = event.path || '/', path = raw;
  const prefix = '/.netlify/functions/api';
  if (raw.startsWith(prefix) && raw.length > prefix.length) path = '/api' + raw.substring(prefix.length);

  let method = event.httpMethod || 'GET', body = {};
  try { if (event.body) body = JSON.parse(event.body); } catch(e) {}
  let parts = path.split('/').filter(Boolean);

  if (method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  try {
    if (method === 'GET' && path === '/api/version') { const d = await loadData(); return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: d.version }) }; }
    if (method === 'GET' && path === '/api/data') { const d = await loadData(); const { _sha, ...clean } = d; return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(clean) }; }
    if (method === 'POST' && path === '/api/records') {
      let d = await loadData(); let rec = body.record || {}; rec.id = Date.now();
      d[body.sheet || 'main'] = d[body.sheet || 'main'] || []; d[body.sheet || 'main'].push(rec); d.version = (d.version || 0) + 1;
      const ok = await saveData(d); if (!ok) return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'err' }) };
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, record: rec, version: d.version }) };
    }
    if (method === 'PUT' && parts.length >= 5 && parts[0] === 'api' && parts[1] === 'records' && parts[4] === 'field') {
      let d = await loadData(); let sheet = parts[2], rid = parseInt(parts[3]);
      let rec = (d[sheet] || []).find(r => r.id === rid);
      if (rec) { rec[body.field] = body.value; d.version = (d.version || 0) + 1; const ok = await saveData(d); if (!ok) return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'err' }) }; return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, record: rec, version: d.version }) }; }
      return { statusCode: 404, headers: cors, body: 'not found' };
    }
    if (method === 'DELETE' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'records') {
      let d = await loadData(); let sheet = parts[2], rid = parseInt(parts[3]);
      d[sheet] = (d[sheet] || []).filter(r => r.id !== rid); d.version = (d.version || 0) + 1;
      const ok = await saveData(d); if (!ok) return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'err' }) };
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, version: d.version }) };
    }
  } catch(err) { return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) }; }

  return { statusCode: 404, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'not found' }) };
};
