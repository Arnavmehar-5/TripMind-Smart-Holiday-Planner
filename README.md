# TripMind 🗺️ — Smart Holiday Planner

> **Plan smarter. Travel fearless.**
> A fully functional, API-driven holiday planner with live traffic, weather,
> public holiday detection, budget tracking, and cloud-saved trip history.

---

## 📸 What It Does

TripMind solves a real problem: most people plan trips without checking
whether it's a public holiday weekend, what the traffic will look like,
or whether the weather will cooperate.

| Tab | Feature |
|-----|---------|
| 🎯 Dashboard | Safety Meter (0–100), live weather, holiday alerts, 7-day forecast |
| 🚗 Traffic | Leaflet.js map, live route from OpenRouteService, dynamic road alerts |
| 🌤 Weather | Full conditions, UV index, forecast strip, travel weather score |
| 📅 Holidays | Public holidays via Abstract API, overlap detection, price impact guide |
| 💰 Budget | User-defined budget, editable expenses, live hotel prices via Makcorps |
| ✅ Packing | Weather-smart packing list, custom items, document checklist |
| 🗂 History | Firebase Firestore — save, reload, mark complete, delete trips |

---

## 🛠 Tech Stack

| Technology | Purpose | Cost |
|-----------|---------|------|
| HTML5 + CSS3 + Vanilla JS | Frontend | Free |
| Leaflet.js + OpenStreetMap | Interactive map + tiles | Free forever, no key |
| Nominatim (OpenStreetMap) | City geocoding | Free, no key |
| OpenRouteService | Driving directions + distance | Free (2,000 req/day) |
| OpenWeatherMap | Weather + forecast + UV + map tiles | Free (1,000 req/day) |
| Abstract API | Public holidays by country | Free (1,000 req/month) |
| Makcorps | Live hotel prices (Booking.com / Expedia) | Free 30-day trial |
| Firebase Firestore | Trip history database | Free Spark plan |
| Chart.js 4.4 | Budget doughnut chart | Free |

**No Google Maps. No billing account. No credit card required.**

---

## 🔑 API Keys

Open `js/config.js` and replace every `YOUR_..._HERE`:

```js
const CONFIG = {
  OPENWEATHER_API_KEY:      "...",  // openweathermap.org/api
  ABSTRACT_HOLIDAY_API_KEY: "...",  // app.abstractapi.com/api/holidays
  ORS_API_KEY:              "...",  // openrouteservice.org/dev/#/signup
  MAKCORPS_API_KEY:         "...",  // makcorps.com
  FIREBASE: {
    apiKey:            "...",
    authDomain:        "your-project.firebaseapp.com",
    projectId:         "your-project-id",
    storageBucket:     "your-project.appspot.com",
    messagingSenderId: "...",
    appId:             "..."
  }
};
```

---

## 🚀 How to Run

No build step. No Node.js. No npm install.

```bash
# Option 1 — VS Code Live Server (recommended)
# Install "Live Server" extension → right-click index.html → Open with Live Server

# Option 2 — Open directly
open index.html        # macOS
start index.html       # Windows

# Option 3 — Python
python3 -m http.server 8080
# visit http://localhost:8080
```

---

## 📁 Project Structure

```
tripmind/
├── index.html         ← Main app (all 7 tabs)
├── css/
│   └── styles.css     ← Dark theme, fully responsive
└── js/
    ├── config.js      ← 🔑 All API keys
    ├── api.js         ← Weather, Holidays, Routing, Map, Hotels, Safety Score
    ├── firebase.js    ← Firestore CRUD
    └── main.js        ← UI rendering, tab navigation, all panel logic
```

---

## 🔢 Safety Score

The central **Safety Meter** on the Dashboard:

```
Score = Weather(30%) + Traffic(30%) + Holiday Risk(20%) + Season(20%)

80-100  Excellent    60-79  Good    40-59  Caution    0-39  Risky
```

---

## 🗄 Firebase Collections

| Collection | Stores |
|-----------|--------|
| `trips/` | origin, destination, dates, safetyScore, travelers, status |
| `alerts/` | trafficThreshold, weatherThreshold, priceLimit, notifyHoursBefore |

Setup: Firebase Console → Firestore Database → Create database → Test mode.

---

## 📱 Browser Support

Chrome 80+, Firefox 78+, Safari 14+, Edge 80+, Mobile Chrome/Safari

---

*Built as a web development project. All APIs on free tiers.*