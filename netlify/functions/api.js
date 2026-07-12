const https = require('https');

const BLOB_ID = process.env.BLOB_ID || '019f565e-6442-7884-85c9-aaba6f63ddac';
const BLOB_URL = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;

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

let cache = null;

function httpRequest(url, method, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method: method || 'GET',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json; charset=utf-8' } };
    if (method === 'PUT' && body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } }
        else { reject(new Error('HTTP ' + res.statusCode)); }
      });
    });
    req.on('error', reject); req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    if (method === 'PUT' && body) req.write(body); req.end();
  });
}

async function loadFromBlob() { try { const data = await httpRequest(BLOB_URL, 'GET'); cache = data; return data; } catch(e) { if (cache) return JSON.parse(JSON.stringify(cache)); return JSON.parse(JSON.stringify(defaultData)); } }
async function saveToBlob(data) { try { await httpRequest(BLOB_URL, 'PUT', JSON.stringify(data)); cache = data; return true; } catch(e) { return false; } }

exports.handler = async (event) => {
  // Netlify rewrites /api/* to /.netlify/functions/api/:splat
  // so event.path = /.netlify/functions/api/version
  // we extract the /api/ part from the path
  let raw = event.path || '/';
  let path = raw;
  
  // If path contains /.netlify/functions/api with a suffix, extract it as /api/suffix
  const prefix = '/.netlify/functions/api';
  if (raw.startsWith(prefix) && raw.length > prefix.length) {
    path = '/api' + raw.substring(prefix.length);
  }
  
  let method = event.httpMethod || 'GET';
  let body = {};
  try { if (event.body) body = JSON.parse(event.body); } catch(e) {}
  let parts = path.split('/').filter(Boolean);

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  try {
    if (method === 'GET' && path === '/api/version') {
      const d = await loadFromBlob();
      return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json;charset=utf-8' }, body: JSON.stringify({ version: d.version }) };
    }
    if (method === 'GET' && path === '/api/data') {
      const d = await loadFromBlob();
      return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json;charset=utf-8' }, body: JSON.stringify(d) };
    }
    if (method === 'POST' && path === '/api/records') {
      let d = await loadFromBlob(); let rec = body.record || {}; rec.id = Date.now();
      d[body.sheet || 'main'] = d[body.sheet || 'main'] || []; d[body.sheet || 'main'].push(rec); d.version = (d.version || 0) + 1;
      const ok = await saveToBlob(d); if (!ok) return { statusCode: 500, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Save failed' }) };
      return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json;charset=utf-8' }, body: JSON.stringify({ success: true, record: rec, version: d.version }) };
    }
    if (method === 'PUT' && parts.length >= 5 && parts[0] === 'api' && parts[1] === 'records' && parts[4] === 'field') {
      let d = await loadFromBlob(); let sheet = parts[2], rid = parseInt(parts[3]);
      let rec = (d[sheet] || []).find(r => r.id === rid);
      if (rec) { rec[body.field] = body.value; d.version = (d.version || 0) + 1; const ok = await saveToBlob(d); if (!ok) return { statusCode: 500, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Save failed' }) }; return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json;charset=utf-8' }, body: JSON.stringify({ success: true, record: rec, version: d.version }) }; }
      return { statusCode: 404, headers, body: 'not found' };
    }
    if (method === 'DELETE' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'records') {
      let d = await loadFromBlob(); let sheet = parts[2], rid = parseInt(parts[3]);
      d[sheet] = (d[sheet] || []).filter(r => r.id !== rid); d.version = (d.version || 0) + 1;
      const ok = await saveToBlob(d); if (!ok) return { statusCode: 500, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Save failed' }) };
      return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json;charset=utf-8' }, body: JSON.stringify({ success: true, version: d.version }) };
    }
  } catch(err) {
    return { statusCode: 500, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message, path }) };
  }

  return { statusCode: 404, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'API not found', path }) };
};
