// Firebase конфигурация (ЗАМЕНИТЕ НА ВАШУ)
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
let accuracyCircle = null;
let currentUser = null;
let currentBlockingState = false;
let appsList = [];
let suspendedAppsList = [];
let notificationTimeout = null;

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('ru-RU');
}

function formatDuration(seconds) {
    if (!seconds) return '0 сек';
    if (seconds < 60) return `${Math.round(seconds)} сек`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин ${Math.round(seconds % 60)} сек`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ч ${minutes % 60} мин`;
}

function showNotification(title, body) {
    const existing = document.getElementById('inAppNotification');
    if (existing) existing.remove();
    if (notificationTimeout) clearTimeout(notificationTimeout);
    const notification = document.createElement('div');
    notification.id = 'inAppNotification';
    notification.className = 'in-app-notification';
    notification.innerHTML = `<div style="font-weight: bold; margin-bottom: 5px;">${escapeHtml(title)}</div><div style="font-size: 14px; opacity: 0.9;">${escapeHtml(body)}</div>`;
    document.body.appendChild(notification);
    notificationTimeout = setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Аутентификация
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        const email = user.email;
        let parentName = 'Родитель';
        if (email) parentName = email.split('@')[0];
        document.getElementById('welcomeMessage').innerHTML = `Добро пожаловать, ${parentName}! 👋`;
        initApp();
        addLogoutButton();
    } else {
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginButton');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = loginEmail.value.trim();
            const password = loginPassword.value.trim();
            if (!email || !password) {
                loginError.textContent = 'Введите email и пароль';
                loginError.style.display = 'block';
                return;
            }
            loginError.style.display = 'none';
            loginBtn.disabled = true;
            loginBtn.textContent = 'Вход...';
            try {
                await auth.signInWithEmailAndPassword(email, password);
            } catch (error) {
                let errorMessage = 'Ошибка входа';
                if (error.code === 'auth/user-not-found') errorMessage = 'Пользователь не найден';
                else if (error.code === 'auth/wrong-password') errorMessage = 'Неверный пароль';
                else if (error.code === 'auth/invalid-email') errorMessage = 'Неверный формат email';
                loginError.textContent = errorMessage;
                loginError.style.display = 'block';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Войти';
            }
        });
        loginPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') loginBtn.click(); });
    }
});

function logout() { auth.signOut(); location.reload(); }

