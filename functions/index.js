// functions/index.js — nightly wellness sync endpoint
//
// Apple Health → nightly iOS Shortcut → THIS endpoint → Firestore
//   users/{uid}/wellness/{date} → the PWA reads it.
//
// The phone can't safely hold admin credentials, so this Cloud Function does
// the privileged write. Auth is a shared secret (SYNC_SECRET) sent as a header;
// the target user id is in the request body (single-user app — a leaked secret
// could only write nuisance wellness data, never read anything). Writes MERGE,
// so a steps-only push never wipes that day's sleep.
//
// Deploy + Shortcut setup: see functions/README.md.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const SYNC_SECRET = defineSecret('SYNC_SECRET');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : undefined);

exports.syncWellness = onRequest(
  { secrets: [SYNC_SECRET], region: 'us-central1', maxInstances: 3 },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'POST only' });
    }

    // Shared-secret auth (header preferred; body fallback for convenience).
    const provided = req.get('X-Sync-Secret') || (req.body && req.body.secret);
    if (!provided || provided !== SYNC_SECRET.value()) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const b = req.body || {};
    const uid = typeof b.uid === 'string' ? b.uid.trim() : '';
    if (!uid) return res.status(400).json({ error: 'uid required' });

    // Normalize the date. iOS Shortcuts serializes a Date variable as a full
    // ISO timestamp ("2026-09-06T03:00:00Z") even when it's displayed as a plain
    // date, so accept either and keep just the calendar-date part. Fall back to
    // parsing other date strings.
    let date = typeof b.date === 'string' ? b.date.trim() : '';
    const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    } else if (date) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        const p = (n) => String(n).padStart(2, '0');
        date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      }
    }
    // No usable date from the client — default to yesterday (UTC). iOS Shortcuts'
    // date-variable plumbing is finicky, and a nightly 3am-local run always means
    // "yesterday," so the client can omit the date entirely and let the server
    // stamp it. An explicit valid date is still honored.
    if (!DATE_RE.test(date)) {
      const p = (n) => String(n).padStart(2, '0');
      const y = new Date(Date.now() - 86400000);
      date = `${y.getUTCFullYear()}-${p(y.getUTCMonth() + 1)}-${p(y.getUTCDate())}`;
    }

    // Build a sanitized record. Every field except date is optional — the
    // Shortcut may report only what Apple Health had for that day.
    const rec = { date, source: b.source || 'applehealth', updatedAt: new Date().toISOString() };
    for (const f of ['steps', 'activeMinutes', 'sleepMinutes', 'sleepScore', 'restingHR', 'bodyBattery']) {
      const n = num(b[f]);
      if (n !== undefined) rec[f] = n;
    }
    // Accept sleepHours as a convenience (Shortcuts often has hours).
    if (rec.sleepMinutes === undefined && num(b.sleepHours) !== undefined) {
      rec.sleepMinutes = Math.round(b.sleepHours * 60);
    }
    if (Array.isArray(b.workouts)) {
      rec.workouts = b.workouts.slice(0, 20).map((w) => {
        const o = { type: String((w && w.type) || 'workout').slice(0, 40) };
        const d = num(w && w.durationMin); if (d !== undefined) o.durationMin = d;
        const c = num(w && w.calories); if (c !== undefined) o.calories = c;
        const dist = num(w && w.distanceKm); if (dist !== undefined) o.distanceKm = dist;
        return o;
      });
    }

    try {
      await db.doc(`users/${uid}/wellness/${date}`).set(rec, { merge: true });
      return res.json({ ok: true, date });
    } catch (e) {
      console.error('wellness write failed', e);
      return res.status(500).json({ error: 'write failed' });
    }
  }
);
