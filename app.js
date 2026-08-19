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
let suspendedAppsList = [];
let notificationTimeout = null;
let windowsDevices = {};

// ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ----------
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

// ---------- WINDOWS УСТРОЙСТВА ----------
function loadWindowsDevices() {
    db.ref('windows/devices').on('value', (snapshot) => {
        const devices = snapshot.val() || {};
        windowsDevices = devices;
        renderWindowsDevices(devices);
    });
}

function renderWindowsDevices(devices) {
    const container = document.getElementById('windowsDevicesContainer');
    if (!container) return;

    const deviceIds = Object.keys(devices);
    if (deviceIds.length === 0) {
        container.innerHTML = '<div class="no-devices">Нет Windows устройств</div>';
        return;
    }

    let html = '';
    for (const [deviceId, data] of Object.entries(devices)) {
        const isBlocked = data.blocking_enabled === true;
        const deviceName = data.name || deviceId;

        html += `
            <div class="windows-device" data-device-id="${escapeHtml(deviceId)}">
                <div class="device-header">
                    <div class="device-name">
                        <input type="text" class="device-name-input" value="${escapeHtml(deviceName)}" 
                               data-device-id="${escapeHtml(deviceId)}" 
                               onchange="updateDeviceName('${escapeHtml(deviceId)}', this.value)">
                    </div>
                    <div class="device-actions">
                        <button class="btn-danger-sm" onclick="deleteDevice('${escapeHtml(deviceId)}')">🗑️ Удалить</button>
                    </div>
                </div>
                <div class="device-toggle">
                    <span style="font-size:14px;">Блокировка</span>
                    <div class="toggle-button ${isBlocked ? 'active' : ''}" 
                         onclick="toggleWindowsDevice('${escapeHtml(deviceId)}', ${!isBlocked})"
                         id="windows-toggle-${escapeHtml(deviceId)}">
                    </div>
                    <span class="device-status-text">${isBlocked ? '🔒 Заблокировано' : '🔓 Разблокировано'}</span>
                </div>
                <div style="font-size:11px; color:#999; margin-top:4px;">
                    ID: ${escapeHtml(deviceId)}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

async function toggleWindowsDevice(deviceId, newState) {
    try {
        await db.ref(`windows/devices/${deviceId}/blocking_enabled`).set(newState);
        showNotification('Windows', `Устройство ${newState ? 'заблокировано' : 'разблокировано'}`);
    } catch (error) {
        showNotification('Ошибка', 'Не удалось изменить состояние');
        console.error(error);
    }
}

async function updateDeviceName(deviceId, newName) {
    if (!newName || newName.trim() === '') {
        showNotification('Ошибка', 'Имя не может быть пустым');
        // Восстанавливаем старое имя
        renderWindowsDevices(windowsDevices);
        return;
    }
    try {
        await db.ref(`windows/devices/${deviceId}/name`).set(newName.trim());
        showNotification('Успех', 'Имя устройства обновлено');
    } catch (error) {
        showNotification('Ошибка', 'Не удалось обновить имя');
        console.error(error);
    }
}

async function deleteDevice(deviceId) {
    if (!confirm(`Удалить устройство "${deviceId}"?`)) return;
    try {
        await db.ref(`windows/devices/${deviceId}`).remove();
        showNotification('Успех', 'Устройство удалено');
    } catch (error) {
        showNotification('Ошибка', 'Не удалось удалить устройство');
        console.error(error);
    }
}

async function addWindowsDevice() {
    const deviceId = prompt('Введите имя устройства (например, DESKTOP-ABC123 или LAPTOP-XYZ789):');
    if (!deviceId || deviceId.trim() === '') return;
    
    const trimmedId = deviceId.trim();
    
    // Проверяем, существует ли уже такое устройство
    if (windowsDevices[trimmedId]) {
        showNotification('Ошибка', 'Устройство с таким именем уже существует');
        return;
    }
    
    try {
        await db.ref(`windows/devices/${trimmedId}/blocking_enabled`).set(false);
        await db.ref(`windows/devices/${trimmedId}/name`).set(trimmedId);
        showNotification('Успех', `Устройство "${trimmedId}" добавлено`);
    } catch (error) {
        showNotification('Ошибка', 'Не удалось добавить устройство');
        console.error(error);
    }
}

// ---------- ОСТАЛЬНЫЕ ФУНКЦИИ (Android) ----------
function initApp() {
    initMap();
    loadBlockingState();
    loadDeviceStatus();
    loadLocation();
    loadApps();
    loadInitialBlockedList();
    loadStats();
    loadUnlockPassword();
    loadWindowsDevices();
    setupRealtimeListeners();
    setupButtons();
}

function initMap() {
    map = L.map('map').setView([55.751244, 37.618423], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}

async function loadInitialBlockedList() {
    const snapshot = await db.ref('settings/blocked_apps').get();
    suspendedAppsList = snapshot.val() || [];
    updateCheckboxesState();
    updateSelectAllButtonState();
}

function updateCheckboxesState() {
    document.querySelectorAll('#appsContainer input[type="checkbox"]').forEach(cb => {
        const isBlocked = suspendedAppsList.includes(cb.value);
        cb.checked = isBlocked;
        const appDiv = cb.closest('.app-item');
        if (appDiv) {
            const nameDiv = appDiv.querySelector('.app-name');
            if (nameDiv) {
                const badge = nameDiv.querySelector('.blocked-badge');
                if (isBlocked) {
                    if (!badge) {
                        nameDiv.innerHTML += ' <span class="blocked-badge" style="color:#dc3545; font-weight:bold;">(заблокировано)</span>';
                    }
                } else {
                    if (badge) badge.remove();
                }
            }
        }
    });
}

async function loadBlockingState() {
    const snapshot = await db.ref('commands/blocking_enabled').get();
    currentBlockingState = snapshot.val() === true;
    updateToggleButton();
}

function updateToggleButton() {
    const toggle = document.getElementById('toggleBlocking');
    if (toggle) {
        if (currentBlockingState) toggle.classList.add('active');
        else toggle.classList.remove('active');
    }
}

async function toggleBlocking() {
    const newState = !currentBlockingState;
    try {
        await db.ref('commands/blocking_enabled').set(newState);
        currentBlockingState = newState;
        updateToggleButton();
        showNotification('Блокировка', newState ? 'Включена' : 'Выключена');
    } catch (error) {
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
    
    if (statusDiv) {
        if (isRecent && data.status === 'online') {
            statusDiv.className = 'status status-online';
            statusDiv.innerHTML = '<span class="status-badge online"></span> В сети';
        } else {
            statusDiv.className = 'status status-offline';
            statusDiv.innerHTML = '<span class="status-badge offline"></span> Не в сети';
        }
    }
    if (batteryText) batteryText.textContent = data.battery ? `${data.battery}%` : '-';
    if (lastSeenText) lastSeenText.textContent = formatTime(data.lastSeen);
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
            
            const locInfo = document.getElementById('locationInfo');
            if (locInfo) {
                locInfo.innerHTML = `
                    📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>
                    🎯 Точность: ${Math.round(loc.accuracy || 50)} м<br>
                    🕐 ${new Date(loc.time).toLocaleString()}
                `;
            }
        }
    });
}

async function loadApps() {
    const container = document.getElementById('appsContainer');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center; padding:20px;">Загрузка приложений...</div>';
    try {
        await db.ref('commands/request_apps').set(true);
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        const snapshot = await db.ref('device/apps_list').get();
        const allApps = snapshot.val() || [];
        
        const userApps = allApps.filter(a => !a.isSystem);
        const systemApps = allApps.filter(a => a.isSystem);
        let html = '';
        
        if (userApps.length > 0) {
            html += '<div class="group-title">📱 Пользовательские приложения</div>';
            html += renderAppGroup(userApps);
        }
        if (systemApps.length > 0) {
            html += '<div class="group-title">⚙️ Системные приложения (не блокируются)</div>';
            html += renderAppGroup(systemApps);
        }
        if (allApps.length === 0) html = '<div style="text-align:center; padding:20px;">Нет приложений</div>';
        container.innerHTML = html;
        
        restoreCheckboxesState();
        
        document.querySelectorAll('#appsContainer input').forEach(cb => {
            cb.addEventListener('change', () => {
                updateSelectAllButtonState();
                applyBlockedApps();
            });
        });
        
        updateSelectAllButtonState();
    } catch (error) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Ошибка загрузки</div>';
    }
}

function renderAppGroup(apps) {
    return apps.map(app => {
        const isBlocked = suspendedAppsList.includes(app.packageName);
        const inputId = `app_${app.packageName.replace(/\./g, '_')}`;
        
        return `
            <div class="app-item ${app.isSystem ? 'system' : ''}">
                <input type="checkbox" value="${escapeHtml(app.packageName)}" id="${inputId}" ${isBlocked ? 'checked' : ''}>
                <label for="${inputId}">
                    <div class="app-name">${escapeHtml(app.name)}${isBlocked ? ' <span class="blocked-badge" style="color:#dc3545; font-weight:bold;">(заблокировано)</span>' : ''}</div>
                    <div class="app-package">${escapeHtml(app.packageName)}</div>
                </label>
            </div>
        `;
    }).join('');
}

function restoreCheckboxesState() {
    document.querySelectorAll('#appsContainer input[type="checkbox"]').forEach(cb => {
        const isBlocked = suspendedAppsList.includes(cb.value);
        cb.checked = isBlocked;
    });
}

function updateSelectAllButtonState() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (!selectAllBtn) return;
    
    const checkboxes = document.querySelectorAll('#appsContainer input[type="checkbox"]');
    const totalCount = checkboxes.length;
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    if (totalCount === 0) return;
    
    if (checkedCount === totalCount) {
        selectAllBtn.textContent = '✅ Снять все';
        selectAllBtn.style.background = '#ffc107';
        selectAllBtn.style.color = '#333';
    } else {
        selectAllBtn.textContent = '☑️ Выбрать все';
        selectAllBtn.style.background = '#28a745';
        selectAllBtn.style.color = 'white';
    }
}

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('#appsContainer input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => { cb.checked = !allChecked; });
    updateSelectAllButtonState();
    applyBlockedApps();
}

async function applyBlockedApps() {
    const blockedApps = Array.from(document.querySelectorAll('#appsContainer input:checked')).map(cb => cb.value);
    
    try {
        showNotification('Синхронизация', `Блокировка ${blockedApps.length} приложений...`);
        await db.ref('settings/blocked_apps').set(blockedApps);
        suspendedAppsList = blockedApps;
        
        if (currentBlockingState) {
            await db.ref('commands/blocking_enabled').set(false);
            await new Promise(resolve => setTimeout(resolve, 300));
            await db.ref('commands/blocking_enabled').set(true);
        }
        
        updateCheckboxesState();
        showNotification('Готово', `Заблокировано ${blockedApps.length} приложений`);
    } catch (error) {
        showNotification('Ошибка', 'Не удалось отправить конфигурацию');
    }
}

async function requestStatsRefresh() {
    showNotification('Синхронизация', 'Запрос актуального экранного времени отправлен...');
    try {
        await db.ref('commands/request_stats').set(true);
    } catch (error) {
        console.error('Ошибка запроса статистики:', error);
    }
}

async function loadStats() {
    const tbody = document.getElementById('statsBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Загрузка статистики...</td></tr>';
    
    try {
        db.ref('device/usage_stats').on('value', (snapshot) => {
            const data = snapshot.val() || {};
            const stats = data.installed_apps || {};
            
            const entries = Object.entries(stats);
            if (entries.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Экранное время за сегодня отсутствует</td></tr>';
                return;
            }
            
            entries.sort((a, b) => (b[1].timeInMinutes || 0) - (a[1].timeInMinutes || 0));
            
            tbody.innerHTML = entries.map(([_, appObject]) => `
                <tr>
                    <td style="font-weight:500;">📊 ${escapeHtml(appObject.name)}</td>
                    <td style="font-weight:bold; color:#007bff; text-align:right;">${appObject.timeInMinutes} мин.</td>
                </tr>
            `).join('');
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:red;">Ошибка загрузки данных</td></tr>';
    }
}

async function sync() {
    const syncBtn = document.getElementById('syncBtn');
    const syncStatus = document.getElementById('syncStatus');
    if (syncBtn) syncBtn.disabled = true;
    if (syncStatus) syncStatus.textContent = 'Синхронизация...';
    
    try {
        await db.ref('commands/request_stats').set(true);
        await db.ref('commands/request_apps').set(true);
        await db.ref('commands/request_location').set(true);
        await new Promise(resolve => setTimeout(resolve, 2500));
        await loadDeviceStatus();
        if (syncStatus) syncStatus.textContent = '✅ Готово';
        setTimeout(() => { if (syncStatus) syncStatus.textContent = 'Готово'; }, 2000);
    } catch (error) {
        if (syncStatus) syncStatus.textContent = '❌ Ошибка';
    } finally { if (syncBtn) syncBtn.disabled = false; }
}

async function requestLocation() {
    try {
        await db.ref('commands/request_location').set(true);
        showNotification('Запрос отправлен', 'Ожидайте точечное определение координат чипом GPS...');
    } catch (error) {
        showNotification('Ошибка', 'Не удалось связаться с датчиком');
    }
}

async function loadUnlockPassword() {
    const snapshot = await db.ref('settings/unlock_password').get();
    const password = snapshot.val() || '';
    const input = document.getElementById('unlockPasswordInput');
    if (input) input.value = password;
}

async function saveUnlockPassword() {
    const input = document.getElementById('unlockPasswordInput');
    const statusDiv = document.getElementById('unlockPasswordStatus');
    const password = input.value.trim();
    
    if (!password) {
        showNotification('Ошибка', 'Пароль не может быть пустым');
        return;
    }
    
    try {
        await db.ref('settings/unlock_password').set(password);
        showNotification('Успех', 'Пароль разблокировки сохранен');
        if (statusDiv) {
            statusDiv.textContent = '✅ Пароль сохранен';
            statusDiv.style.color = '#28a745';
            setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        }
    } catch (error) {
        showNotification('Ошибка', 'Не удалось сохранить пароль');
    }
}

function setupRealtimeListeners() {
    db.ref('device/status').on('value', () => loadDeviceStatus());
    db.ref('settings/blocked_apps').on('value', (snapshot) => {
        const newList = snapshot.val() || [];
        if (JSON.stringify(suspendedAppsList) !== JSON.stringify(newList)) {
            suspendedAppsList = newList;
            updateCheckboxesState();
            updateSelectAllButtonState();
        }
    });
    db.ref('commands/blocking_enabled').on('value', (snap) => { 
        currentBlockingState = snap.val() === true; 
        updateToggleButton(); 
    });
}

function setupButtons() {
    const toggleBtn = document.getElementById('toggleBlocking');
    const syncBtn = document.getElementById('syncBtn');
    const loadAppsBtn = document.getElementById('loadAppsBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const requestLocationBtn = document.getElementById('requestLocationBtn');
    const savePasswordBtn = document.getElementById('saveUnlockPasswordBtn');
    const addDeviceBtn = document.getElementById('addWindowsDeviceBtn');

    if (toggleBtn) toggleBtn.onclick = () => toggleBlocking();
    if (syncBtn) syncBtn.onclick = () => sync();
    if (loadAppsBtn) loadAppsBtn.onclick = () => loadApps();
    if (selectAllBtn) selectAllBtn.onclick = () => toggleSelectAll();
    if (requestLocationBtn) requestLocationBtn.onclick = () => requestLocation();
    if (savePasswordBtn) savePasswordBtn.onclick = () => saveUnlockPassword();
    if (addDeviceBtn) addDeviceBtn.onclick = () => addWindowsDevice();
}

// ---------- АУТЕНТИФИКАЦИЯ ----------
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        
        const snapshot = await db.ref('users/' + user.uid).get();
        if (!snapshot.exists()) {
            await db.ref('users/' + user.uid).set({
                email: user.email,
                role: 'parent'
            });
        }
        
        const authContainer = document.getElementById('authContainer');
        const appContainer = document.getElementById('appContainer');
        const welcomeMessage = document.getElementById('welcomeMessage');
        
        if (authContainer) authContainer.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
        
        const email = user.email;
        let parentName = 'Родитель';
        if (email) parentName = email.split('@')[0];
        
        if (welcomeMessage) {
            welcomeMessage.innerHTML = `Добро пожаловать, ${parentName}! 👋`;
        }
        
        initApp();
        addLogoutButton();
    } else {
        const authContainer = document.getElementById('authContainer');
        const appContainer = document.getElementById('appContainer');
        if (authContainer) authContainer.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginButton');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');
    
    if (loginBtn && loginEmail && loginPassword && loginError) {
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
        
        loginPassword.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') loginBtn.click(); 
        });
    }
});

function logout() { 
    auth.signOut().then(() => { location.reload(); });
}

function addLogoutButton() {
    const header = document.querySelector('.header');
    if (header && !document.getElementById('logoutBtn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.textContent = '🚪 Выйти';
        logoutBtn.style.cssText = `
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            right: 15px;
            background: rgba(255,255,255,0.2);
            border: none;
            padding: 6px 12px;
            border-radius: 20px;
            color: white;
            cursor: pointer;
            font-weight: 500;
            font-size: 12px;
            z-index: 10;
        `;
        logoutBtn.onclick = () => logout();
        header.style.position = 'relative';
        header.appendChild(logoutBtn);
    }
}
