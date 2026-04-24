/**
 * TripMind - API Hub
 * Keys go in js/config.js - see comments below for signup links
 */

let _map=null,_routeLayer=null,_markersLayer=null,_weatherLayers=[];

// ── 1. WEATHER (openweathermap.org - OPENWEATHER_API_KEY in config.js) ────────
async function fetchCurrentWeather(city){
  if(!CONFIG.OPENWEATHER_API_KEY||CONFIG.OPENWEATHER_API_KEY.includes("YOUR_"))return null;
  try{
    const r=await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${CONFIG.OPENWEATHER_API_KEY}&units=${CONFIG.UNITS}`);
    if(!r.ok)throw new Error("OWM "+r.status);
    const d=await r.json();
    return{temp:Math.round(d.main.temp),feelsLike:Math.round(d.main.feels_like),humidity:d.main.humidity,windKph:Math.round(d.wind.speed*3.6),description:d.weather[0].description,icon:weatherIcon(d.weather[0].id),weatherId:d.weather[0].id,visibility:(d.visibility/1000).toFixed(1),cityName:d.name,country:d.sys.country,lat:d.coord.lat,lon:d.coord.lon,sunrise:unixToTime(d.sys.sunrise,d.timezone),sunset:unixToTime(d.sys.sunset,d.timezone),raw:d};
  }catch(e){console.error("fetchCurrentWeather:",e.message);return null;}
}

async function fetchForecast(city){
  if(!CONFIG.OPENWEATHER_API_KEY||CONFIG.OPENWEATHER_API_KEY.includes("YOUR_"))return[];
  try{
    const r=await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${CONFIG.OPENWEATHER_API_KEY}&units=${CONFIG.UNITS}&cnt=40`);
    if(!r.ok)throw new Error("Forecast "+r.status);
    const d=await r.json();
    const byDay={};
    d.list.forEach(item=>{const date=item.dt_txt.split(" ")[0];if(!byDay[date])byDay[date]=[];byDay[date].push(item);});
    return Object.entries(byDay).slice(0,7).map(([date,slots])=>{
      const temps=slots.map(s=>s.main.temp),pops=slots.map(s=>s.pop||0),mid=slots[Math.floor(slots.length/2)],dt=new Date(date+"T12:00:00");
      return{date,dayName:dt.toLocaleDateString("en-IN",{weekday:"short"}),fullDate:dt.toLocaleDateString("en-IN",{day:"numeric",month:"short"}),icon:weatherIcon(mid.weather[0].id),minTemp:Math.round(Math.min(...temps)),maxTemp:Math.round(Math.max(...temps)),description:mid.weather[0].description,pop:Math.round(Math.max(...pops)*100)};
    });
  }catch(e){console.error("fetchForecast:",e.message);return[];}
}

async function fetchUVIndex(lat,lon){
  if(!CONFIG.OPENWEATHER_API_KEY||CONFIG.OPENWEATHER_API_KEY.includes("YOUR_"))return null;
  try{const r=await fetch(`https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${CONFIG.OPENWEATHER_API_KEY}`);if(!r.ok)return null;return Math.round((await r.json()).value);}catch{return null;}
}

// ── 2. HOLIDAYS (abstractapi.com - ABSTRACT_HOLIDAY_API_KEY in config.js) ─────
// IMPORTANT: Abstract API requires running via local server (not file://)
// Run: npx serve .   OR   python3 -m http.server 8080
// Then open: http://localhost:8080
async function fetchHolidays(countryCode,year){
  if(!CONFIG.ABSTRACT_HOLIDAY_API_KEY||CONFIG.ABSTRACT_HOLIDAY_API_KEY.includes("YOUR_")){
    console.warn("Add ABSTRACT_HOLIDAY_API_KEY to config.js - using built-in holidays");
    return _fallbackHolidays(year);
  }
  try{
    const r=await fetch(`https://holidays.abstractapi.com/v1/?api_key=${CONFIG.ABSTRACT_HOLIDAY_API_KEY}&country=${countryCode}&year=${year}`);
    if(!r.ok)throw new Error("Abstract "+r.status);
    const data=await r.json();
    if(!Array.isArray(data))throw new Error(data?.error||data?.message||"bad format");
    return data.map(h=>({name:h.name,localName:h.name_local||h.name,date:h.date,type:h.type,locations:h.locations||"All"}));
  }catch(e){
    console.error("fetchHolidays:",e.message);
    return _fallbackHolidays(year);
  }
}

