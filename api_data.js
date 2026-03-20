// api/data.js — Vercel Serverless Function
// Uses JSONBin.io as free storage.
//
// Environment variables in Vercel dashboard:
//   JSONBIN_API_KEY   — your JSONBin.io master key (jsonbin.io → API Keys)
//   JSONBIN_BIN_ID    — created automatically on first save, or paste existing ID
//   API_SECRET        — must match the secret hardcoded in index.html (2026events)

const JSONBIN_KEY  = process.env.JSONBIN_API_KEY;
const JSONBIN_BIN  = process.env.JSONBIN_BIN_ID;
const API_SECRET   = process.env.API_SECRET;
const JSONBIN_BASE = 'https://api.jsonbin.io/v3';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');
}

function isAuthed(req) {
  return !API_SECRET || req.headers['x-api-secret'] === API_SECRET;
}

async function binRead() {
  if (!JSONBIN_BIN) return null;
  const r = await fetch(`${JSONBIN_BASE}/b/${JSONBIN_BIN}/latest`, {
    headers: { 'X-Master-Key': JSONBIN_KEY }
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.record || null;
}

async function binWrite(data) {
  if (JSONBIN_BIN) {
    const r = await fetch(`${JSONBIN_BASE}/b/${JSONBIN_BIN}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_KEY
      },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(`JSONBin write failed: ${r.status}`);
    return { binId: JSONBIN_BIN };
  }
  // Create new bin on first save
  const r = await fetch(`${JSONBIN_BASE}/b`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': JSONBIN_KEY,
      'X-Bin-Name': 'event-dashboard',
      'X-Bin-Private': 'true'
    },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`JSONBin create failed: ${r.status}`);
  const j = await r.json();
  return { binId: j.metadata?.id, created: true };
}

module.exports = async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (!JSONBIN_KEY) {
    return res.status(500).json({
      error: 'JSONBIN_API_KEY not set — add it in Vercel Environment Variables'
    });
  }

  // GET — load data
  if (req.method === 'GET') {
    try {
      const record = await binRead();
      if (!record) return res.status(200).json({ pool: null, savedAt: null });
      return res.status(200).json(record);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — save data
  if (req.method === 'POST') {
    try {
      const { pool } = req.body;
      if (!Array.isArray(pool)) {
        return res.status(400).json({ error: 'pool must be an array' });
      }
      const savedAt = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
      });
      const data = { pool, savedAt, updatedAt: Date.now() };
      const result = await binWrite(data);
      return res.status(200).json({
        ok: true,
        savedAt,
        updatedAt: data.updatedAt,
        ...(result.created ? {
          binId: result.binId,
          note: `IMPORTANT: Add JSONBIN_BIN_ID=${result.binId} to Vercel env vars to persist this bin`
        } : {})
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
