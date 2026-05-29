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

// Инициализация системных модулей
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

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========
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
        console.error('Ошибка изменения блокировки:', error);
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
        
        restoreCheckboxesState();
        
        document.querySelectorAll('#appsContainer input').forEach(cb => {
            cb.addEventListener('change', () => updateSelectAllButtonState());
        });
        
        updateSelectAllButtonState();
    } catch (error) {
        console.error('Ошибка загрузки приложений:', error);
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

// Новая функция: состояние кнопки "Выбрать все / Снять все"
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

// Новая функция: выбрать все / снять все
function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('#appsContainer input[type="checkbox"]');
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (!selectAllBtn) return;
    
    const isAllChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
        cb.checked = !isAllChecked;
    });
    
    updateSelectAllButtonState();
    
    // Автоматически применяем изменения
    applyBlockedApps();
}

// Применить выбранные приложения (отправить в Firebase)
async function applyBlockedApps() {
    const blockedApps = Array.from(document.querySelectorAll('#appsContainer input:checked')).map(cb => cb.value);
    
    try {
        showNotification('Синхронизация', `Блокировка ${blockedApps.length} приложений...`);
        
        await db.ref('settings/blocked_apps').set(blockedApps);
        suspendedAppsList = blockedApps;
        await db.ref('device/suspended_apps').set(blockedApps);
        
        if (currentBlockingState) {
            await db.ref('commands/blocking_enabled').set(false);
            await new Promise(resolve => setTimeout(resolve, 300));
            await db.ref('commands/blocking_enabled').set(true);
        }
        
        updateCheckboxesState();
        
        showNotification('Готово', `Настройки блокировки применены`);
    } catch (error) {
        console.error('Ошибка сохранения чёрного списка:', error);
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
        console.error('Ошибка загрузки статистики:', error);
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
        await loadApps();
        
        if (syncStatus) syncStatus.textContent = '✅ Готово';
        setTimeout(() => { if (syncStatus) syncStatus.textContent = 'Готово'; }, 2000);
    } catch (error) {
        console.error('Ошибка глобальной синхронизации:', error);
        if (syncStatus) syncStatus.textContent = '❌ Ошибка';
    } finally { if (syncBtn) syncBtn.disabled = false; }
}

async function requestLocation() {
    try {
        await db.ref('commands/request_location').set(true);
        showNotification('Запрос отправлен', 'Ожидайте точечное определение координат чипом GPS...');
    } catch (error) {
        console.error('Ошибка отправки геолокации:', error);
        showNotification('Ошибка', 'Не удалось связаться с датчиком');
    }
}

function setupRealtimeListeners() {
    db.ref('device/status').on('value', () => loadDeviceStatus());
    
    db.ref('device/suspended_apps').on('value', (snapshot) => {
        suspendedAppsList = snapshot.val() || [];
        updateCheckboxesState();
        updateSelectAllButtonState();
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

    if (toggleBtn) toggleBtn.onclick = () => toggleBlocking();
    if (syncBtn) syncBtn.onclick = () => sync();
    if (loadAppsBtn) loadAppsBtn.onclick = () => loadApps();
    if (selectAllBtn) selectAllBtn.onclick = () => toggleSelectAll();
    if (requestLocationBtn) requestLocationBtn.onclick = () => requestLocation();
}

// ========== АУТЕНТИФИКАЦИЯ ==========
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        
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
    auth.signOut().then(() => {
        location.reload(); 
    }).catch((error) => {
        console.error("Ошибка при выходе:", error);
    });
}

function addLogoutButton() {
    const header = document.querySelector('.header');
    if (header && !document.getElementById('logoutBtn')) {
        // Добавляем отступ справа для заголовка
        const h1 = header.querySelector('h1');
        if (h1) {
            h1.style.marginRight = '80px';
        }
        
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.textContent = '🚪';
        
        logoutBtn.style.cssText = `
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            right: 15px;
            background: rgba(255,255,255,0.2);
            border: none;
            padding: 8px 12px;
            border-radius: 30px;
            color: white;
            cursor: pointer;
            font-weight: 500;
            font-size: 16px;
            transition: background 0.2s;
            z-index: 10;
        `;
        
        logoutBtn.onmouseover = () => { logoutBtn.style.background = 'rgba(255,255,255,0.3)'; };
        logoutBtn.onmouseout = () => { logoutBtn.style.background = 'rgba(255,255,255,0.2)'; };
        logoutBtn.onclick = () => logout();
        
        header.style.position = 'relative';
        header.appendChild(logoutBtn);
    }
}
