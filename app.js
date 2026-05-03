// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAStWFyRYy4RVSEfQ5obMJwPCOslAaBCGU",
  authDomain: "parentalcontrol-c7f7a.firebaseapp.com",
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

// Форма входа без регистрации
function showLoginForm() {
    const container = document.getElementById('firebaseui-auth-container');
    if (!container) return;
    container.innerHTML = `
        <div style="text-align: left;">
            <div style="margin-bottom: 20px;"><label style="display:block; margin-bottom:5px; font-weight:bold;">Email</label><input type="email" id="loginEmail" style="width:100%; padding:12px; border:1px solid #ddd; border-radius:8px;" placeholder="parent@example.com"></div>
            <div style="margin-bottom: 20px;"><label style="display:block; margin-bottom:5px; font-weight:bold;">Пароль</label><input type="password" id="loginPassword" style="width:100%; padding:12px; border:1px solid #ddd; border-radius:8px;" placeholder="••••••••"></div>
            <button id="loginButton" style="width:100%; padding:12px; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:white; border:none; border-radius:8px; font-weight:bold;">Войти</button>
            <div id="loginError" style="margin-top:15px; padding:10px; background:#fee; color:#c33; border-radius:8px; display:none;"></div>
            <div style="margin-top:20px; text-align:center; font-size:12px; color:#999;">Только для родителей.</div>
        </div>
    `;
    document.getElementById('loginButton').addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorDiv = document.getElementById('loginError');
        if (!email || !password) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Введите email и пароль';
            return;
        }
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = error.code === 'auth/user-not-found' ? 'Пользователь не найден' : 'Неверный пароль';
        }
    });
    document.getElementById('loginPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('loginButton').click();
    });
}

auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        const email = user.email;
        let parentName = 'Родитель';
        if (email) parentName = email.split('@')[0];
        const header = document.querySelector('.header p');
        if (header) header.innerHTML = `Добро пожаловать, ${parentName}! 👋`;
        initApp();
        monitorKioskToggle();
    } else {
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
        showLoginForm();
    }
});

function logout() { auth.signOut(); location.reload(); }

// Управление киоском
let kioskActive = false;
function monitorKioskToggle() {
    db.ref('kiosk/active').on('value', (snap) => {
        kioskActive = snap.val() === true;
        const toggle = document.getElementById('kioskToggle');
        if (toggle) {
            if (kioskActive) toggle.classList.add('active');
            else toggle.classList.remove('active');
        }
    });
}
async function toggleKioskMode() {
    const newState = !kioskActive;
    await db.ref('kiosk/active').set(newState);
    alert(newState ? 'Киоск-режим активирован' : 'Киоск-режим деактивирован');
}

// Остальные функции (инициализация, геолокация, права, история) – как ранее
function initApp() { initMap(); loadPermissions(); trackLocation(); monitorDeviceStatus(); monitorOnlineStatus(); loadHistory(1); }
function initMap() { map = L.map('map').setView([55.751244, 37.618423], 13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map); }
async function loadPermissions() { const s = await db.ref('kiosk/permissions').once('value'); const perms = s.val() || []; document.querySelectorAll('#permissions input').forEach(cb => { cb.checked = perms.includes(cb.value); }); }
async function savePermissions() { const allowed = []; document.querySelectorAll('#permissions input:checked').forEach(cb => allowed.push(cb.value)); await db.ref('kiosk/permissions').set(allowed); const v = (await db.ref('kiosk/version').once('value')).val() || 0; await db.ref('kiosk/version').set(v + 1); alert('✅ Права сохранены'); }
async function resetPermissions() { const def = ["com.android.dialer","com.android.gallery3d","com.android.contacts","com.android.camera","com.android.settings","com.android.chrome","com.max.messenger","com.android.mms"]; await db.ref('kiosk/permissions').set(def); const v = (await db.ref('kiosk/version').once('value')).val() || 0; await db.ref('kiosk/version').set(v + 1); await loadPermissions(); alert('🔄 Сброшено'); }
function trackLocation() { db.ref('kids/child_device/location').on('value', (s) => { const loc = s.val(); if (loc && map) { if (marker) marker.setLatLng([loc.lat, loc.lng]); else marker = L.marker([loc.lat, loc.lng]).addTo(map); map.setView([loc.lat, loc.lng], 15); document.getElementById('locationInfo').innerHTML = `📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>🎯 ${(loc.accuracy||50).toFixed(0)} м<br>🕐 ${new Date(loc.time).toLocaleString()}`; } }); }
function monitorDeviceStatus() { db.ref('.info/connected').on('value', (s) => { const d = document.getElementById('deviceStatus'); if (d) { d.className = s.val() ? 'status status-online' : 'status status-offline'; d.innerHTML = s.val() ? '✅ Устройство онлайн' : '❌ Устройство офлайн'; } }); }
function monitorOnlineStatus() { db.ref('kiosk/online_status').on('value', (s) => { const d = s.val(); if (d) { document.getElementById('statusIcon').innerHTML = d.status === 'online' ? '🟢' : '🔴'; document.getElementById('statusText').innerHTML = d.status === 'online' ? 'В сети' : 'Не в сети'; document.getElementById('batteryText').innerHTML = d.battery ? `🔋 Заряд: ${d.battery}%` : ''; } }); }
async function loadHistory(days) { const cutoff = Date.now() - days * 86400000; const container = document.getElementById('historyList'); container.innerHTML = '<div style="text-align:center; padding:40px;">Загрузка...</div>'; try { const snap = await db.ref('kids/child_device/activity_history/all_events').orderByChild('device_time').startAt(cutoff).once('value'); const events = []; snap.forEach(c => events.push(c.val())); events.sort((a,b) => (b.device_time||0) - (a.device_time||0)); if (events.length === 0) { container.innerHTML = '<div style="text-align:center; padding:40px;">Нет событий</div>'; return; } container.innerHTML = events.map(e => `<div class="history-item"><div class="history-icon">${e.type==='app_launch'?'🚀':(e.type==='status_change'?(e.title?.includes('в сети')?'🟢':'🔴'):'📍')}</div><div class="history-content"><div class="history-title">${e.title||''}</div><div class="history-details">${e.details||''}</div></div><div class="history-time">${new Date(e.device_time).toLocaleString()}</div></div>`).join(''); } catch(e) { container.innerHTML = '<div style="text-align:center; padding:40px; color:red;">Ошибка загрузки</div>'; } }
function escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
