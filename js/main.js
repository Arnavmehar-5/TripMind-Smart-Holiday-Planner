/**
 * ═══════════════════════════════════════════════════════════════════
 *  TripMind — js/main.js
 *  ───────────────────────────────────────────────────────────────────
 *  App orchestrator — wires all APIs to the UI.
 *  Loaded LAST so CONFIG, api.js and firebase.js are all available.
 *
 *  BOOT SEQUENCE (DOMContentLoaded):
 *    1. initFirebase()          — connect to Firestore
 *    2. setDefaultDates()       — populate start/end date inputs
 *    3. renderPackingChecklist  — seed with defaults
 *    4. initMap()               — pre-load Leaflet tiles
 *    5. refreshDashboard()      — fetch all APIs and render
 *
 *  KEY FUNCTIONS:
 *    refreshDashboard()         main data fetch + render cycle
 *    showTab(name)              tab navigation (also fixes map display)
 *    renderSafetyMeter()        animate the SVG circle meter
 *    renderWeatherPanel()       fill weather stat grid (dashboard)
 *    mirrorWeatherTab()         fill the dedicated Weather tab
 *    renderForecastCards()      7-day forecast strip
 *    renderTrafficPanel()       distance / time / delay stats
 *    renderAlternateRoutes()    dynamic route options from ORS
 *    renderHolidayAlerts()      overlap warnings on Dashboard
 *    mirrorHolidayTab()         full holiday list + calendar
 *    buildCalendar()            month grid with trip + holiday days
 *    renderPackingChecklist()   weather-smart item list
 *    saveCurrentTrip()          save to Firebase via firebase.js
 *    saveAlerts()               save prefs to Firebase
 *    showToast(msg, type)       bottom-centre notification
 * ═══════════════════════════════════════════════════════════════════
 */

// ── App-wide state object ─────────────────────────────────────────────────
const state = {
  city:         CONFIG.DEFAULT_DESTINATION,
  origin:       CONFIG.DEFAULT_ORIGIN,
  weather:      null,
  forecast:     [],
  holidays:     [],
  traffic:      null,
  safetyScore:  null,
  _currentTab:  "dashboard"
};

// ── Boot: runs once when the page DOM is ready ────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initFirebase();           // js/firebase.js — connect Firestore
  setDefaultDates();        // set start / end date inputs to near future
  renderPackingChecklist([]); // seed packing list before weather loads
  initMap("mapContainer", 15.4, 74.0, 6); // js/api.js — pre-load Leaflet map
  refreshDashboard();       // fetch all APIs and paint the UI
});


/* ── MAIN REFRESH ────────────────────────────────────────────────────────── */

async function refreshDashboard() {
  const city   = (document.getElementById("destination")?.value || state.city).trim();
  const origin = (document.getElementById("origin")?.value      || state.origin).trim();
  const start  = document.getElementById("startDate")?.value;
  const end    = document.getElementById("endDate")?.value;

  state.city = city; state.origin = origin;

  // Sync hero search box
  const hero = document.getElementById("heroInput");
  if (hero && !hero.value) hero.value = city;

  showLoading(true);
  const year = new Date(start || Date.now()).getFullYear();

  // All API calls fire in parallel — much faster than sequential
  const [weather, forecast, routeData, holidays] = await Promise.all([
    fetchCurrentWeather(city),    // api.js – Section 1
    fetchForecast(city),          // api.js – Section 1
    fetchRoute(origin, city),     // api.js – Section 4
    fetchHolidays(CONFIG.DEFAULT_COUNTRY, year) // api.js – Section 2
  ]);

  state.weather  = weather;
  state.forecast = forecast;
  state.traffic  = routeData;
  state.holidays = holidays;

  // UV index needs lat/lon from the weather call
  if (weather?.lat && weather?.lon) {
    weather.uvIndex = await fetchUVIndex(weather.lat, weather.lon); // api.js
  }

  const overlaps = findHolidayOverlaps(
    start || new Date().toISOString().split("T")[0],
    end   || new Date(Date.now() + 5*86400000).toISOString().split("T")[0],
    holidays
  );

  state.safetyScore = calculateSafetyScore(weather, routeData, overlaps, start); // api.js

  // Render all panels
  renderSafetyMeter(state.safetyScore);
  renderWeatherPanel(weather);
  renderForecastCards(forecast, "forecastCards");
  renderTrafficPanel(routeData);
  renderAlternateRoutes(routeData, origin, city);
  renderRoadAlerts(routeData, weather, holidays, start); // api.js – Section 6
  renderHolidayAlerts(overlaps, holidays);
  renderPackingChecklist(forecast);
  renderTravelScore(state.safetyScore);
  buildCalendar(start, end, holidays);
  mirrorWeatherTab(weather, forecast);
  mirrorHolidayTab(overlaps, holidays, start);

  // Draw route on map
  if (routeData) {
    drawRoute(routeData); // api.js – Section 5
    setEl("tRouteLabel", `${origin.split(",")[0]} → ${city.split(",")[0]}`);
    if (state._currentTab === "traffic" && _map) {
      setTimeout(() => _map.invalidateSize(), 150);
    }
  }

  showLoading(false);
  showToast(`Dashboard updated for ${city} ✅`);
}


