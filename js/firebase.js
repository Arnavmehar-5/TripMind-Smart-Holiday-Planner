/**
 * TripMind — Firebase Service  (firebase.js)
 * ─────────────────────────────────────────────────────────────────────
 * Handles all Firestore database operations for TripMind.
 *
 * SETUP:
 *   1. Go to https://console.firebase.google.com
 *   2. Create project → Add web app → copy config into js/config.js
 *   3. Build → Firestore Database → Create database → Test mode
 *   4. That's it — collections below are created automatically.
 *
 * FIRESTORE COLLECTIONS:
 *   trips/        → one document per saved trip
 *   alerts/       → single doc "user_prefs" for alert settings
 *
 * DOCUMENT SHAPE (trips):
 *   {
 *     origin:       string   "Hyderabad, India"
 *     destination:  string   "Goa, India"
 *     startDate:    string   "2026-03-24"
 *     endDate:      string   "2026-03-28"
 *     travelers:    string   "Family (4)"
 *     budget:       string   "Mid-range (₹10–30k)"
 *     safetyScore:  number   73
 *     duration:     number   5  (days)
 *     status:       string   "planned" | "completed" | "cancelled"
 *     createdAt:    Timestamp (server-generated)
 *   }
 * ─────────────────────────────────────────────────────────────────────
 */

// Firestore instance — set by initFirebase()
let db = null;

// ── INITIALISE ────────────────────────────────────────────────────────────

/**
 * Initialise Firebase app and Firestore.
 * Called once from main.js on DOMContentLoaded.
 * Safe to call multiple times — only initialises once.
 * @returns {boolean} true if connected successfully
 */
function initFirebase() {
  try {
    // Guard: Firebase SDK must be loaded via CDN in index.html
    if (typeof firebase === "undefined") {
      console.warn("⚠️ Firebase SDK not loaded. Add these to index.html:\n" +
        "  <script src='https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js'></script>\n" +
        "  <script src='https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'></script>");
      return false;
    }

    // Guard: API keys must be set in config.js
    if (!CONFIG.FIREBASE.projectId || CONFIG.FIREBASE.projectId.includes("YOUR_")) {
      console.warn("⚠️ Firebase config not set. Open js/config.js and fill in FIREBASE values.");
      return false;
    }

    // Prevent double-initialisation
    if (!firebase.apps.length) {
      firebase.initializeApp(CONFIG.FIREBASE);
    }

    db = firebase.firestore();
    console.log("✅ Firebase Firestore connected →", CONFIG.FIREBASE.projectId);
    return true;

  } catch (e) {
    console.error("Firebase init failed:", e.message);
    return false;
  }
}

// ── TRIP CRUD ─────────────────────────────────────────────────────────────

/**
 * Save a new trip plan to the "trips" collection.
 * Automatically adds createdAt timestamp and status = "planned".
 * @param {Object} data - trip fields (see document shape above)
 * @returns {string|null} Firestore document ID, or null on failure
 */
