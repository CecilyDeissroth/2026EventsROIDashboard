// api/data.js — Vercel Serverless Function (free Hobby plan compatible)
// Uses JSONBin.io as free storage (no credit card needed).
// Clients poll /api/data every 5s for near-real-time multi-user sync.
//
// Environment variables — set these in your Vercel project dashboard:
//
//   JSONBIN_API_KEY   Your JSONBin.io master key (from jsonbin.io/app/api-keys)
//   JSONBIN_BIN_ID    Created automatically on first POST if left blank,
//                     or paste an existing bin ID here
//   API_SECRET        Any string you choose — all team members enter this once
//                     in the dashboard settings. Leave blank to disable auth.

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
  // Update existing bin
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
  const newId = j.metadata?.id;
  return { binId: newId, created: true };
}

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (!JSONBIN_KEY) {
    return res.status(500).json({
      error: 'JSONBIN_API_KEY not set — add it in Vercel Environment Variables'
    });
  }

  // ── GET: load current data ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const record = await binRead();
      if (!record) return res.status(200).json({ pool: null, savedAt: null });
      return res.status(200).json(record);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST: save new data ────────────────────────────────────────────────────
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
        ...(result.created ? { binId: result.binId, note: `Add JSONBIN_BIN_ID=${result.binId} to Vercel env vars` } : {})
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
