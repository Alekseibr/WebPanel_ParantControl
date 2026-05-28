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

// ========== ОСНОВНЫЕ ФУНКЦИИ И СИНХРОНИЗАЦИЯ ==========
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
    const rawData = snapshot.val() || {};
    
    if (typeof rawData === 'object' && !Array.isArray(rawData)) {
        suspendedAppsList = Object.keys(rawData).map(key => key.replace(/_/g, '.'));
    } else {
        suspendedAppsList = Array.isArray(rawData) ? rawData : [];
    }
    updateToggleButtonState();
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

// Переключение тотального тумблера блокировки всего телефона
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
        console.error('Ошибка загрузки приложений:', error);
        container.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Ошибка</div>';
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
                    <div class="app-name">${escapeHtml(app.name)}${isBlocked ? ' <span style="color:#dc3545;">(заблокировано)</span>' : ''}</div>
                    <div class="app-package">${escapeHtml(app.packageName)}</div>
                </label>
            </div>
        `;
    }).join('');
}

function updateToggleButtonState() {
    const toggleBtn = document.getElementById('blockSelectedBtn') || document.getElementById('toggleBlockSelectedBtn');
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
// Переключение точечной блокировки выбранных чекбоксами приложений
async function toggleBlockSelected() {
    const selected = Array.from(document.querySelectorAll('#appsContainer input:checked')).map(cb => cb.value);
    if (selected.length === 0) {
        showNotification('Предупреждение', 'Выберите приложения');
        return;
    }
    
    const allSelectedBlocked = selected.every(pkg => suspendedAppsList.includes(pkg));
    
    try {
        let newBlockList = [];
        if (allSelectedBlocked) {
            // Если они заблокированы — убираем их из списка блокировок (размораживаем)
            newBlockList = suspendedAppsList.filter(pkg => !selected.includes(pkg));
            showNotification('Успешно', `Разблокировано ${selected.length} приложений`);
        } else {
            // Если не заблокированы — объединяем текущие блокировки с новыми
            newBlockList = Array.from(new Set([...suspendedAppsList, ...selected]));
            showNotification('Успешно', `Заблокировано ${selected.length} приложений`);
        }
        
        // Отправляем массив пакетов (с точками!) в исходный рабочий узел block_apps
        await db.ref('commands/block_apps').set(newBlockList);
        setTimeout(() => loadApps(), 1000);
    } catch (error) {
        console.error('Ошибка точечной блокировки:', error);
        showNotification('Ошибка', 'Не удалось применить конфигурацию');
    }
}

// 🚀 ПРИВЯЗАНО К КНОПКЕ HTML: Метод экстренного обновления суточного экранного времени
async function requestStatsRefresh() {
    showNotification('Синхронизация', 'Запрос актуального экранного времени отправлен...');
    try {
        await db.ref('commands/request_stats').set(true);
        console.log("✅ Команда request_stats успешно отправлена в Firebase");
    } catch (error) {
        console.error('Ошибка запроса статистики:', error);
    }
}

async function loadStats() {
    const tbody = document.getElementById('statsBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Загрузка статистики...</td></tr>';
    
    try {
        // Подписываемся на узел суточных логов в реальном времени
        db.ref('device/usage_stats').on('value', (snapshot) => {
            const data = snapshot.val() || {};
            const stats = data.installed_apps || {};
            
            const entries = Object.entries(stats);
            if (entries.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Экранное время за сегодня отсутствует</td></tr>';
                return;
            }
            
            // Сортируем массив по минутам (от большего к меньшему)
            entries.sort((a, b) => (b.timeInMinutes || 0) - (a.timeInMinutes || 0));
            
            // Выводим в таблицу НАЗВАНИЕ приложения и чистые минуты за сегодня
            tbody.innerHTML = entries.map(([_, appObject]) => `
                <tr>
                    <td style="font-weight:500;">📊 ${escapeHtml(appObject.name)}</td>
                    <td style="font-weight:bold; color:#007bff; text-align:right;">${appObject.timeInMinutes} мин.</td>
                </tr>
            `).join('');
        });
    } catch (error) {
        console.error('Критическая ошибка загрузки статистики в таблицу:', error);
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:red;">Ошибка загрузки данных</td></tr>';
    }
}

async function sync() {
    const syncBtn = document.getElementById('syncBtn');
    const syncStatus = document.getElementById('syncStatus');
    if (syncBtn) syncBtn.disabled = true;
    if (syncStatus) syncStatus.textContent = 'Синхронизация...';
    
    try {
        // Посылаем триггеры экстренного обновления во все фоновые службы Android
        await db.ref('commands/request_stats').set(true);
        await db.ref('commands/request_apps').set(true);
        await db.ref('commands/request_location').set(true);
        
        await new Promise(resolve => setTimeout(resolve, 2500));
        await loadDeviceStatus();
        await loadApps();
        
        if (syncStatus) syncStatus.textContent = '✅ Готово';
        setTimeout(() => { if (syncStatus) syncStatus.textContent = 'Готово'; }, 2000);
    } catch (error) {
        console.error('Ошибка глобальной синхронизации панели:', error);
        if (syncStatus) syncStatus.textContent = '❌ Ошибка';
    } finally { if (syncBtn) syncBtn.disabled = false; }
}

async function requestLocation() {
    try {
        // Путь команды изменен на правильный commands/request_location (совпадает с Android)
        await db.ref('commands/request_location').set(true);
        showNotification('Запрос отправлен', 'Ожидайте точечное определение координат чипом GPS...');
    } catch (error) {
        console.error('Ошибка отправки интента геолокации:', error);
        showNotification('Ошибка', 'Не удалось связаться с датчиком');
    }
}

function setupRealtimeListeners() {
    db.ref('device/status').on('value', () => loadDeviceStatus());
    db.ref('device/suspended_apps').on('value', () => { loadSuspendedApps(); loadApps(); });
    db.ref('commands/blocking_enabled').on('value', (snap) => { currentBlockingState = snap.val() === true; updateToggleButton(); });
}

function setupButtons() {
    const toggleBtn = document.getElementById('toggleBlocking');
    const syncBtn = document.getElementById('syncBtn');
    const loadAppsBtn = document.getElementById('loadAppsBtn');
    const blockSelectedBtn = document.getElementById('blockSelectedBtn') || document.getElementById('toggleBlockSelectedBtn');
    const requestLocationBtn = document.getElementById('requestLocationBtn');

    if (toggleBtn) toggleBtn.onclick = () => toggleBlocking();
    if (syncBtn) syncBtn.onclick = () => sync();
    if (loadAppsBtn) loadAppsBtn.onclick = () => loadApps();
    if (blockSelectedBtn) blockSelectedBtn.onclick = () => toggleBlockSelected();
    if (requestLocationBtn) requestLocationBtn.onclick = () => requestLocation();
}

// ========== АУТЕНТИФИКАЦИЯ И ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА ==========
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
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.textContent = '🚪 Выйти';
        logoutBtn.style.cssText = 'position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.2); border: none; padding: 8px 16px; border-radius: 20px; color: white; cursor: pointer; font-weight: 500; transition: background 0.2s;';
        
        logoutBtn.onmouseover = () => { logoutBtn.style.background = 'rgba(255,255,255,0.3)'; };
        logoutBtn.onmouseout = () => { logoutBtn.style.background = 'rgba(255,255,255,0.2)'; };
        
        logoutBtn.onclick = () => logout();
        header.style.position = 'relative';
        header.appendChild(logoutBtn);
    }
}
