const BLOB_ID = '019f4c85-55fd-77f7-939b-15b52add4bce';
const BLOB_URL = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;

async function loadFromBlob() {
  try {
    const res = await fetch(BLOB_URL, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('load failed');
    return await res.json();
  } catch(e) {
    // Return minimal fallback on error
    return {
      version: 1,
      main: [
        {id:1,date:'2026-06-23',style:'DC1015',qty:'11（齐色）',inPerson:'吴文校',outDate:'',outPerson:'',location:'仓库',imgStatus:'已交付',shootType:'定稿样拍摄',colorStatus:'齐色',remark:'收到',imageUrl:'',extra:''},
      ],
      delivery: []
    };
  }
}

async function saveToBlob(data) {
  try {
    const res = await fetch(BLOB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch(e) { return false; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export default async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const parts = path.split('/').filter(Boolean);

  let body = {};
  try { if (request.body) body = await request.json(); } catch(e) {}

  // GET /api/version
  if (request.method === 'GET' && path === '/api/version') {
    const d = await loadFromBlob();
    return json({ version: d.version });
  }

  // GET /api/data
  if (request.method === 'GET' && path === '/api/data') {
    const d = await loadFromBlob();
    return json(d);
  }

  // POST /api/records
  if (request.method === 'POST' && path === '/api/records') {
    let d = await loadFromBlob();
    let rec = body.record || {};
    rec.id = Date.now();
    d[body.sheet || 'main'] = d[body.sheet || 'main'] || [];
    d[body.sheet || 'main'].push(rec);
    d.version = (d.version || 0) + 1;
    const ok = await saveToBlob(d);
    if (!ok) return json({ error: 'Save failed' }, 500);
    return json({ success: true, record: rec, version: d.version });
  }

  // PUT /api/records/:sheet/:id/field
  if (request.method === 'PUT' && parts.length >= 5 && parts[0] === 'api' && parts[1] === 'records' && parts[4] === 'field') {
    let d = await loadFromBlob();
    let sheet = parts[2], rid = parseInt(parts[3]);
    let rec = (d[sheet] || []).find(r => r.id === rid);
    if (rec) {
      rec[body.field] = body.value;
      d.version = (d.version || 0) + 1;
      const ok = await saveToBlob(d);
      if (!ok) return json({ error: 'Save failed' }, 500);
      return json({ success: true, record: rec, version: d.version });
    }
    return json({ error: 'not found' }, 404);
  }

  // DELETE /api/records/:sheet/:id
  if (request.method === 'DELETE' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'records') {
    let d = await loadFromBlob();
    let sheet = parts[2], rid = parseInt(parts[3]);
    d[sheet] = (d[sheet] || []).filter(r => r.id !== rid);
    d.version = (d.version || 0) + 1;
    const ok = await saveToBlob(d);
    if (!ok) return json({ error: 'Save failed' }, 500);
    return json({ success: true, version: d.version });
  }

  // Not found
  return json({ error: 'API not found', path }, 404);
}