/* ── SAFETY METER ────────────────────────────────────────────────────────── */

function renderSafetyMeter(score) {
  if (!score) return;
  const circle = document.querySelector(".meter-circle");
  if (circle) {
    const circ = 2 * Math.PI * 54; // r=54 from SVG
    circle.style.strokeDasharray  = circ;
    circle.style.strokeDashoffset = circ - (score.total / 100) * circ;
    circle.style.stroke = score.color;
  }
  setEl("meterValue",    score.total);
  setEl("safetyLabel",   score.label);
  setEl("safetySubLabel",
    score.total >= 80 ? "Excellent — great time to travel!" :
    score.total >= 60 ? "Good. Minor concerns noted below." :
    score.total >= 40 ? "Caution. Review the alerts below." :
                        "High risk — consider rescheduling.");

  updateBar("barWeather", score.weatherScore, "barWeatherPct");
  updateBar("barTraffic", score.trafficScore,  "barTrafficPct");
  updateBar("barHoliday", score.holidayScore,  "barHolidayPct");
  updateBar("barSeason",  score.seasonScore,   "barSeasonPct");
}

function updateBar(barId, val, pctId) {
  const el = document.getElementById(barId);
  if (el) {
    el.style.width      = val + "%";
    el.style.background = val >= 70 ? "#00e5b0" : val >= 40 ? "#ffb347" : "#ff5f6d";
  }
  if (pctId) setEl(pctId, val + "%");
}


/* ── WEATHER ─────────────────────────────────────────────────────────────── */

function renderWeatherPanel(w) {
  if (!w) return;
  setEl("wCity",       `${w.cityName}, ${w.country}`);
  setEl("wIcon",       w.icon);
  setEl("wTemp",       `${w.temp}°`);
  setEl("wDesc",       w.description);
  setEl("wFeelsLike",  `Feels like ${w.feelsLike}°C`);
  setEl("wHumidity",   `${w.humidity}%`);
  setEl("wWind",       `${w.windKph} km/h`);
  setEl("wVisibility", `${w.visibility} km`);
  setEl("wSunrise",    w.sunrise || "—");
  setEl("wSunset",     w.sunset  || "—");
  const uvTxt = w.uvIndex != null ? `${w.uvIndex} ${uvLabel(w.uvIndex)}` : "—";
  setEl("wUV", uvTxt);
  const uvEl = document.getElementById("wUV");
  if (uvEl && w.uvIndex != null)
    uvEl.style.color = w.uvIndex >= 8 ? "#ff5f6d" : w.uvIndex >= 3 ? "#ffb347" : "#00e5b0";
}

