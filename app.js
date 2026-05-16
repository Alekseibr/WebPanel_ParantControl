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
let accuracyCircle = null;
let currentUser = null;
let currentBlockingState = false;
let appsList = [];
let notificationTimeout = null;
let suspendedAppsList = []; // Список заблокированных приложений

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
    notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">${escapeHtml(title)}</div>
        <div style="font-size: 14px; opacity: 0.9;">${escapeHtml(body)}</div>
    `;
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
        if (email) {
            const name = email.split('@')[0];
            parentName = name.charAt(0).toUpperCase() + name.slice(1);
        }
        document.getElementById('welcomeMessage').innerHTML = `Добро пожаловать, ${parentName}! 👋`;
        
        initApp();
        addLogoutButton();
    } else {
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
    }
});

// Обработчик входа
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
                if (error.code === 'auth/user-not-found') {
                    errorMessage = 'Пользователь не найден';
                } else if (error.code === 'auth/wrong-password') {
                    errorMessage = 'Неверный пароль';
                } else if (error.code === 'auth/invalid-email') {
                    errorMessage = 'Неверный формат email';
                }
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
    auth.signOut();
    location.reload();
}

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

// Инициализация
function initApp() {
    initMap();
    loadBlockingState();
    loadDeviceStatus();
    loadLocation();
    loadApps();
    loadHistory(1);
    loadStats();
    loadSuspendedApps(); // Загружаем список заблокированных приложений
    setupRealtimeListeners();
    setupButtons();
}

function initMap() {
    map = L.map('map').setView([55.751244, 37.618423], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// Загрузка списка заблокированных приложений
async function loadSuspendedApps() {
    const snapshot = await db.ref('device/suspended_apps').get();
    suspendedAppsList = snapshot.val() || [];
    updateToggleButtonState(); // Обновляем состояние кнопки
}

// Управление блокировкой
async function loadBlockingState() {
    const snapshot = await db.ref('commands/blocking_enabled').get();
    currentBlockingState = snapshot.val() === true;
    updateToggleButton();
}

function updateToggleButton() {
    const toggle = document.getElementById('toggleBlocking');
    if (currentBlockingState) {
        toggle.classList.add('active');
    } else {
        toggle.classList.remove('active');
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
        console.error('Ошибка:', error);
        showNotification('Ошибка', 'Не удалось изменить состояние');
    }
}

// Статус устройства
async function loadDeviceStatus() {
    const snapshot = await db.ref('device/status').get();
    const data = snapshot.val() || {};
    
    const statusDiv = document.getElementById('deviceStatusCard');
    const statusText = document.getElementById('deviceStatusText');
    const batteryText = document.getElementById('batteryText');
    const lastSeenText = document.getElementById('lastSeenText');
    
    if (data.status === 'online') {
        statusDiv.className = 'status status-online';
        statusDiv.innerHTML = '<span class="status-badge online"></span> В сети';
    } else {
        statusDiv.className = 'status status-offline';
        statusDiv.innerHTML = '<span class="status-badge offline"></span> Не в сети';
    }
    
    batteryText.textContent = data.battery ? `${data.battery}%` : '-';
    lastSeenText.textContent = formatTime(data.lastSeen);
}

// Геолокация
function loadLocation() {
    const locationRef = db.ref('device/location');
    locationRef.on('value', (snapshot) => {
        const loc = snapshot.val();
        if (loc && loc.lat && loc.lng) {
            if (marker) {
                marker.setLatLng([loc.lat, loc.lng]);
            } else {
                marker = L.marker([loc.lat, loc.lng]).addTo(map);
                marker.bindPopup('Ребёнок здесь');
            }
            map.setView([loc.lat, loc.lng], 15);
            
            if (accuracyCircle) map.removeLayer(accuracyCircle);
            accuracyCircle = L.circle([loc.lat, loc.lng], {
                radius: loc.accuracy || 50,
                color: '#007bff',
                fillColor: '#007bff',
                fillOpacity: 0.1
            }).addTo(map);
            
            document.getElementById('locationInfo').innerHTML = `
                📍 Широта: ${loc.lat.toFixed(6)}<br>
                📍 Долгота: ${loc.lng.toFixed(6)}<br>
                🎯 Точность: ${Math.round(loc.accuracy || 50)} м<br>
                🕐 ${formatTime(loc.time)}
            `;
        }
    });
}

// Приложения
async function loadApps() {
    const container = document.getElementById('appsContainer');
    container.innerHTML = '<div class="spinner"></div>';
    
    try {
        await db.ref('commands/request_apps').set(true);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const snapshot = await db.ref('device/apps_list').get();
        const allApps = snapshot.val() || [];
        
        // Обновляем список заблокированных
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
        if (allApps.length === 0) {
            html = '<div style="text-align: center; padding: 20px; color: #666;">Нет приложений</div>';
        }
        container.innerHTML = html;
        
        // Добавляем обработчики для обновления состояния кнопки при выборе
        document.querySelectorAll('#appsContainer input').forEach(cb => {
            cb.addEventListener('change', () => updateToggleButtonState());
        });
        
        window.allAppsList = allApps;
        
    } catch (error) {
        console.error('Ошибка загрузки приложений:', error);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Ошибка загрузки</div>';
    }
}

function renderAppGroup(apps) {
    return apps.map(app => {
        const isBlocked = suspendedAppsList.includes(app.packageName);
        return `
            <div class="app-item ${app.isSystem ? 'system' : ''}" data-package="${app.packageName}">
                <input type="checkbox" value="${escapeHtml(app.packageName)}" id="app_${app.packageName.replace(/\./g, '_')}">
                <label for="app_${app.packageName.replace(/\./g, '_')}">
                    <div class="app-name">
                        ${escapeHtml(app.name)}
                        ${isBlocked ? ' <span style="color: #dc3545; font-size: 11px;">(заблокировано)</span>' : ''}
                    </div>
                    <div class="app-package">${escapeHtml(app.packageName)}</div>
                </label>
            </div>
        `;
    }).join('');
}

// Обновление состояния кнопки (Заблокировать / Разблокировать)
function updateToggleButtonState() {
    const toggleBtn = document.getElementById('toggleBlockSelectedBtn');
    if (!toggleBtn) return;
    
    const selected = [];
    document.querySelectorAll('#appsContainer input:checked').forEach(cb => {
        selected.push(cb.value);
    });
    
    if (selected.length === 0) {
        toggleBtn.textContent = '🔒 Выберите приложения';
        toggleBtn.style.background = '#ccc';
        toggleBtn.disabled = true;
        return;
    }
    
    toggleBtn.disabled = false;
    
    // Проверяем, все ли выбранные приложения уже заблокированы
    const allSelectedBlocked = selected.every(pkg => suspendedAppsList.includes(pkg));
    
    if (allSelectedBlocked) {
        toggleBtn.textContent = '🔓 Разблокировать выбранные';
        toggleBtn.style.background = '#28a745';
    } else {
        toggleBtn.textContent = '🔒 Заблокировать выбранные';
        toggleBtn.style.background = '#dc3545';
    }
}

// Одна кнопка с переключением
async function toggleBlockSelected() {
    const toggleBtn = document.getElementById('toggleBlockSelectedBtn');
    const selected = [];
    document.querySelectorAll('#appsContainer input:checked').forEach(cb => {
        selected.push(cb.value);
    });
    
    if (selected.length === 0) {
        showNotification('Предупреждение', 'Выберите приложения');
        return;
    }
    
    // Проверяем, все ли выбранные приложения уже заблокированы
    const allSelectedBlocked = selected.every(pkg => suspendedAppsList.includes(pkg));
    
    if (allSelectedBlocked) {
        // Разблокировать
        try {
            await db.ref('commands/unblock_apps').set(selected);
            showNotification('Успешно', `Разблокировано ${selected.length} приложений`);
            // Обновляем список
            setTimeout(() => loadApps(), 1000);
        } catch (error) {
            console.error('Ошибка:', error);
            showNotification('Ошибка', 'Не удалось разблокировать');
        }
    } else {
        // Заблокировать
        const sanitized = selected.map(pkg => pkg.replace(/\./g, '_'));
        try {
            await db.ref('commands/block_apps').set(sanitized);
            showNotification('Успешно', `Заблокировано ${selected.length} приложений`);
            // Обновляем список
            setTimeout(() => loadApps(), 1000);
        } catch (error) {
            console.error('Ошибка:', error);
            showNotification('Ошибка', 'Не удалось заблокировать');
        }
    }
}

// История
async function loadHistory(days) {
    const cutoff = Date.now() - days * 86400000;
    const container = document.getElementById('historyList');
    container.innerHTML = '<div class="spinner"></div>';
    
    try {
        const snapshot = await db.ref('kids/child_device/activity_history/all_events')
            .once('value');
        
        const events = [];
        snapshot.forEach(child => {
            const val = child.val();
            if (val.device_time && val.device_time >= cutoff) {
                events.push({ id: child.key, ...val });
            }
        });
        events.sort((a, b) => (b.device_time || 0) - (a.device_time || 0));
        
        if (events.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Нет событий</div>';
            return;
        }
        
        container.innerHTML = events.map(event => {
            let icon = '📋';
            switch (event.type) {
                case 'app_launch': icon = '🚀'; break;
                case 'status_change': icon = event.title?.includes('в сети') ? '🟢' : '🔴'; break;
                case 'kiosk_start': icon = '🟢'; break;
                case 'kiosk_exit': icon = '🔴'; break;
                case 'location': icon = '📍'; break;
                default: icon = '📌';
            }
            return `
                <div class="history-item">
                    <div class="history-icon">${icon}</div>
                    <div class="history-content">
                        <div class="history-title">${escapeHtml(event.title || 'Событие')}</div>
                        <div class="history-details">${escapeHtml(event.details || '')}</div>
                    </div>
                    <div class="history-time">${formatTime(event.device_time)}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: red;">Ошибка загрузки</div>';
    }
}