function addLogoutButton() {
    const header = document.querySelector('.header');
    if (header && !document.getElementById('logoutBtn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.textContent = '🚪 Выйти';
        logoutBtn.style.cssText = 'position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.2); border: none; padding: 8px 16px; border-radius: 20px; color: white; cursor: pointer;';
        logoutBtn.onclick = () => logout();
        header.style.position = 'relative';
        header.appendChild(logoutBtn);
    }
}

function initApp() {
    initMap();
    loadBlockingState();
    loadDeviceStatus();
    loadLocation();
    loadApps();
    loadSuspendedApps();
    loadStats();
    setupRealtimeListeners();
    setupButtons();
}

function initMap() {
    map = L.map('map').setView([55.751244, 37.618423], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}

async function loadSuspendedApps() {
    const snapshot = await db.ref('device/suspended_apps').get();
    suspendedAppsList = snapshot.val() || [];
    updateToggleButtonState();
}

async function loadBlockingState() {
    const snapshot = await db.ref('commands/blocking_enabled').get();
    currentBlockingState = snapshot.val() === true;
    updateToggleButton();
}

function updateToggleButton() {
    const toggle = document.getElementById('toggleBlocking');
    if (currentBlockingState) toggle.classList.add('active');
    else toggle.classList.remove('active');
}

async function toggleBlocking() {
    const newState = !currentBlockingState;
    try {
        await db.ref('commands/blocking_enabled').set(newState);
        currentBlockingState = newState;
        updateToggleButton();
        showNotification('Блокировка', newState ? 'Включена' : 'Выключена');
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка', 'Не удалось изменить состояние');
    }
}

async function loadDeviceStatus() {
    const snapshot = await db.ref('device/status').get();
    const data = snapshot.val() || {};
    const now = Date.now();
    const lastSeen = data.lastSeen || 0;
    const isRecent = (now - lastSeen) < 300000;
    const statusDiv = document.getElementById('deviceStatusCard');
    const batteryText = document.getElementById('batteryText');
    const lastSeenText = document.getElementById('lastSeenText');
    if (isRecent && data.status === 'online') {
        statusDiv.className = 'status status-online';
        statusDiv.innerHTML = '<span class="status-badge online"></span> В сети';
    } else {
        statusDiv.className = 'status status-offline';
        statusDiv.innerHTML = '<span class="status-badge offline"></span> Не в сети';
    }
    batteryText.textContent = data.battery ? `${data.battery}%` : '-';
    lastSeenText.textContent = formatTime(data.lastSeen);
}

function loadLocation() {
    const locationRef = db.ref('kids/child_device/location');
    locationRef.on('value', (snapshot) => {
        const loc = snapshot.val();
        if (loc && loc.lat && loc.lng) {
            if (marker) marker.setLatLng([loc.lat, loc.lng]);
            else marker = L.marker([loc.lat, loc.lng]).addTo(map);
            map.setView([loc.lat, loc.lng], 15);
            if (accuracyCircle) map.removeLayer(accuracyCircle);
            accuracyCircle = L.circle([loc.lat, loc.lng], {
                radius: loc.accuracy || 50,
                color: '#007bff',
                fillColor: '#007bff',
                fillOpacity: 0.1
            }).addTo(map);
            document.getElementById('locationInfo').innerHTML = `
                📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>
                🎯 Точность: ${Math.round(loc.accuracy || 50)} м<br>
                🕐 ${new Date(loc.time).toLocaleString()}
            `;
        }
    });
}

async function loadApps() {
    const container = document.getElementById('appsContainer');
    container.innerHTML = '<div class="spinner"></div>';
    try {
        await db.ref('commands/request_apps').set(true);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const snapshot = await db.ref('device/apps_list').get();
        const allApps = snapshot.val() || [];
        await loadSuspendedApps();
        const userApps = allApps.filter(a => !a.isSystem);
        const systemApps = allApps.filter(a => a.isSystem);
        let html = '';
        if (userApps.length > 0) {
            html += '<div class="group-title">📱 Пользовательские приложения</div>';
            html += renderAppGroup(userApps);
        }
        if (systemApps.length > 0) {
            html += '<div class="group-title">⚙️ Системные приложения</div>';
            html += renderAppGroup(systemApps);
        }
        if (allApps.length === 0) html = '<div style="text-align:center; padding:20px;">Нет приложений</div>';
        container.innerHTML = html;
        document.querySelectorAll('#appsContainer input').forEach(cb => cb.addEventListener('change', () => updateToggleButtonState()));
    } catch (error) {
        console.error('Ошибка:', error);
        container.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Ошибка</div>';
    }
}

function renderAppGroup(apps) {
    return apps.map(app => {
        const isBlocked = suspendedAppsList.includes(app.packageName);
        return `
            <div class="app-item ${app.isSystem ? 'system' : ''}">
                <input type="checkbox" value="${escapeHtml(app.packageName)}" id="app_${app.packageName.replace(/\./g, '_')}">
                <label for="app_${app.packageName.replace(/\./g, '_')}">
                    <div class="app-name">${escapeHtml(app.name)}${isBlocked ? ' <span style="color:#dc3545;">(заблокировано)</span>' : ''}</div>
                    <div class="app-package">${escapeHtml(app.packageName)}</div>
                </label>
            </div>
        `;
    }).join('');
}

function updateToggleButtonState() {
    const toggleBtn = document.getElementById('toggleBlockSelectedBtn');
    if (!toggleBtn) return;
    const selected = Array.from(document.querySelectorAll('#appsContainer input:checked')).map(cb => cb.value);
    if (selected.length === 0) {
        toggleBtn.textContent = '🔒 Выберите приложения';
        toggleBtn.style.background = '#ccc';
        toggleBtn.disabled = true;
        return;
    }
    toggleBtn.disabled = false;
    const allSelectedBlocked = selected.every(pkg => suspendedAppsList.includes(pkg));
    if (allSelectedBlocked) {
        toggleBtn.textContent = '🔓 Разблокировать выбранные';
        toggleBtn.style.background = '#28a745';
    } else {
        toggleBtn.textContent = '🔒 Заблокировать выбранные';
        toggleBtn.style.background = '#dc3545';
    }
}

async function toggleBlockSelected() {
    const selected = Array.from(document.querySelectorAll('#appsContainer input:checked')).map(cb => cb.value);
    if (selected.length === 0) {
        showNotification('Предупреждение', 'Выберите приложения');
        return;
    }
    const allSelectedBlocked = selected.every(pkg => suspendedAppsList.includes(pkg));
    if (allSelectedBlocked) {
        try {
            await db.ref('commands/unblock_apps').set(selected);
            showNotification('Успешно', `Разблокировано ${selected.length} приложений`);
            setTimeout(() => loadApps(), 1000);
        } catch (error) {
            console.error('Ошибка:', error);
            showNotification('Ошибка', 'Не удалось разблокировать');
        }
    } else {
        const sanitized = selected.map(pkg => pkg.replace(/\./g, '_'));
        try {
            await db.ref('commands/block_apps').set(sanitized);
            showNotification('Успешно', `Заблокировано ${selected.length} приложений`);
            setTimeout(() => loadApps(), 1000);
        } catch (error) {
            console.error('Ошибка:', error);
            showNotification('Ошибка', 'Не удалось заблокировать');
        }
    }
}

async function loadStats() {
    const tbody = document.getElementById('statsBody');
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Загрузка...</td></tr>';
    try {
        const appsSnapshot = await db.ref('device/apps_list').get();
        const allApps = appsSnapshot.val() || [];
        const userAppPackages = allApps.filter(a => !a.isSystem).map(a => a.packageName);
        const snapshot = await db.ref('device/usage_stats').get();
        let stats = snapshot.val() || {};
        const restoredStats = {};
        Object.keys(stats).forEach(key => {
            const originalKey = key.replace(/_/g, '.');
            restoredStats[originalKey] = stats[key];
        });
        const userStats = {};
        for (const [pkg, time] of Object.entries(restoredStats)) {
            if (userAppPackages.includes(pkg)) userStats[pkg] = time;
        }
        const entries = Object.entries(userStats);
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Нет данных</td></tr>';
            return;
        }
        entries.sort((a, b) => b[1] - a[1]);
        tbody.innerHTML = entries.map(([pkg, time]) => `
            <tr><td style="word-break:break-all;">${escapeHtml(pkg)}</td><td>${formatDuration(Math.round(time / 1000))}</td></tr>
        `).join('');
    } catch (error) {
        console.error('Ошибка:', error);
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Ошибка загрузки</td></tr>';
    }
}

async function sync() {
    const syncBtn = document.getElementById('syncBtn');
    const syncStatus = document.getElementById('syncStatus');
    syncBtn.disabled = true;
    syncStatus.textContent = 'Синхронизация...';
    try {
        await db.ref('commands/sync_request').set(true);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await loadDeviceStatus();
        await loadLocation();
        await loadApps();
        await loadStats();
        syncStatus.textContent = '✅ Готово';
        setTimeout(() => { syncStatus.textContent = 'Готово'; }, 2000);
    } catch (error) {
        console.error('Ошибка:', error);
        syncStatus.textContent = '❌ Ошибка';
    } finally { syncBtn.disabled = false; }
}

async function requestLocation() {
    try {
        await db.ref('commands/get_location').set(true);
        showNotification('Запрос отправлен', 'Ожидайте определение местоположения...');
        setTimeout(() => {
            const locationRef = db.ref('kids/child_device/location');
            locationRef.once('value').then((snapshot) => {
                const loc = snapshot.val();
                if (loc && loc.lat && loc.lng) {
                    if (marker) marker.setLatLng([loc.lat, loc.lng]);
                    else marker = L.marker([loc.lat, loc.lng]).addTo(map);
                    map.setView([loc.lat, loc.lng], 15);
                    document.getElementById('locationInfo').innerHTML = `📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>🎯 ${Math.round(loc.accuracy || 50)} м<br>🕐 ${new Date(loc.time).toLocaleString()}`;
                } else showNotification('Ошибка', 'Не удалось получить координаты');
            });
        }, 5000);
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка', 'Не удалось отправить запрос');
    }
}

function setupRealtimeListeners() {
    db.ref('device/status').on('value', () => loadDeviceStatus());
    db.ref('device/suspended_apps').on('value', () => { loadSuspendedApps(); loadApps(); });
    db.ref('commands/blocking_enabled').on('value', (snap) => { currentBlockingState = snap.val() === true; updateToggleButton(); });
}

function setupButtons() {
    document.getElementById('toggleBlocking').onclick = () => toggleBlocking();
    document.getElementById('syncBtn').onclick = () => sync();
    document.getElementById('loadAppsBtn').onclick = () => loadApps();
    document.getElementById('blockSelectedBtn').onclick = () => toggleBlockSelected();
    document.getElementById('requestLocationBtn').onclick = () => requestLocation();
}