function _fallbackHolidays(year){
  return[
    {name:"New Year's Day",    date:`${year}-01-01`,type:"National",locations:"All"},
    {name:"Republic Day",      date:`${year}-01-26`,type:"National",locations:"All"},
    {name:"Holi",              date:`${year}-03-17`,type:"National",locations:"All"},
    {name:"Good Friday",       date:`${year}-03-29`,type:"National",locations:"All"},
    {name:"Ram Navami",        date:`${year}-04-06`,type:"National",locations:"All"},
    {name:"Ambedkar Jayanti",  date:`${year}-04-14`,type:"National",locations:"All"},
    {name:"Eid ul-Fitr",       date:`${year}-03-31`,type:"National",locations:"All"},
    {name:"Independence Day",  date:`${year}-08-15`,type:"National",locations:"All"},
    {name:"Janmashtami",       date:`${year}-08-16`,type:"National",locations:"All"},
    {name:"Gandhi Jayanti",    date:`${year}-10-02`,type:"National",locations:"All"},
    {name:"Dussehra",          date:`${year}-10-12`,type:"National",locations:"All"},
    {name:"Diwali",            date:`${year}-10-20`,type:"National",locations:"All"},
    {name:"Christmas Day",     date:`${year}-12-25`,type:"National",locations:"All"},
  ];
}

function findHolidayOverlaps(startDate,endDate,holidays,bufferDays=2){
  if(!startDate||!endDate||!holidays?.length)return[];
  const start=new Date(startDate),end=new Date(endDate);
  start.setDate(start.getDate()-bufferDays);
  return holidays.filter(h=>{const hDate=new Date(h.date);return hDate>=start&&hDate<=end;});
}

// ── 3. GEOCODING (Nominatim/OSM - no key needed) ──────────────────────────────
async function geocodeCity(cityName){
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1&addressdetails=1`,{headers:{"Accept-Language":"en","User-Agent":"TripMind/1.0"}});
    const data=await r.json();
    if(!data.length){console.warn("Nominatim no result for:",cityName);return null;}
    return{lat:parseFloat(data[0].lat),lon:parseFloat(data[0].lon),display:data[0].display_name,country:data[0].address?.country_code?.toUpperCase()||""};
  }catch(e){console.error("geocodeCity:",e.message);return null;}
}

// ── 4. ROUTING (openrouteservice.org - ORS_API_KEY in config.js) ──────────────
// Signup: https://openrouteservice.org/dev/#/signup
// Dashboard: enable "Directions v2" service, copy your Token into config.js
async function fetchRoute(originCity,destCity){
  if(!CONFIG.ORS_API_KEY||CONFIG.ORS_API_KEY.includes("YOUR_")){
    console.warn("Add ORS_API_KEY to config.js for route drawing");
    return null;
  }
  const[originCoords,destCoords]=await Promise.all([geocodeCity(originCity),geocodeCity(destCity)]);
  if(!originCoords||!destCoords){console.error("Geocoding failed");return null;}
  try{
    const r=await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=${CONFIG.ORS_API_KEY}&start=${originCoords.lon},${originCoords.lat}&end=${destCoords.lon},${destCoords.lat}&alternatives=true&geometry=true`);
    if(!r.ok)throw new Error("ORS "+r.status+" "+(await r.text()).slice(0,150));
    const data=await r.json();
    if(!data.features?.length)throw new Error("ORS empty");
    const factor=estimateTrafficFactor();
    const routes=data.features.map((feat,idx)=>{
      const s=feat.properties.summary,seg=feat.properties.segments?.[0]||{},distKm=+(s.distance/1000).toFixed(1),durSec=s.duration,trafSec=durSec*factor;
      return{index:idx,isPrimary:idx===0,distanceKm:distKm,durationHr:secToHr(durSec),durationTrafficHr:secToHr(trafSec),durationSec:durSec,trafficDurSec:trafSec,delaySec:Math.round(trafSec-durSec),trafficLevel:trafficLevelFromFactor(factor),geometry:feat.geometry,steps:seg.steps||[],originCoords,destCoords};
    });
    return{...routes[0],alternateRoutes:routes.slice(1)};
  }catch(e){console.error("fetchRoute:",e.message);return null;}
}

function estimateTrafficFactor(){
  const h=new Date().getHours();
  if((h>=8&&h<=10)||(h>=17&&h<=20))return 1.45;
  if((h>=10&&h<=12)||(h>=14&&h<=17))return 1.20;
  if(h>=22||h<=5)return 1.05;
  return 1.15;
}

