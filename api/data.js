// api/data.js — Vercel Serverless Function
// JSONBin.io credentials are hardcoded below.
// Replace JSONBIN_KEY with your new master key after revoking the old one.
// Replace JSONBIN_BIN with your bin ID once created (see instructions below).
//
// To create a bin ID:
//   1. Set JSONBIN_KEY to your new master key
//   2. Deploy and open: https://your-app.vercel.app/api/data/init
//   3. That will create the bin and return the bin ID
//   4. Paste the bin ID into JSONBIN_BIN below and redeploy

const JSONBIN_KEY  = '$2a$10$ka/Yb5bMEGPaOPNtkmqtgOfdXhFzbtmQKJ00yn4djYWrsl3fpblwO';
const JSONBIN_BIN  = '';   // paste bin ID here after running /api/data/init
const API_SECRET   = '2026events';
const JSONBIN_BASE = 'https://api.jsonbin.io/v3';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');
}

module.exports = async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // /api/data/init — creates a new bin and returns its ID
  // Visit this URL once in your browser after first deploy to get the bin ID
  if (req.url && req.url.includes('/init')) {
    try {
      const r = await fetch(`${JSONBIN_BASE}/b`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': JSONBIN_KEY,
          'X-Bin-Name': 'event-dashboard',
          'X-Bin-Private': 'true'
        },
        body: JSON.stringify({ pool: null, savedAt: null, updatedAt: Date.now() })
      });
      const j = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'JSONBin create failed', detail: j });
      const binId = j.metadata?.id;
      return res.status(200).json({
        ok: true,
        binId,
        instruction: `Bin created. Now paste this into JSONBIN_BIN in api/data.js: ${binId}`
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Auth
  const incoming = req.headers['x-api-secret'];
  if (incoming !== API_SECRET) {
    console.error('[auth] Rejected. Got:', incoming);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!JSONBIN_KEY || JSONBIN_KEY === 'PASTE_YOUR_NEW_MASTER_KEY_HERE') {
    return res.status(500).json({ error: 'JSONBIN_KEY not set in api/data.js' });
  }

  // GET
  if (req.method === 'GET') {
    if (!JSONBIN_BIN) {
      return res.status(200).json({
        pool: null, savedAt: null,
        hint: 'No bin ID set — visit /api/data/init to create one'
      });
    }
    try {
      const r = await fetch(`${JSONBIN_BASE}/b/${JSONBIN_BIN}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_KEY }
      });
      console.log('[GET] JSONBin status:', r.status);
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: `JSONBin GET failed: ${r.status}`, detail: t });
      }
      const j = await r.json();
      return res.status(200).json(j.record || { pool: null, savedAt: null });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST
  if (req.method === 'POST') {
    try {
      const { pool } = req.body || {};
      if (!Array.isArray(pool)) {
        return res.status(400).json({ error: 'pool must be an array' });
      }
      const savedAt = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
      });
      const data = { pool, savedAt, updatedAt: Date.now() };

      if (JSONBIN_BIN) {
        const r = await fetch(`${JSONBIN_BASE}/b/${JSONBIN_BIN}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
          body: JSON.stringify(data)
        });
        console.log('[POST] JSONBin PUT status:', r.status);
        if (!r.ok) {
          const t = await r.text();
          return res.status(500).json({ error: `JSONBin PUT failed: ${r.status}`, detail: t });
        }
        return res.status(200).json({ ok: true, savedAt, updatedAt: data.updatedAt });
      }

      // No bin ID — create one automatically
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
      console.log('[POST] JSONBin CREATE status:', r.status);
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: `JSONBin CREATE failed: ${r.status}`, detail: t });
      }
      const j = await r.json();
      const newBinId = j.metadata?.id;
      console.log('[POST] Created bin:', newBinId);
      return res.status(200).json({
        ok: true, savedAt, updatedAt: data.updatedAt, binId: newBinId,
        note: `Bin created: ${newBinId} — paste this into JSONBIN_BIN in api/data.js and redeploy`
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