function mirrorWeatherTab(w, forecast) {
  if (!w) return;
  setEl("wCity2", `${w.cityName}, ${w.country}`);
  setEl("wIcon2", w.icon);  setEl("wTemp2",  w.temp); setEl("wDesc2", w.description);
  setEl("wFeel2", `${w.feelsLike}°C`); setEl("wHum2", `${w.humidity}%`);
  setEl("wWind2", `${w.windKph} km/h`);
  setEl("wUV2",   w.uvIndex != null ? `${w.uvIndex} ${uvLabel(w.uvIndex)}` : "—");
  setEl("wVis2",  `${w.visibility} km`);
  setEl("wSun2",  `${w.sunrise||"—"} / ${w.sunset||"—"}`);
  renderForecastCards(forecast, "forecastCards2");
  // Mirror packing list preview
  const pp = document.getElementById("packingPreview");
  const pl = document.getElementById("packingList");
  if (pp && pl) pp.innerHTML = pl.innerHTML;
  // Weather score box
  if (state.safetyScore) {
    const s = state.safetyScore;
    const el2 = document.getElementById("travelScore2");
    const lb2 = document.getElementById("travelScoreLabel2");
    if (el2) { el2.textContent = s.total; el2.style.color = s.color; }
    if (lb2) lb2.textContent = s.label;
    const wab = document.getElementById("weatherAlertBox");
    if (wab) {
      const ws  = s.weatherScore;
      const cls = ws >= 80 ? "alert-success" : ws >= 50 ? "alert-warn" : "alert-danger";
      const ico = ws >= 80 ? "✅" : ws >= 50 ? "⚠️" : "🌧️";
      wab.innerHTML = `<div class="alert ${cls}"><span class="alert-icon">${ico}</span>
        <div>${ws >= 80 ? "Perfect weather for your dates." : ws >= 50 ? "Acceptable — some rain possible." : "Poor weather expected. Pack accordingly."}</div></div>`;
    }
  }
}


/* ── FORECAST STRIP ──────────────────────────────────────────────────────── */

function renderForecastCards(forecast, containerId = "forecastCards") {
  const c = document.getElementById(containerId);
  if (!c) return;
  if (!forecast?.length) {
    c.innerHTML = `<div class="loading-spinner" style="grid-column:1/-1">Forecast unavailable</div>`;
    return;
  }
  c.innerHTML = forecast.slice(0,7).map((d,i) => `
    <div class="forecast-card ${i===0?"today":""}">
      <div class="fc-day">${i===0?"Today":d.dayName}</div>
      <div class="fc-icon">${d.icon}</div>
      <div class="fc-temps"><span class="fc-max">${d.maxTemp}°</span><span class="fc-min">${d.minTemp}°</span></div>
      <div class="fc-desc">${d.description}</div>
      ${d.pop > 20 ? `<div class="fc-rain">🌧 ${d.pop}%</div>` : ""}
    </div>`).join("");
}


/* ── TRAFFIC PANEL ───────────────────────────────────────────────────────── */

function renderTrafficPanel(t) {
  if (!t) { ["tDistance","tDuration","tTraffic","tLevel","tDelay"].forEach(id=>setEl(id,"—")); return; }
  setEl("tDistance", `${t.distanceKm} km`);
  setEl("tDuration", t.durationHr);
  setEl("tTraffic",  t.durationTrafficHr);
  setEl("tDelay",    secToHr(t.delaySec));
  setEl("tLevel",    t.trafficLevel.charAt(0).toUpperCase() + t.trafficLevel.slice(1));
  const lvlEl = document.getElementById("tLevel");
  if (lvlEl) lvlEl.style.color = trafficColor(t.trafficLevel);
}


/* ── ALTERNATE ROUTES ────────────────────────────────────────────────────── */

function renderAlternateRoutes(routeData, origin, dest) {
  const c = document.getElementById("alternateRoutes");
  if (!c) return;
  const o = (origin || state.origin).split(",")[0].trim();
  const d = (dest   || state.city).split(",")[0].trim();
  const rows = [];

  if (routeData) {
    rows.push({
      label:       `${o} → ${d} (via road)`,
      detail:      `${routeData.distanceKm} km · Live route from OpenRouteService`,
      time:        routeData.durationTrafficHr,
      color:       trafficColor(routeData.trafficLevel),
      recommended: true
    });
  }
  rows.push({
    label:  `🚆 Train: ${o} → ${d}`,
    detail: "Check IRCTC for schedules, fares and availability",
    time:   "irctc.co.in",
    color:  "#4fa8ff", recommended: false
  });
  rows.push({
    label:  `✈️ Flight: ${o} → ${d}`,
    detail: "Compare prices on MakeMyTrip or EaseMyTrip",
    time:   "Check airline",
    color:  "#7c5cfc", recommended: false
  });

  c.innerHTML = rows.map(r => `
    <div class="route-option ${r.recommended?"recommended":""}" style="margin-bottom:10px">
      <div>
        <div style="font-size:14px;font-weight:700">${r.label}
          ${r.recommended?`<span class="chip chip-green" style="margin-left:6px">Live data</span>`:""}
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${r.detail}</div>
      </div>
      <div style="font-size:18px;font-weight:700;color:${r.color};flex-shrink:0">${r.time}</div>
    </div>`).join("");
}


