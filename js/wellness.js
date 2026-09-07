// wellness.js — movement (steps/workouts) + sleep data layer
//
// GUARDRAIL: This data is behavioral CONTEXT, never a spendable budget.
// A workout's `calories` field is stored for display only — it must never be
// added to the food calorie budget. Crediting exercise calories triggers the
// well-documented compensation effect (people overestimate burn 2–4x and the
// "earned it" snack flips a deficit day into a surplus). The app is
// intentionally one-sided: precise about intake, silent about burn.
//
// Wellness records are keyed by date (YYYY-MM-DD), mirroring `days` but kept in
// a separate localStorage key / Firestore collection. This isolation matters:
// wellness is written by the nightly sync worker (Apple Health → Shortcut →
// HTTP function), while `days` is written constantly by the app. Separate docs
// avoid the two writers clobbering each other.

const WELLNESS_KEY = 'mt_wellness';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded — consider pruning old wellness data');
    } else {
      console.warn('wellness write failed:', e);
    }
  }
}

// ── Shape ──
//
// A wellness record for a single date looks like:
// {
//   date: '2026-09-07',
//   steps: 8432,
//   activeMinutes: 47,        // Garmin intensity/active minutes
//   sleepMinutes: 412,        // total sleep duration
//   sleepScore: 78,           // optional 0–100 (Garmin sleep score)
//   restingHR: 54,            // optional
//   bodyBattery: 61,          // optional Garmin metric
//   workouts: [               // discrete activities (may be empty)
//     { type: 'run', durationMin: 32, distanceKm: 5.1, calories: 410 }
//   ],
//   source: 'manual' | 'garmin' | 'applehealth',
//   updatedAt: '2026-09-07T09:00:00.000Z'
// }
//
// Every field except `date` is optional — a day may have only steps, or only
// sleep, depending on what the source reported.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(d) {
  return typeof d === 'string' && DATE_RE.test(d);
}

// ── CRUD ──

export function getAllWellness() {
  return read(WELLNESS_KEY) || {};
}

export function getWellness(dateStr) {
  return getAllWellness()[dateStr] || null;
}

// Replace the full record for a date.
export function saveWellness(dateStr, record) {
  if (!isValidDate(dateStr)) return null;
  const all = getAllWellness();
  const clean = { ...record, date: dateStr, updatedAt: new Date().toISOString() };
  all[dateStr] = clean;
  write(WELLNESS_KEY, all);
  return clean;
}

// Merge partial fields into an existing record (or create one). Used by the
// sync worker, which may report steps and sleep in separate pushes.
export function mergeWellness(dateStr, partial) {
  if (!isValidDate(dateStr)) return null;
  const all = getAllWellness();
  const existing = all[dateStr] || { date: dateStr };
  const merged = { ...existing, ...partial, date: dateStr, updatedAt: new Date().toISOString() };
  all[dateStr] = merged;
  write(WELLNESS_KEY, all);
  return merged;
}

export function deleteWellness(dateStr) {
  const all = getAllWellness();
  if (all[dateStr]) {
    delete all[dateStr];
    write(WELLNESS_KEY, all);
  }
}

// Replace the entire store (used when pulling from cloud).
export function replaceAllWellness(obj) {
  const normalized = {};
  for (const [date, rec] of Object.entries(obj || {})) {
    if (isValidDate(date)) normalized[date] = { ...rec, date };
  }
  write(WELLNESS_KEY, normalized);
}

// ── Range / stats ──