async function clearHistory() {
    if (!confirm('⚠️ Очистить всю историю? Это действие нельзя отменить.')) return;
    try {
        await db.ref('kids/child_device/activity_history').remove();
        showNotification('Готово', 'История очищена');
        loadHistory(7);
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка', 'Не удалось очистить историю');
    }
}

// Статистика (только пользовательские приложения)
async function loadStats() {
    const tbody = document.getElementById('statsBody');
    tbody.innerHTML = '<td><td colspan="2" style="text-align: center;">Загрузка...</td></tr>';
    
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
            if (userAppPackages.includes(pkg)) {
                userStats[pkg] = time;
            }
        }
        
        const entries = Object.entries(userStats);
        
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align: center;">Нет данных (только пользовательские приложения)</td></tr>';
            return;
        }
        
        entries.sort((a, b) => b[1] - a[1]);
        tbody.innerHTML = entries.map(([pkg, time]) => `
            <tr>
                <td style="word-break: break-all;">${escapeHtml(pkg)}</td>
                <td>${formatDuration(Math.round(time / 1000))}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Ошибка:', error);
        tbody.innerHTML = '<tr><td colspan="2" style="text-align: center;">Ошибка загрузки</td></tr>';
    }
}

// Синхронизация
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
    } finally {
        syncBtn.disabled = false;
    }
}

// Real-time слушатели
function setupRealtimeListeners() {
    db.ref('device/status').on('value', () => loadDeviceStatus());
    db.ref('device/suspended_apps').on('value', () => {
        loadSuspendedApps();
        loadApps();
    });
    db.ref('commands/blocking_enabled').on('value', (snap) => {
        currentBlockingState = snap.val() === true;
        updateToggleButton();
    });
    db.ref('parent_notifications').limitToLast(10).on('child_added', (snap) => {
        const data = snap.val();
        if (data && data.title) {
            showNotification(data.title, data.body);
        }
    });
}

function setupButtons() {
    const toggleBlockingBtn = document.getElementById('toggleBlocking');
    const syncBtn = document.getElementById('syncBtn');
    const loadAppsBtn = document.getElementById('loadAppsBtn');
    const toggleBlockSelectedBtn = document.getElementById('toggleBlockSelectedBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    
    if (toggleBlockingBtn) toggleBlockingBtn.onclick = () => toggleBlocking();
    if (syncBtn) syncBtn.onclick = () => sync();
    if (loadAppsBtn) loadAppsBtn.onclick = () => loadApps();
    if (toggleBlockSelectedBtn) toggleBlockSelectedBtn.onclick = () => toggleBlockSelected();
    if (clearHistoryBtn) clearHistoryBtn.onclick = () => clearHistory();
}
