// api/data.js — Vercel Serverless Function
// Uses JSONBin.io as free storage.
//
// Required environment variables in Vercel dashboard:
//   JSONBIN_API_KEY   — your JSONBin.io master key (jsonbin.io → API Keys)
//   JSONBIN_BIN_ID    — must be: $2a$10$QmBrFHFh.W.mnooABLA3Ku4T3f3GBJz7EQn8eSvN3ZF/dzL4RsmmC
//   API_SECRET        — must be: 2026events

const JSONBIN_KEY  = process.env.JSONBIN_API_KEY;
const JSONBIN_BIN  = process.env.JSONBIN_BIN_ID;
const API_SECRET   = process.env.API_SECRET;
const JSONBIN_BASE = 'https://api.jsonbin.io/v3';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');
}

module.exports = async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Auth check ────────────────────────────────────────────────────────────
  const incoming = req.headers['x-api-secret'];
  if (API_SECRET && incoming !== API_SECRET) {
    console.error('[auth] Rejected. Expected:', API_SECRET, '| Got:', incoming);
    return res.status(401).json({ error: 'Unauthorized — API secret mismatch' });
  }

  // ── Env var check ─────────────────────────────────────────────────────────
  if (!JSONBIN_KEY) {
    console.error('[env] JSONBIN_API_KEY is not set');
    return res.status(500).json({ error: 'JSONBIN_API_KEY not set in Vercel Environment Variables' });
  }

  console.log('[request]', req.method, '| BIN_ID:', JSONBIN_BIN || '(not set — will create on first POST)');

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!JSONBIN_BIN) {
      console.log('[get] No bin ID set yet — returning empty');
      return res.status(200).json({ pool: null, savedAt: null });
    }
    try {
      const url = `${JSONBIN_BASE}/b/${JSONBIN_BIN}/latest`;
      console.log('[get] Fetching:', url);
      const r = await fetch(url, {
        headers: { 'X-Master-Key': JSONBIN_KEY }
      });
      console.log('[get] JSONBin status:', r.status);
      if (r.status === 404) return res.status(200).json({ pool: null, savedAt: null });
      if (!r.ok) {
        const text = await r.text();
        console.error('[get] JSONBin error:', text);
        return res.status(500).json({ error: `JSONBin GET failed: ${r.status} — ${text}` });
      }
      const j = await r.json();
      return res.status(200).json(j.record || { pool: null, savedAt: null });
    } catch(e) {
      console.error('[get] Exception:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const { pool } = req.body || {};
      if (!Array.isArray(pool)) {
        console.error('[post] Invalid body — pool is not an array:', typeof pool);
        return res.status(400).json({ error: 'Request body must include a pool array' });
      }
      console.log('[post] Saving', pool.length, 'events');

      const savedAt = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
      });
      const data = { pool, savedAt, updatedAt: Date.now() };

      // Update existing bin
      if (JSONBIN_BIN) {
        const url = `${JSONBIN_BASE}/b/${JSONBIN_BIN}`;
        console.log('[post] Updating bin:', url);
        const r = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': JSONBIN_KEY
          },
          body: JSON.stringify(data)
        });
        console.log('[post] JSONBin PUT status:', r.status);
        if (!r.ok) {
          const text = await r.text();
          console.error('[post] JSONBin PUT error:', text);
          return res.status(500).json({ error: `JSONBin PUT failed: ${r.status} — ${text}` });
        }
        return res.status(200).json({ ok: true, savedAt, updatedAt: data.updatedAt });
      }

      // Create new bin
      console.log('[post] No bin ID — creating new bin');
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
      console.log('[post] JSONBin CREATE status:', r.status);
      if (!r.ok) {
        const text = await r.text();
        console.error('[post] JSONBin CREATE error:', text);
        return res.status(500).json({ error: `JSONBin CREATE failed: ${r.status} — ${text}` });
      }
      const j = await r.json();
      const newBinId = j.metadata?.id;
      console.log('[post] New bin created:', newBinId);
      return res.status(200).json({
        ok: true,
        savedAt,
        updatedAt: data.updatedAt,
        binId: newBinId,
        note: `IMPORTANT: Add JSONBIN_BIN_ID=${newBinId} to your Vercel Environment Variables, then redeploy`
      });

    } catch(e) {
      console.error('[post] Exception:', e.message, e.stack);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
