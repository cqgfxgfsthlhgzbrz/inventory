// Vercel native serverless handler — pure HTTP, no SDK deps
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const SECRET_ID = process.env.COS_SECRET_ID || '';
const SECRET_KEY = process.env.COS_SECRET_KEY || '';
const BUCKET = process.env.COS_BUCKET || 'ypyyglxt-1300054444';
const REGION = process.env.COS_REGION || 'ap-shanghai';
const HOST = BUCKET + '.cos.' + REGION + '.myqcloud.com';
const KEY = 'data.json';

const defaultData = {
  version: 1,
  main: [],
  delivery: []
};
let cache = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cosRequest(method, body) {
  return new Promise((resolve, reject) => {
    const t0 = Math.floor(Date.now() / 1000);
    const t1 = t0 + 900;
    const kt = t0 + ';' + t1;
    const sig = method + '\n/' + KEY + '\n\nhost=' + HOST + '\n';
    const signKey = crypto.createHmac('sha1', SECRET_KEY).update(kt).digest('hex');
    const sigSha = crypto.createHash('sha1').update(sig).digest('hex');
    const ts = 'sha1\n' + kt + '\n' + sigSha + '\n';
    const signature = crypto.createHmac('sha1', signKey).update(ts).digest('hex');
    const auth = 'q-sign-algorithm=sha1&q-ak=' + SECRET_ID + '&q-sign-time=' + kt + '&q-key-time=' + kt + '&q-header-list=host&q-url-param-list=&q-signature=' + signature;
    const opts = {
      hostname: HOST, path: '/' + KEY, method,
      headers: { Host: HOST, Authorization: auth, 'Content-Type': 'application/json; charset=utf-8' },
      timeout: 15000
    };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function loadFromCOS(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await cosRequest('GET');
      if (r.status === 200) { cache = JSON.parse(r.body); return cache; }
      if (r.status === 404) { cache = JSON.parse(JSON.stringify(defaultData)); return cache; }
    } catch (e) {}
    await sleep(500 * Math.pow(2, i));
  }
  return cache || JSON.parse(JSON.stringify(defaultData));
}

async function saveToCOS(data, retries = 3) {
  const body = JSON.stringify(data);
  for (let i = 0; i < retries; i++) {
    try {
      const r = await cosRequest('PUT', body);
      if (r.status === 200) { cache = data; return true; }
    } catch (e) {}
    await sleep(500 * Math.pow(2, i));
  }
  return false;
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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
  try { if (rawBody) body = JSON.parse(rawBody); } catch (e) {}

  if (url.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && url === '/api/version') {
        const d = await loadFromCOS();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: d.version, records: d.main.length }));
        return;
      }
      if (req.method === 'GET' && url === '/api/data') {
        const d = await loadFromCOS();
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
    } catch (e) {
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
  } catch (e) {
    res.writeHead(500);
    res.end('Error');
  }
}