function trafficLevelFromFactor(f){
  if(f<1.10)return"light";if(f<1.25)return"moderate";if(f<1.40)return"heavy";return"severe";
}

// ── 5. DYNAMIC ROAD ALERTS (no external API - derived from route + holidays + time) ─
function generateRoadAlerts(routeData,holidays,startDate){
  const alerts=[];
  if(!routeData)return alerts;
  const hour=new Date().getHours(),factor=estimateTrafficFactor(),distKm=parseFloat(routeData.distanceKm)||0;
  const overlaps=findHolidayOverlaps(startDate||new Date().toISOString().split("T")[0],startDate||new Date(Date.now()+5*86400000).toISOString().split("T")[0],holidays||[],3);
  if((hour>=8&&hour<=10)||(hour>=17&&hour<=20))
    alerts.push({type:"danger",icon:"🚗",title:"Peak hour right now",body:`It's ${hour}:00 — peak traffic. Expect ${secToHr(routeData.delaySec)} extra delay. Leave after 8 PM or before 5 AM for best conditions.`});
  if(overlaps.length>0){
    const names=overlaps.slice(0,2).map(h=>h.name).join(" · ");
    alerts.push({type:"danger",icon:"🎉",title:`Holiday traffic — ${names}`,body:`Public holiday near your travel dates causes heavy congestion on major highways. Depart at 4–5 AM and pre-book accommodation.`});
  }
  if(distKm>400)
    alerts.push({type:"warn",icon:"⛽",title:"Plan fuel stops for long route",body:`Your route is ${distKm} km. Fuel stations can be 80–120 km apart on NH stretches. Fill up at every opportunity.`});
  if(factor>=1.15&&factor<1.45&&overlaps.length===0)
    alerts.push({type:"warn",icon:"🟡",title:"Moderate traffic conditions",body:`Current conditions show moderate congestion. An early morning departure (5–6 AM) will give the smoothest drive.`});
  if(factor<1.15)
    alerts.push({type:"success",icon:"✅",title:"Roads are clear right now",body:`Light traffic detected on your route. Great time to start your journey.`});
  alerts.push({type:"info",icon:"🕐",title:"Best departure window",body:`Ideal departure: 4–6 AM for lightest traffic. Avoid 8–10 AM and 5–8 PM (peak congestion periods on all major routes).`});
  return alerts;
}

// ── 6. MAP (Leaflet.js + OpenStreetMap - no key needed) ──────────────────────
// Leaflet loaded via CDN in index.html. mapContainer must have height in CSS.
function initMap(divId,lat,lon,zoom){
  if(typeof L==="undefined"){console.error("Leaflet not loaded - check CDN tag in index.html");return null;}
  if(_map){try{_map.remove();}catch(e){}  _map=null;_routeLayer=null;_markersLayer=null;_weatherLayers=[];}
  const container=document.getElementById(divId);
  if(!container){console.error("Map container #"+divId+" not found");return null;}
  if(container.offsetHeight===0)container.style.height="360px";
  _map=L.map(divId,{zoomControl:true,scrollWheelZoom:true});
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19
  }).addTo(_map);
  _map.setView([lat??20.5,lon??78.9],zoom??5);
  _markersLayer=L.layerGroup().addTo(_map);
  setTimeout(()=>{if(_map)_map.invalidateSize();},300);
  return _map;
}

function drawRoute(routeData){
  if(!_map||typeof L==="undefined"||!routeData)return;
  if(_routeLayer){_map.removeLayer(_routeLayer);_routeLayer=null;}
  _markersLayer?.clearLayers();
  routeData.alternateRoutes?.forEach((alt,idx)=>{
    if(!alt.geometry)return;
    L.geoJSON(alt.geometry,{style:{color:"#5a6a7a",weight:3,opacity:0.5,dashArray:"8 6",lineCap:"round"}}).addTo(_map).bindTooltip(`Alt ${idx+1}: ${alt.durationHr} · ${alt.distanceKm} km`,{sticky:true});
  });
  _routeLayer=L.geoJSON(routeData.geometry,{style:{color:trafficColor(routeData.trafficLevel),weight:5,opacity:0.9,lineCap:"round",lineJoin:"round"}}).addTo(_map);
  _routeLayer.bindTooltip(`${routeData.durationTrafficHr} with traffic · ${routeData.distanceKm} km`,{sticky:true});
  const mk=(l,bg,fg)=>L.divIcon({className:"",iconAnchor:[14,14],html:`<div style="background:${bg};color:${fg};border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)">${l}</div>`});
  L.marker([routeData.originCoords.lat,routeData.originCoords.lon],{icon:mk("A","#00e5b0","#000")}).addTo(_markersLayer).bindPopup(`<b>Start:</b> ${routeData.originCoords.display?.split(",")[0]||"Origin"}`);
  L.marker([routeData.destCoords.lat,routeData.destCoords.lon],{icon:mk("B","#ff5f6d","#fff")}).addTo(_markersLayer).bindPopup(`<b>End:</b> ${routeData.destCoords.display?.split(",")[0]||"Destination"}`);
  try{const b=_routeLayer.getBounds();if(b.isValid())_map.fitBounds(b,{padding:[40,40],maxZoom:10});}catch(e){}
  setTimeout(()=>{if(_map)_map.invalidateSize();},200);
}

