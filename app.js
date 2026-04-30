
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAStWFyRYy4RVSEfQ5obMJwPCOslAaBCGU",
  authDomain: "alekseibr.github.io",
  databaseURL: "https://parentalcontrol-c7f7a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "parentalcontrol-c7f7a",
  storageBucket: "parentalcontrol-c7f7a.firebasestorage.app",
  messagingSenderId: "773827816415",
  appId: "1:773827816415:web:9b4a2c9ed3e297706a326a",
  measurementId: "G-1Q58H5V8YT"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let map = null;
let marker = null;

const ui = new firebaseui.auth.AuthUI(auth);
const uiConfig = {
    signInOptions: [firebase.auth.EmailAuthProvider.PROVIDER_ID, firebase.auth.GoogleAuthProvider.PROVIDER_ID],
    callbacks: { signInSuccessWithAuthResult: () => { document.getElementById('authContainer').style.display = 'none'; document.getElementById('appContainer').style.display = 'block'; initApp(); return false; } }
};

auth.onAuthStateChanged((user) => {
    if (user) { document.getElementById('authContainer').style.display = 'none'; document.getElementById('appContainer').style.display = 'block'; initApp(); } 
    else { document.getElementById('authContainer').style.display = 'flex'; document.getElementById('appContainer').style.display = 'none'; ui.start('#firebaseui-auth-container', uiConfig); }
});

function logout() { auth.signOut(); location.reload(); }

function initApp() { initMap(); loadPermissions(); trackLocation(); monitorDeviceStatus(); monitorOnlineStatus(); loadHistory(1); }

function initMap() { map = L.map('map').setView([55.751244, 37.618423], 13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map); }

async function loadPermissions() { const s = await db.ref('kiosk/permissions').get(); const perms = s.val() || []; document.querySelectorAll('#permissions input').forEach(cb => { cb.checked = perms.includes(cb.value); }); }

async function savePermissions() { const allowed = []; document.querySelectorAll('#permissions input:checked').forEach(cb => allowed.push(cb.value)); await db.ref('kiosk/permissions').set(allowed); const v = (await db.ref('kiosk/version').get()).val() || 0; await db.ref('kiosk/version').set(v + 1); alert('✅ Права сохранены'); }

async function resetPermissions() { const def = ["com.android.dialer","com.android.gallery3d","com.android.contacts","com.android.camera","com.android.settings","com.android.chrome","com.max.messenger","com.android.mms"]; await db.ref('kiosk/permissions').set(def); const v = (await db.ref('kiosk/version').get()).val() || 0; await db.ref('kiosk/version').set(v + 1); await loadPermissions(); alert('🔄 Сброшено'); }

function trackLocation() { db.ref('kids/child_device/location').on('value', (s) => { const loc = s.val(); if (loc && map) { if (marker) marker.setLatLng([loc.lat, loc.lng]); else marker = L.marker([loc.lat, loc.lng]).addTo(map); map.setView([loc.lat, loc.lng], 15); document.getElementById('locationInfo').innerHTML = `📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>🎯 Точность: ${(loc.accuracy||50).toFixed(0)} м<br>🕐 ${new Date(loc.time).toLocaleString()}`; } }); }

function monitorDeviceStatus() { db.ref('.info/connected').on('value', (s) => { const d = document.getElementById('deviceStatus'); if (d) { d.className = s.val() ? 'status status-online' : 'status status-offline'; d.innerHTML = s.val() ? '✅ Устройство онлайн' : '❌ Устройство офлайн'; } }); }

function monitorOnlineStatus() { db.ref('kiosk/online_status').on('value', (s) => { const d = s.val(); if (d) { document.getElementById('statusIcon').innerHTML = d.status === 'online' ? '🟢' : '🔴'; document.getElementById('statusText').innerHTML = d.status === 'online' ? 'В сети' : 'Не в сети'; document.getElementById('batteryText').innerHTML = d.battery ? `🔋 Заряд: ${d.battery}%` : ''; } }); }

async function loadHistory(days) { const cutoff = Date.now() - days * 86400000; const snap = await db.ref('kids/child_device/activity_history/all_events').orderByChild('device_time').startAt(cutoff).get(); const events = []; snap.forEach(c => events.push(c.val())); events.sort((a,b) => (b.device_time||0) - (a.device_time||0)); const cont = document.getElementById('historyList'); if (events.length === 0) { cont.innerHTML = '<div style="text-align:center; padding:40px;">Нет событий</div>'; return; } cont.innerHTML = events.map(e => `<div class="history-item"><div class="history-icon">${e.type==='app_launch'?'🚀':(e.type==='status_change'?(e.title?.includes('в сети')?'🟢':'🔴'):'📍')}</div><div class="history-content"><div class="history-title">${e.title||''}</div><div class="history-details">${e.details||''}</div></div><div class="history-time">${new Date(e.device_time).toLocaleString()}</div></div>`).join(''); }