async function saveTrip(data) {
  if (!db) {
    showToast("Firebase not configured — open js/config.js", "error");
    return null;
  }
  try {
    const ref = await db.collection("trips").add({
      origin:       data.origin       || "",
      destination:  data.destination  || "",
      startDate:    data.startDate    || "",
      endDate:      data.endDate      || "",
      travelers:    data.travelers    || "",
      budget:       data.budget       || "",
      safetyScore:  data.safetyScore  ?? null,
      duration:     data.duration     ?? null,
      status:       "planned",
      createdAt:    firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log("Trip saved:", ref.id);
    return ref.id;
  } catch (e) {
    console.error("saveTrip:", e.message);
    return null;
  }
}

/**
 * Load all saved trips, newest first, capped at 20.
 * @returns {Array<Object>} array of trip objects with .id field
 */
async function loadTripHistory() {
  if (!db) return [];
  try {
    const snap = await db.collection("trips")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("loadTripHistory:", e.message);
    return [];
  }
}

/**
 * Permanently delete a trip document.
 * @param {string} id - Firestore document ID
 */
async function deleteTrip(id) {
  if (!db || !id) return;
  try {
    await db.collection("trips").doc(id).delete();
    console.log("Deleted trip:", id);
  } catch (e) {
    console.error("deleteTrip:", e.message);
  }
}

/**
 * Update the status of a trip.
 * @param {string} id     - Firestore document ID
 * @param {string} status - "planned" | "completed" | "cancelled"
 */
async function updateTripStatus(id, status) {
  if (!db || !id) return;
  try {
    await db.collection("trips").doc(id).update({ status });
  } catch (e) {
    console.error("updateTripStatus:", e.message);
  }
}

// ── ALERT PREFERENCES ─────────────────────────────────────────────────────

/**
 * Save user alert preferences to the "alerts" collection.
 * Uses merge:true so partial updates don't wipe existing fields.
 * @param {Object} prefs
 */
async function saveAlertPrefs(prefs) {
  if (!db) return;
  try {
    await db.collection("alerts").doc("user_prefs").set(prefs, { merge: true });
    console.log("Alert prefs saved");
  } catch (e) {
    console.error("saveAlertPrefs:", e.message);
  }
}

/**
 * Load saved alert preferences.
 * @returns {Object|null} prefs object, or null if not found
 */
async function loadAlertPrefs() {
  if (!db) return null;
  try {
    const doc = await db.collection("alerts").doc("user_prefs").get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    console.error("loadAlertPrefs:", e.message);
    return null;
  }
}

// ── RENDER HISTORY UI ─────────────────────────────────────────────────────

/**
 * Fetch all trips and render them into #tripHistoryList.
 * Called by showTab("history") in main.js.
 */
async function renderTripHistory() {
  const container = document.getElementById("tripHistoryList");
  if (!container) return;

  // Show loading state
  container.innerHTML = `<div class="loading-spinner">Loading trips from Firebase…</div>`;

  // If Firebase isn't configured, show a helpful message
  if (!db) {
    container.innerHTML = `
      <div class="alert alert-warn">
        <span class="alert-icon">⚠️</span>
        <div>
          <strong>Firebase not connected.</strong><br>
          Open <code style="font-size:12px;background:rgba(255,179,71,.15);padding:1px 6px;border-radius:4px">js/config.js</code>
          and fill in the <code style="font-size:12px;background:rgba(255,179,71,.15);padding:1px 6px;border-radius:4px">FIREBASE</code>
          block with your project credentials.
        </div>
      </div>`;
    return;
  }

  const trips = await loadTripHistory();

  if (!trips.length) {
    container.innerHTML = `
      <div class="empty-state">
        No saved trips yet.<br>
        <span style="font-size:13px;color:var(--muted)">Fill in your trip details above and click 💾 Save Trip.</span>
      </div>`;
    return;
  }

  container.innerHTML = trips.map(t => `
    <div class="history-card" id="trip-${t.id}">

      <div class="history-header">
        <div>
          <span class="history-route">${t.origin || "—"} → ${t.destination || "—"}</span>
          <span class="history-dates">${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}</span>
        </div>
        <div class="history-meta">
          <span class="safety-badge ${sbClass(t.safetyScore)}">${t.safetyScore ?? "—"}/100</span>
          <span class="status-badge status-${t.status || "planned"}">${t.status || "planned"}</span>
        </div>
      </div>

      <div class="history-body">
        <span>👥 ${t.travelers || "—"}</span>
        <span>💰 ${t.budget   || "—"}</span>
        <span>📅 ${t.duration ?? "—"} days</span>
        <span style="margin-left:auto;font-size:11px;color:var(--muted)">${fmtTimestamp(t.createdAt)}</span>
      </div>

      <div class="history-actions">
        <button class="btn btn-sm btn-primary" onclick="reloadTrip('${t.id}')">↩ Reload</button>
        <button class="btn btn-sm btn-ghost"   onclick="markDone('${t.id}')">✅ Complete</button>
        <button class="btn btn-sm btn-ghost"   onclick="cancelTrip('${t.id}')"
          style="color:var(--warn);border-color:rgba(255,179,71,.3)">✕ Cancel</button>
        <button class="btn btn-sm btn-danger"  onclick="removeTrip('${t.id}')">🗑 Delete</button>
      </div>

    </div>
  `).join("");
}

// ── HISTORY ACTION HANDLERS ───────────────────────────────────────────────

/** Confirm + delete a trip */
async function removeTrip(id) {
  if (!confirm("Permanently delete this trip from history?")) return;
  await deleteTrip(id);
  showToast("Trip deleted");
  renderTripHistory();
}

/** Mark a trip as completed */
async function markDone(id) {
  await updateTripStatus(id, "completed");
  showToast("Marked as completed ✅");
  renderTripHistory();
}

/** Mark a trip as cancelled */
async function cancelTrip(id) {
  await updateTripStatus(id, "cancelled");
  showToast("Trip marked as cancelled");
  renderTripHistory();
}

/**
 * Load a saved trip back into the main trip setup form and refresh the dashboard.
 * @param {string} id - Firestore document ID
 */
function reloadTrip(id) {
  if (!db) return;
  db.collection("trips").doc(id).get().then(doc => {
    if (!doc.exists) { showToast("Trip not found", "error"); return; }
    const t = doc.data();

    // Fill in all form fields
    const fields = ["origin", "destination", "startDate", "endDate", "travelers", "budget"];
    fields.forEach(key => {
      const el = document.getElementById(key);
      if (el && t[key]) el.value = t[key];
    });

    // Switch to dashboard and reload all data
    showTab("dashboard");
    refreshDashboard();
    showToast(`Trip to ${t.destination} reloaded 🗺️`);
  }).catch(e => {
    console.error("reloadTrip:", e.message);
    showToast("Could not reload trip", "error");
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────

/**
 * Format a date string "YYYY-MM-DD" → "24 Mar '26"
 */
function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "2-digit"
    });
  } catch { return d; }
}

/**
 * Format a Firestore Timestamp → "23 Mar 2026"
 * Falls back to empty string if timestamp not yet written.
 */
function fmtTimestamp(ts) {
  if (!ts) return "";
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric"
    });
  } catch { return ""; }
}

/**
 * Return CSS class for the safety score badge.
 * @param {number|null} score
 */
function sbClass(score) {
  if (score == null) return "";
  if (score >= 70) return "safe";
  if (score >= 40) return "moderate";
  return "risky";
}
