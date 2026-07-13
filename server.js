// Vercel native serverless handler — storage backed by Tencent Cloud COS
const fs = require('fs');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');

const SECRET_ID = process.env.COS_SECRET_ID || '';
const SECRET_KEY = process.env.COS_SECRET_KEY || '';
const BUCKET = process.env.COS_BUCKET || 'ypyyglxt-1300054444';
const REGION = process.env.COS_REGION || 'ap-shanghai';
const KEY = 'data.json';

const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY });

const defaultData = {
  version: 1,
  main: [
    {id:1,date:'2026-06-23',style:'DC1015',qty:'11（齐色）',inPerson:'吴文校',outDate:'',outPerson:'',location:'仓库',imgStatus:'已交付',shootType:'',colorStatus:'齐色',remark:'收到',imageUrl:'',extra:'',store:'A店拍摄'},
  ],
  delivery: []
};
let cache = null;

async function loadFromCOS(retries=3) {
  if (!SECRET_ID || !SECRET_KEY) return JSON.parse(JSON.stringify(cache || defaultData));
  for(let i=0;i<retries;i++){
    try {
      const r = await cos.getObject({ Bucket: BUCKET, Region: REGION, Key: KEY, Timeout: 15000 });
      const data = JSON.parse(r.Body.toString('utf-8'));
      cache = data; return data;
    } catch(e) {
      // 404 means file not yet created — use default
      if(e.code === 'NoSuchKey' || /NoSuch/.test(e.message)){ cache = JSON.parse(JSON.stringify(defaultData)); return cache; }
      if(i===retries-1){console.error('Load error:', e.message);if(cache)return JSON.parse(JSON.stringify(cache));return JSON.parse(JSON.stringify(defaultData));}
      await new Promise(r=>setTimeout(r,500*Math.pow(2,i)));
    }
  }
}

async function saveToCOS(data,retries=3) {
  if (!SECRET_ID || !SECRET_KEY) return false;
  for(let i=0;i<retries;i++){
    try {
      const json = JSON.stringify(data);
      await cos.putObject({
        Bucket: BUCKET, Region: REGION, Key: KEY, Body: json,
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-cache',
        Timeout: 15000
      });
      cache = data; return true;
    } catch(e) {
      if(i===retries-1){console.error('Save error:', e.message);return false;}
      await new Promise(r=>setTimeout(r,500*Math.pow(2,i)));
    }
  }
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  const url = (req.url || '/').split('?')[0];
  const parts = url.split('/').filter(Boolean);

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

  if (url.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && url === '/api/version') {
        const d = await loadFromCOS();
        cache = d; // update cache
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: d.version, records: d.main.length }));
        return;
      }
      if (req.method === 'GET' && url === '/api/data') {
        cache = null; // force fresh load every time
        const d = await loadFromCOS();
        cache = d;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(d));
        return;
      }
      if (req.method === 'POST' && url === '/api/records') {
        let d = await loadFromCOS();
        let rec = body.record || {};
        rec.id = Date.now();
        d[body.sheet || 'main'] = d[body.sheet || 'main'] || [];
        d[body.sheet || 'main'].push(rec);
        d.version = (d.version || 0) + 1;
        await saveToCOS(d);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, record: rec, version: d.version }));
        return;
      }
      if (req.method === 'PUT' && parts.length >= 5 && parts[0] === 'api' && parts[1] === 'records' && parts[4] === 'field') {
        let d = await loadFromCOS();
        let sheet = parts[2], rid = parseInt(parts[3]);
        let rec = (d[sheet] || []).find(r => r.id === rid);
        if (rec) {
          rec[body.field] = body.value;
          d.version = (d.version || 0) + 1;
          await saveToCOS(d);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, record: rec, version: d.version }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'not found' }));
        }
        return;
      }
      if (req.method === 'DELETE' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'records') {
        let d = await loadFromCOS();
        let sheet = parts[2], rid = parseInt(parts[3]);
        d[sheet] = (d[sheet] || []).filter(r => r.id !== rid);
        d.version = (d.version || 0) + 1;
        await saveToCOS(d);
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