function addWeatherLayer(layerName){
  if(!_map||typeof L==="undefined"){showToast("Map not ready","info");return;}
  if(!CONFIG.OPENWEATHER_API_KEY||CONFIG.OPENWEATHER_API_KEY.includes("YOUR_")){showToast("Add OPENWEATHER_API_KEY for weather overlays","info");return;}
  _weatherLayers.forEach(l=>{try{_map.removeLayer(l);}catch{}});_weatherLayers=[];
  const l=L.tileLayer(`https://tile.openweathermap.org/map/${layerName}/{z}/{x}/{y}.png?appid=${CONFIG.OPENWEATHER_API_KEY}`,{opacity:0.5,maxZoom:19}).addTo(_map);
  _weatherLayers.push(l);
  showToast(`${layerName.replace("_new","").replace(/_/g," ")} overlay added ✅`);
}

function trafficColor(level){return{light:"#00e5b0",moderate:"#ffb347",heavy:"#ff5f6d",severe:"#cc0000"}[level]||"#4fa8ff";}

// ── 7. SAFETY SCORE ───────────────────────────────────────────────────────────
function calculateSafetyScore(weather,traffic,overlaps,startDate){
  let ws=70;
  if(weather){const id=weather.weatherId;if(id>=200&&id<300)ws=20;else if(id>=300&&id<400)ws=55;else if(id>=500&&id<600)ws=40;else if(id>=600&&id<700)ws=30;else if(id>=700&&id<800)ws=50;else if(id===800)ws=95;else if(id>800)ws=80;if(weather.humidity>85)ws-=10;if(weather.windKph>50)ws-=15;}
  let ts=70;if(traffic)ts={light:92,moderate:65,heavy:35,severe:15}[traffic.trafficLevel]??60;
  let hs=90;if(overlaps?.length>0)hs=overlaps.some(h=>h.type==="National"||h.type==="Public")?25:55;
  const month=startDate?new Date(startDate).getMonth()+1:new Date().getMonth()+1;
  let ss=70;if(month>=11||month<=2)ss=95;else if(month>=3&&month<=5)ss=72;else if(month>=6&&month<=9)ss=28;else ss=82;
  const total=Math.min(100,Math.max(0,Math.round(ws*0.30+ts*0.30+hs*0.20+ss*0.20)));
  return{total,weatherScore:ws,trafficScore:ts,holidayScore:hs,seasonScore:ss,label:total>=80?"Excellent":total>=60?"Good":total>=40?"Caution":"Risky",color:total>=80?"#00e5b0":total>=60?"#4fa8ff":total>=40?"#ffb347":"#ff5f6d"};
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────
function secToHr(secs){const h=Math.floor(secs/3600),m=Math.round((secs%3600)/60);return m>0?`${h}h ${m}m`:`${h}h`;}
function unixToTime(unix,tzOffset){const d=new Date((unix+tzOffset)*1000);return d.toUTCString().slice(-12,-7);}
function weatherIcon(id){if(id>=200&&id<300)return"⛈️";if(id>=300&&id<400)return"🌦️";if(id>=500&&id<510)return"🌧️";if(id>=510&&id<600)return"🌨️";if(id>=600&&id<700)return"❄️";if(id>=700&&id<800)return"🌫️";if(id===800)return"☀️";if(id===801)return"🌤️";if(id===802)return"⛅";return"☁️";}
function uvLabel(v){if(v<=2)return"(Low)";if(v<=5)return"(Moderate)";if(v<=7)return"(High)";if(v<=10)return"(Very High)";return"(Extreme)";}