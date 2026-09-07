# Wellness auto-sync (Phase 3)

Nightly pipe: **Apple Health → iOS Shortcut → this Cloud Function → Firestore `users/{uid}/wellness/{date}` → the PWA**.

The function (`index.js`, `syncWellness`) takes a POST, checks a shared secret, and
merge-writes a wellness record. Merge means a steps-only push never wipes that
day's sleep.

---

## 1. Deploy the function (one time, on your Mac)

**Prereqs:** Node 20+, and the project on the **Blaze** plan (Cloud Functions
require it; this workload — one write a night — stays inside the always-free
tier, so real cost is ~$0). Upgrade at
Firebase Console → ⚙︎ → Usage and billing → Modify plan.

```bash
npm install -g firebase-tools          # Firebase CLI
firebase login                          # sign in as the project owner
cd functions && npm install && cd ..    # install function deps
```

Set the shared secret (generate a strong one first, e.g. `openssl rand -base64 32`):

```bash
firebase functions:secrets:set SYNC_SECRET
# paste the secret when prompted — SAVE IT, the Shortcut needs it too
```

Deploy:

```bash
firebase deploy --only functions
```

Copy the **function URL** from the output — it looks like
`https://us-central1-meal-tracker-f3bea.cloudfunctions.net/syncWellness`
(or a `…-uc.a.run.app` URL). You'll need it for the Shortcut.

## 2. Get your Sync ID

Open the app → sign in → **Goals → Wellness Data → copy the Sync ID**
(that's your Firebase user id).

## 3. Smoke-test before building the Shortcut

```bash
curl -X POST "<FUNCTION_URL>" \
  -H "X-Sync-Secret: <YOUR_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"uid":"<YOUR_SYNC_ID>","date":"2026-09-06","steps":8500,"sleepMinutes":420,"activeMinutes":45,"source":"applehealth"}'
```

Expect `{"ok":true,"date":"2026-09-06"}`. Reload the app (signed in) and that
day should appear in the wellness data.

---

## 4. Build the nightly iOS Shortcut (on your iPhone)

Shortcuts app → **Automation** tab → **＋** → **Time of Day** → 3:00 AM, Daily →
turn **Run Immediately** on (and "Notify When Run" off if you don't want a daily
banner). Then add these actions to the shortcut it creates:

1. **Date** → then **Format Date**: format the date as `yyyy-MM-dd`. First adjust
   it to *yesterday* (Date action → "Get dates" or subtract 1 day) so you sync a
   complete day. Call the result **SyncDate**.

2. **Find Health Samples** — Type **Steps**, Start Date = start of yesterday, End
   Date = end of yesterday. Then **Calculate Statistics** → **Sum** → **Steps**.

3. **Find Health Samples** — Type **Sleep Analysis** (Asleep) for yesterday →
   **Calculate Statistics** → **Total Duration**, then convert to minutes →
   **SleepMinutes**. (Sleep actions vary by iOS version; if it's fussy, skip it —
   the record is happy with just steps.)

4. *(optional)* **Find Health Samples** — **Active Energy** or intensity minutes →
   **ActiveMinutes**.

5. **Dictionary** — build the body:
   - `uid` → your Sync ID (paste the string)
   - `date` → **SyncDate**
   - `steps` → **Steps**
   - `sleepMinutes` → **SleepMinutes**
   - `activeMinutes` → **ActiveMinutes**
   - `source` → `applehealth`

6. **Get Contents of URL**:
   - URL: your **function URL**
   - Method: **POST**
   - Headers: `X-Sync-Secret` = your secret
   - Request Body: **JSON** → select the **Dictionary** from step 5

That's it. It fires nightly; if the phone is asleep it catches up next run, and
because it syncs *yesterday* it's never racing a partial day.

### Notes
- Numbers only for numeric fields — the function drops anything non-numeric.
- Workouts are optional/advanced: add a `workouts` array of
  `{type, durationMin, calories}` if you want them; otherwise omit.
- Security: the secret is the only gate. Keep it private. If it ever leaks, run
  `firebase functions:secrets:set SYNC_SECRET` with a new value and redeploy —
  a leaked secret could only write nuisance wellness data, never read anything.