/* ── HOLIDAY ALERTS ──────────────────────────────────────────────────────── */

function renderHolidayAlerts(overlaps) {
  const c = document.getElementById("holidayAlerts");
  if (!c) return;
  if (!overlaps?.length) {
    c.innerHTML = `<div class="alert alert-success"><span class="alert-icon">✅</span>
      <div>No public holidays overlap your travel window. Normal prices expected.</div></div>`;
    return;
  }
  c.innerHTML = overlaps.map(h => `
    <div class="alert ${h.type==="National"||h.type==="Public"?"alert-danger":"alert-warn"}">
      <span class="alert-icon">${h.type==="National"||h.type==="Public"?"🚨":"⚠️"}</span>
      <div><strong>${h.name}</strong> — ${fmtDateDisplay(h.date)}<br>
      <small>${h.type} holiday. Expect heavier traffic and 30–60% higher hotel prices.</small></div>
    </div>`).join("");
}

function mirrorHolidayTab(overlaps, allHolidays, startDate) {
  // Full holiday list
  const hl = document.getElementById("holidayList");
  if (hl) {
    if (!allHolidays?.length) {
      hl.innerHTML = `<div class="alert alert-warn"><span>⚠️</span>
        <div>Could not load holidays. Check ABSTRACT_HOLIDAY_API_KEY in config.js.<br>
        <small>Indian offline data is shown as fallback.</small></div></div>`;
    } else {
      const upcoming = allHolidays
        .filter(h => new Date(h.date) >= new Date())
        .sort((a,b) => a.date.localeCompare(b.date))
        .slice(0, 15);
      hl.innerHTML = upcoming.length
        ? upcoming.map(h => `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;
                        padding:10px 0;border-bottom:1px solid var(--border);font-size:13px">
              <div>
                <div style="font-weight:600">${h.name}</div>
                <div style="color:var(--muted);font-size:11px;margin-top:2px">${h.type} · ${h.locations}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;margin-left:12px">
                <div style="font-weight:600">${fmtDateDisplay(h.date)}</div>
                <div style="font-size:11px;color:var(--muted)">${h.date}</div>
              </div>
            </div>`).join("")
        : `<div class="empty-state">No upcoming holidays this year</div>`;
    }
  }

  // Impact box
  const hi = document.getElementById("holidayImpact");
  if (hi) {
    hi.innerHTML = !overlaps?.length
      ? `<div class="alert alert-success"><span>✅</span><div>No holidays fall within your travel dates.</div></div>`
      : overlaps.map(h => `
          <div class="alert alert-danger"><span>🚨</span>
            <div><strong>${h.name}</strong> (${fmtDateDisplay(h.date)}) is within your trip.<br>
            Expect 30–60% higher prices and heavy road traffic.</div>
          </div>`).join("");
  }

  // Clone calendar into holidays tab
  const start = document.getElementById("startDate")?.value;
  const end   = document.getElementById("endDate")?.value;
  buildCalendar(start, end, allHolidays);
  const cgh = document.getElementById("calendarGridHolidays");
  const cgm = document.getElementById("calendarGrid");
  if (cgh && cgm) cgh.innerHTML = cgm.innerHTML;
}


/* ── CALENDAR ────────────────────────────────────────────────────────────── */

let _calMonthOffset = 0;