// Inclusive range, returns records sorted oldest → newest. Dates with no
// wellness record are omitted (caller decides how to treat gaps).
export function getWellnessForRange(startDate, endDate) {
  const all = getAllWellness();
  return Object.values(all)
    .filter(r => r.date >= startDate && r.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Rolling-window summary. Averages ignore days that lack the metric, so a
// missing sleep night doesn't drag the average to zero — it just isn't counted.
export function getWellnessStats(days = 7, fromDate = null) {
  const end = fromDate || new Date().toISOString().split('T')[0];
  const start = shiftBack(end, days - 1);
  const records = getWellnessForRange(start, end);

  const avg = (field) => {
    const vals = records.map(r => r[field]).filter(v => typeof v === 'number' && isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  const workoutDays = records.filter(r => Array.isArray(r.workouts) && r.workouts.length > 0).length;

  return {
    window: days,
    start,
    end,
    daysWithData: records.length,
    avgSteps: round(avg('steps')),
    avgActiveMinutes: round(avg('activeMinutes')),
    avgSleepMinutes: round(avg('sleepMinutes')),
    avgSleepScore: round(avg('sleepScore')),
    workoutDays,
    records,
  };
}

function round(v) {
  return v === null ? null : Math.round(v);
}

function shiftBack(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

// ── Import parsing ──
//
// Manual import is the Phase 1 ingest path (and a permanent fallback). It
// accepts either JSON or CSV so we can seed the app from a Garmin CSV export or
// a hand-built file before the nightly Shortcut is wired up. The parsers are
// deliberately tolerant: unknown columns are ignored, and any recognized field
// that isn't a valid number is simply dropped.

function num(v) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : undefined;
}

// Map many header spellings to our canonical field names.
const HEADER_MAP = {
  date: 'date',
  steps: 'steps',
  step: 'steps',
  activeminutes: 'activeMinutes',
  active_minutes: 'activeMinutes',
  activemin: 'activeMinutes',
  intensityminutes: 'activeMinutes',
  intensity_minutes: 'activeMinutes',
  sleepminutes: 'sleepMinutes',
  sleep_minutes: 'sleepMinutes',
  sleepmin: 'sleepMinutes',
  sleephours: 'sleepHours',
  sleep_hours: 'sleepHours',
  sleepscore: 'sleepScore',
  sleep_score: 'sleepScore',
  sleepquality: 'sleepScore',
  restinghr: 'restingHR',
  resting_hr: 'restingHR',
  rhr: 'restingHR',
  bodybattery: 'bodyBattery',
  body_battery: 'bodyBattery',
  workout: 'workoutType',
  workouttype: 'workoutType',
  workout_type: 'workoutType',
  activity: 'workoutType',
  workoutmin: 'workoutMin',
  workout_min: 'workoutMin',
  workoutduration: 'workoutMin',
  workoutdurationmin: 'workoutMin',
  workoutcalories: 'workoutCalories',
  workout_calories: 'workoutCalories',
  workoutcal: 'workoutCalories',
  workoutdistancekm: 'workoutDistanceKm',
  workout_distance_km: 'workoutDistanceKm',
};

const NUMERIC_FIELDS = ['steps', 'activeMinutes', 'sleepMinutes', 'sleepScore', 'restingHR', 'bodyBattery'];

// Build a canonical record from a flat key→value object (one CSV row or one
// flat JSON object). Returns null if there's no usable date.
function recordFromFlat(flat) {
  const date = typeof flat.date === 'string' ? flat.date.trim() : flat.date;
  if (!isValidDate(date)) return null;

  const rec = { date };
  for (const f of NUMERIC_FIELDS) {
    const n = num(flat[f]);
    if (n !== undefined) rec[f] = n;
  }
  // sleepHours → sleepMinutes (only if minutes not already given)
  if (rec.sleepMinutes === undefined) {
    const h = num(flat.sleepHours);
    if (h !== undefined) rec.sleepMinutes = Math.round(h * 60);
  }
  // Single inline workout from flat columns
  const wType = flat.workoutType ? String(flat.workoutType).trim() : '';
  if (wType) {
    const w = { type: wType };
    const durMin = num(flat.workoutMin);
    if (durMin !== undefined) w.durationMin = durMin;
    const wCal = num(flat.workoutCalories);
    if (wCal !== undefined) w.calories = wCal;
    const wDist = num(flat.workoutDistanceKm);
    if (wDist !== undefined) w.distanceKm = wDist;
    rec.workouts = [w];
  }
  // Pass through an explicit workouts array if present (JSON path)
  if (Array.isArray(flat.workouts)) rec.workouts = flat.workouts;
  return rec;
}

// Minimal CSV parser (handles simple quoted fields). Returns array of records.
export function parseWellnessCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map(h => HEADER_MAP[h.toLowerCase().trim()] || null);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const flat = {};
    headers.forEach((h, idx) => {
      if (h) flat[h] = cells[idx];
    });
    const rec = recordFromFlat(flat);
    if (rec) records.push(rec);
  }
  return records;
}

function splitCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// Accepts a JSON array of records, or an object keyed by date.
export function parseWellnessJSON(text) {
  const data = JSON.parse(text);
  let rows;
  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === 'object') {
    rows = Object.entries(data).map(([date, rec]) => ({ date, ...rec }));
  } else {
    return [];
  }
  return rows.map(recordFromFlat).filter(Boolean);
}

// Auto-detect JSON vs CSV and parse into canonical records.
export function parseWellnessImport(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];
  if (trimmed[0] === '[' || trimmed[0] === '{') {
    return parseWellnessJSON(trimmed);
  }
  return parseWellnessCSV(trimmed);
}

// Parse + persist. Merges into existing records so a steps-only import doesn't
// wipe a day's sleep. Returns { imported, dates, error }.
export function importWellness(text) {
  let records;
  try {
    records = parseWellnessImport(text);
  } catch (e) {
    return { imported: 0, dates: [], error: `Could not parse: ${e.message}` };
  }
  if (!records.length) {
    return { imported: 0, dates: [], error: 'No valid rows found. Need a `date` column (YYYY-MM-DD).' };
  }
  const dates = [];
  for (const rec of records) {
    const { date, ...fields } = rec;
    mergeWellness(date, { ...fields, source: fields.source || 'manual' });
    dates.push(date);
  }
  return { imported: dates.length, dates, error: null };
}
