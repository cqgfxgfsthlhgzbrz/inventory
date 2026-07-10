const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BLOB_ID = process.env.BLOB_ID || '019f4c85-55fd-77f7-939b-15b52add4bce';
const BLOB_URL = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;

// Default data as fallback
const defaultData = {
  version: 1,
  main: [
    {id:1,date:'2026-06-23',style:'DC1015',qty:'11（齐色）',inPerson:'吴文校',outDate:'',outPerson:'',location:'仓库',imgStatus:'已交付',shootType:'定稿样拍摄',colorStatus:'齐色',remark:'收到',imageUrl:'',extra:''},
    {id:2,date:'2026-06-23',style:'TD1002',qty:'1（绿色）',inPerson:'吴文校',outDate:'',outPerson:'',location:'仓库',imgStatus:'已交付',shootType:'定稿样拍摄',colorStatus:'',remark:'收到',imageUrl:'',extra:''},
    {id:3,date:'2026-06-24',style:'TC1002',qty:'5（新加色）',inPerson:'张逸飞',outDate:'',outPerson:'',location:'',imgStatus:'',shootType:'套图拍摄',colorStatus:'齐色',remark:'',imageUrl:'',extra:''},
    {id:4,date:'2026-06-25',style:'TC1001TZ',qty:'新款套装6件衣服4条领带',inPerson:'张逸飞',outDate:'',outPerson:'',location:'仓库',imgStatus:'已交付',shootType:'套图拍摄',colorStatus:'',remark:'办公室收到',imageUrl:'',extra:''},
    {id:5,date:'2026-06-25',style:'TD1006',qty:'1件 试拍颜色',inPerson:'吴文校',outDate:'',outPerson:'',location:'',imgStatus:'',shootType:'套图拍摄',colorStatus:'样衣',remark:'',imageUrl:'',extra:''},
    {id:6,date:'2026-06-26',style:'A579, A552',qty:'S码M码各一件',inPerson:'张逸飞',outDate:'',outPerson:'',location:'',imgStatus:'',shootType:'套图拍摄',colorStatus:'',remark:'',imageUrl:'',extra:''},
    {id:7,date:'2026-06-27',style:'DC1006',qty:'S码拍照样衣5件',inPerson:'吴文校',outDate:'2026-06-30',outPerson:'',location:'仓库',imgStatus:'已交付',shootType:'套图拍摄',colorStatus:'齐色',remark:'收到',imageUrl:'',extra:''},
    {id:8,date:'2026-06-29',style:'TC1003',qty:'新加色 6码拍照样衣(12色)',inPerson:'张逸飞',outDate:'2026-06-30',outPerson:'',location:'仓库',imgStatus:'已交付',shootType:'定稿样拍摄',colorStatus:'齐色',remark:'收到',imageUrl:'',extra:''},
    {id:9,date:'2026-07-06',style:'TF1002',qty:'新款童装11个颜色',inPerson:'张逸飞',outDate:'',outPerson:'',location:'',imgStatus:'',shootType:'套图拍摄',colorStatus:'',remark:'',imageUrl:'',extra:''},
    {id:10,date:'2026-07-06',style:'R112, R113',qty:'试拍样衣S码各一件',inPerson:'张逸飞',outDate:'',outPerson:'',location:'',imgStatus:'',shootType:'套图拍摄',colorStatus:'',remark:'',imageUrl:'',extra:''},
    {id:11,date:'2026-07-08',style:'A598, DF1001',qty:'试拍样衣A598 S码一件 DF1001 M码一件',inPerson:'张逸飞',outDate:'',outPerson:'',location:'',imgStatus:'',shootType:'套图拍摄',colorStatus:'',remark:'',imageUrl:'',extra:''},
    {id:12,date:'2026-07-09',style:'TC1005, TC1011',qty:'TC1005:8件6码，TC1011:10件6码大货拍照样衣',inPerson:'张逸飞',outDate:'',outPerson:'',location:'',imgStatus:'',shootType:'定稿样拍摄',colorStatus:'',remark:'',imageUrl:'',extra:''},
    {id:13,date:'2026-07-09',style:'G595',qty:'女童西部试拍样衣6码一件',inPerson:'张逸飞',outDate:'',outPerson:'',location:'',imgStatus:'',shootType:'套图拍摄',colorStatus:'',remark:'',imageUrl:'',extra:''},
  ],
  delivery: []
};