function buildCalendar(startDate, endDate, holidays) {
  const c = document.getElementById("calendarGrid");
  if (!c) return;
  const ref = startDate ? new Date(startDate) : new Date();
  ref.setMonth(ref.getMonth() + _calMonthOffset);
  const year = ref.getFullYear(), month = ref.getMonth();
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const hDates      = (holidays || []).map(h => h.date);
  const today       = new Date().toISOString().split("T")[0];
  const tripDates   = [];
  if (startDate && endDate) {
    let d = new Date(startDate);
    while (d <= new Date(endDate)) { tripDates.push(d.toISOString().split("T")[0]); d.setDate(d.getDate()+1); }
  }

  const days = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  let html = `
    <div class="cal-month-header">
      <button onclick="_calMonthOffset--;buildCalendar(document.getElementById('startDate')?.value,document.getElementById('endDate')?.value,state.holidays)">‹</button>
      <span>${new Date(year,month).toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</span>
      <button onclick="_calMonthOffset++;buildCalendar(document.getElementById('startDate')?.value,document.getElementById('endDate')?.value,state.holidays)">›</button>
    </div>
    <div class="cal-grid">
      ${days.map(d=>`<div class="cal-head">${d}</div>`).join("")}
      ${Array(firstDay).fill('<div class="cal-day empty"></div>').join("")}`;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    let cls   = "cal-day";
    if (ds === today)       cls += " today";
    if (hDates.includes(ds)) cls += " holiday";
    if (tripDates.includes(ds)) cls += " trip";
    const hol = hDates.includes(ds) ? holidays.find(h => h.date === ds) : null;
    html += `<div class="${cls}" ${hol?`title="${hol.name}"`:""}>${d}</div>`;
  }
  html += `</div>
    <div class="cal-legend">
      <span class="leg-item"><span class="leg-dot holiday"></span>Holiday</span>
      <span class="leg-item"><span class="leg-dot trip"></span>Your trip</span>
      <span class="leg-item"><span class="leg-dot today"></span>Today</span>
    </div>`;
  c.innerHTML = html;
}


/* ── PACKING CHECKLIST ───────────────────────────────────────────────────── */

function renderPackingChecklist(forecast) {
  const c = document.getElementById("packingList");
  if (!c) return;
  const base = [
    { icon:"🪪", text:"Government ID / Passport" },
    { icon:"💊", text:"Personal medications" },
    { icon:"📱", text:"Phone charger & power bank" },
    { icon:"💳", text:"Cash + debit/credit cards" },
    { icon:"🗺️", text:"Offline maps downloaded" }
  ];
  const extra = [];
  if (forecast?.length) {
    const maxT = Math.max(...forecast.map(f=>f.maxTemp));
    const minT = Math.min(...forecast.map(f=>f.minTemp));
    const rain = forecast.some(f=>f.pop>30);
    if (maxT > 30) extra.push({ icon:"☀️", text:"Sunscreen SPF 50+ (UV is HIGH)" });
    if (maxT > 28) extra.push({ icon:"👕", text:"Light breathable cotton clothes" });
    if (minT < 15) extra.push({ icon:"🧥", text:"Warm jacket for cool evenings" });
    if (rain)      extra.push({ icon:"☔", text:"Compact umbrella / rain jacket" });
    extra.push({ icon:"💧", text:"Reusable sealed water bottle" });
  } else {
    extra.push({ icon:"🧴", text:"Sunscreen & insect repellent" });
    extra.push({ icon:"👒", text:"Hat & sunglasses" });
  }
  c.innerHTML = [...base,...extra].map((item,i)=>{
    const id=`pack_${i}`;
    return `<div class="checklist-item" id="${id}" onclick="toggleCheckItem('${id}')">
      <div class="check-box"></div><span class="check-text">${item.icon} ${item.text}</span></div>`;
  }).join("");
  updatePackCount();
}

function toggleCheckItem(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.toggle("done"); updatePackCount(); }
}

function updatePackCount() {
  const done  = document.querySelectorAll(".checklist-item.done").length;
  const total = document.querySelectorAll(".checklist-item").length;
  setEl("packProgress", `${done} / ${total} packed`);
}

function addCustomItem() {
  const input = document.getElementById("customItem");
  if (!input?.value.trim()) return;
  const list = document.getElementById("packingList");
  if (!list) return;
  const id  = `custom_${Date.now()}`;
  const div = document.createElement("div");
  div.className = "checklist-item"; div.id = id;
  div.onclick = () => toggleCheckItem(id);
  div.innerHTML = `<div class="check-box"></div><span class="check-text">📦 ${input.value.trim()}</span>`;
  list.appendChild(div);
  input.value = "";
  updatePackCount();
  showToast("Added ✅");
}


/* ── SAVE TRIP + ALERTS ──────────────────────────────────────────────────── */

async function saveCurrentTrip() {
  const tripData = {
    origin:      document.getElementById("origin")?.value      || state.origin,
    destination: document.getElementById("destination")?.value  || state.city,
    startDate:   document.getElementById("startDate")?.value,
    endDate:     document.getElementById("endDate")?.value,
    travelers:   document.getElementById("travelers")?.value,
    budget:      document.getElementById("budget")?.value,
    safetyScore: state.safetyScore?.total,
    duration: (() => {
      const s = document.getElementById("startDate")?.value;
      const e = document.getElementById("endDate")?.value;
      return s && e ? Math.round((new Date(e)-new Date(s))/86400000)+1 : null;
    })()
  };
  showToast("Saving…","info");
  const id = await saveTrip(tripData); // firebase.js
  if (id) { showToast("Trip saved! 🎉","success"); renderTripHistory(); showTab("history"); }
  else    { showToast("Save failed — check Firebase config","error"); }
}

async function saveAlerts() {
  const prefs = {
    trafficThreshold:  document.getElementById("trafficThreshold")?.value,
    weatherThreshold:  document.getElementById("weatherThreshold")?.value,
    notifyHoursBefore: document.getElementById("notifyHoursBefore")?.value,
    priceLimit:        document.getElementById("priceLimit")?.value,
    updatedAt:         new Date().toISOString()
  };
  await saveAlertPrefs(prefs); // firebase.js
  showToast("Alert preferences saved 🔔","success");
}


/* ── TRAVEL SCORE (trip setup bar) ──────────────────────────────────────── */

function renderTravelScore(score) {
  if (!score) return;
  const el = document.getElementById("travelScore");
  if (el) { el.textContent = `${score.total}/100`; el.style.color = score.color; }
  setEl("travelScoreLabel", score.label);
}


/* ── TAB NAVIGATION ──────────────────────────────────────────────────────── */

function showTab(name) {
  document.querySelectorAll(".tab-section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  const sec = document.getElementById("tab-"+name);
  if (sec) sec.classList.add("active");
  const tab = document.querySelector(`[data-tab="${name}"]`);
  if (tab) tab.classList.add("active");
  state._currentTab = name;

  // Traffic tab fix: map must get invalidateSize() after display:block is applied
  if (name === "traffic") {
    if (!_map) initMap("mapContainer", 15.4, 74.0, 6); // api.js
    setTimeout(() => {
      if (_map) {
        _map.invalidateSize();
        if (state.traffic) drawRoute(state.traffic); // api.js
      }
    }, 200);
  }

  if (name === "history") renderTripHistory(); // firebase.js
  window.scrollTo({ top:0, behavior:"smooth" });
}


/* ── LOADING + TOAST ─────────────────────────────────────────────────────── */

function showLoading(on) {
  document.querySelectorAll(".loading-panel").forEach(el => el.classList.toggle("loading", on));
  const btn = document.getElementById("refreshBtn");
  if (btn) btn.textContent = on ? "⏳ Loading…" : "🔄 Refresh";
}

function showToast(msg, type = "info") {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3500);
}


/* ── UTILITIES ───────────────────────────────────────────────────────────── */

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function setDefaultDates() {
  const sd = document.getElementById("startDate");
  const ed = document.getElementById("endDate");
  if (!sd || !ed) return;
  const s = new Date(); s.setDate(s.getDate() + 3);
  const e = new Date(s); e.setDate(s.getDate() + 5);
  const fmt = d => d.toISOString().split("T")[0];
  sd.value = fmt(s);
  ed.value = fmt(e);
}

function setMobileActive(btn) {
  btn.parentElement.querySelectorAll(".mobile-nav-btn")
    .forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}