// In-memory cache to reduce API calls
let cache = null;
let cacheVersion = -1;

async function loadFromBlob() {
  try {
    const res = await fetch(BLOB_URL, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error('Blob read failed: ' + res.status);
    const data = await res.json();
    cache = data;
    cacheVersion = data.version || 0;
    return data;
  } catch(e) {
    console.error('Load error:', e.message);
    // Return cache if available, otherwise default
    if (cache) return JSON.parse(JSON.stringify(cache));
    return JSON.parse(JSON.stringify(defaultData));
  }
}

async function saveToBlob(data) {
  try {
    const res = await fetch(BLOB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error('Blob write failed: ' + res.status);
    cache = data;
    cacheVersion = data.version;
    return true;
  } catch(e) {
    console.error('Save error:', e.message);
    return false;
  }
}

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function serveStatic(req, res) {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    let ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
}

function json(res, data, code) {
  res.writeHead(code || 200, {
    'Content-Type': 'application/json;charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch(e) { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let url = req.url.split('?')[0];
  let parts = url.split('/').filter(Boolean);

  // API: GET /api/version
  if (req.method === 'GET' && url === '/api/version') {
    try {
      let d = await loadFromBlob();
      return json(res, { version: d.version });
    } catch(e) {
      return json(res, { version: 1 }, 500);
    }
  }

  // API: GET /api/data
  if (req.method === 'GET' && url === '/api/data') {
    try {
      let d = await loadFromBlob();
      return json(res, d);
    } catch(e) {
      return json(res, { error: 'Failed to load data' }, 500);
    }
  }

  // API: POST /api/records
  if (req.method === 'POST' && url === '/api/records') {
    let b = await readBody(req);
    let d = await loadFromBlob();
    let rec = b.record || {};
    rec.id = Date.now();
    d[b.sheet || 'main'] = d[b.sheet || 'main'] || [];
    d[b.sheet || 'main'].push(rec);
    d.version = (d.version || 0) + 1;
    let ok = await saveToBlob(d);
    if (!ok) return json(res, { error: 'Save failed' }, 500);
    return json(res, { success: true, record: rec, version: d.version });
  }

  // API: PUT /api/records/:sheet/:id/field
  if (req.method === 'PUT' && parts.length >= 5 && parts[0] === 'api' && parts[1] === 'records' && parts[4] === 'field') {
    let b = await readBody(req);
    let d = await loadFromBlob();
    let sheet = parts[2], rid = parseInt(parts[3]);
    let rec = (d[sheet] || []).find(r => r.id === rid);
    if (rec) {
      rec[b.field] = b.value;
      d.version = (d.version || 0) + 1;
      let ok = await saveToBlob(d);
      if (!ok) return json(res, { error: 'Save failed' }, 500);
      return json(res, { success: true, record: rec, version: d.version });
    }
    res.writeHead(404); res.end('not found'); return;
  }

  // API: DELETE /api/records/:sheet/:id
  if (req.method === 'DELETE' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'records') {
    let d = await loadFromBlob();
    let sheet = parts[2], rid = parseInt(parts[3]);
    d[sheet] = (d[sheet] || []).filter(r => r.id !== rid);
    d.version = (d.version || 0) + 1;
    let ok = await saveToBlob(d);
    if (!ok) return json(res, { error: 'Save failed' }, 500);
    return json(res, { success: true, version: d.version });
  }

  // Static files
  serveStatic(req, res);
});

// Vercel serverless support
if (process.env.VERCEL) {
  module.exports = async (req, res) => {
    await new Promise((resolve) => server.emit('request', req, res));
    return new Promise((resolve) => res.on('finish', resolve));
  };
} else {
  server.listen(PORT, () => console.log('Server running on port ' + PORT));
}
