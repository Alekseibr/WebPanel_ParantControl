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

// ========== АУТЕНТИФИКАЦИЯ БЕЗ АВТОМАТИЧЕСКОГО СОЗДАНИЯ ==========

// Скрытая форма логина без возможности регистрации
function showLoginForm() {
    const container = document.getElementById('firebaseui-auth-container');
    if (!container) return;
    
    // Очищаем контейнер
    container.innerHTML = `
        <div style="text-align: left;">
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Email</label>
                <input type="email" id="loginEmail" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;" placeholder="parent@example.com">
            </div>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Пароль</label>
                <input type="password" id="loginPassword" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;" placeholder="••••••••">
            </div>
            <button id="loginButton" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;">Войти</button>
            <div id="loginError" style="margin-top: 15px; padding: 10px; background: #fee; color: #c33; border-radius: 8px; display: none;"></div>
            <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #999;">
                Только для родителей. Обратитесь к администратору для получения доступа.
            </div>
        </div>
    `;
    
    // Добавляем обработчик входа
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
            // Успешный вход — onAuthStateChanged сам переключит интерфейс
        } catch (error) {
            errorDiv.style.display = 'block';
            if (error.code === 'auth/user-not-found') {
                errorDiv.textContent = 'Пользователь не найден. Доступ только для родителей.';
            } else if (error.code === 'auth/wrong-password') {
                errorDiv.textContent = 'Неверный пароль';
            } else if (error.code === 'auth/invalid-email') {
                errorDiv.textContent = 'Неверный формат email';
            } else if (error.code === 'auth/too-many-requests') {
                errorDiv.textContent = 'Слишком много попыток. Попробуйте позже.';
            } else {
                errorDiv.textContent = 'Ошибка: ' + error.message;
            }
        }
    });
    
    // Ввод по Enter
    document.getElementById('loginPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('loginButton').click();
    });
}

// ========== ПРОВЕРКА СТАТУСА ВХОДА ==========
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Пользователь вошёл — показываем панель
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        
        // Показываем, кто вошёл
        const email = user.email;
        let parentName = 'Родитель';
        
        // Можно настроить приветствие по email
        if (email) {
            const name = email.split('@')[0];
            parentName = name.charAt(0).toUpperCase() + name.slice(1);
        }
        
        // Добавляем приветствие в шапку
        const header = document.querySelector('.header p');
        if (header) header.innerHTML = `Добро пожаловать, ${parentName}! 👋`;
        
        initApp();
    } else {
        // Пользователь не вошёл — показываем форму логина
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
        showLoginForm();
    }
});

function logout() { 
    auth.signOut(); 
    location.reload(); 
}

// ========== ОСНОВНАЯ ЛОГИКА ПРИЛОЖЕНИЯ ==========
function initApp() { 
    initMap(); 
    loadPermissions(); 
    trackLocation(); 
    monitorDeviceStatus(); 
    monitorOnlineStatus(); 
    loadHistory(1); 
}

function initMap() { 
    map = L.map('map').setView([55.751244, 37.618423], 13); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map); 
}

async function loadPermissions() { 
    try {
        const s = await db.ref('kiosk/permissions').get(); 
        const perms = s.val() || []; 
        document.querySelectorAll('#permissions input').forEach(cb => { 
            cb.checked = perms.includes(cb.value); 
        });
    } catch (error) {
        console.error('Ошибка загрузки прав:', error);
    }
}

async function savePermissions() { 
    const allowed = []; 
    document.querySelectorAll('#permissions input:checked').forEach(cb => allowed.push(cb.value)); 
    try {
        await db.ref('kiosk/permissions').set(allowed); 
        const v = (await db.ref('kiosk/version').get()).val() || 0; 
        await db.ref('kiosk/version').set(v + 1); 
        alert('✅ Права сохранены'); 
    } catch (error) {
        console.error('Ошибка сохранения прав:', error);
        alert('❌ Ошибка при сохранении прав');
    }
}

async function resetPermissions() { 
    const def = [
        "com.android.dialer",
        "com.android.gallery3d",
        "com.android.contacts",
        "com.android.camera",
        "com.android.settings",
        "com.android.chrome",
        "com.max.messenger",
        "com.android.mms"
    ]; 
    try {
        await db.ref('kiosk/permissions').set(def); 
        const v = (await db.ref('kiosk/version').get()).val() || 0; 
        await db.ref('kiosk/version').set(v + 1); 
        await loadPermissions(); 
        alert('🔄 Права сброшены к стандартным'); 
    } catch (error) {
        console.error('Ошибка сброса прав:', error);
        alert('❌ Ошибка при сбросе прав');
    }
}

function trackLocation() { 
    db.ref('kids/child_device/location').on('value', (s) => { 
        const loc = s.val(); 
        if (loc && map) { 
            if (marker) marker.setLatLng([loc.lat, loc.lng]); 
            else marker = L.marker([loc.lat, loc.lng]).addTo(map); 
            map.setView([loc.lat, loc.lng], 15); 
            document.getElementById('locationInfo').innerHTML = `📍 Широта: ${loc.lat.toFixed(6)}<br>📍 Долгота: ${loc.lng.toFixed(6)}<br>🎯 Точность: ${(loc.accuracy||50).toFixed(0)} м<br>🕐 ${new Date(loc.time).toLocaleString()}`; 
            
            // Добавляем кружок точности
            if (window.accuracyCircle) map.removeLayer(window.accuracyCircle);
            window.accuracyCircle = L.circle([loc.lat, loc.lng], {
                radius: loc.accuracy || 50,
                color: '#007bff',
                fillColor: '#007bff',
                fillOpacity: 0.1
            }).addTo(map);
        } 
    }); 
}

function monitorDeviceStatus() { 
    db.ref('.info/connected').on('value', (s) => { 
        const d = document.getElementById('deviceStatus'); 
        if (d) { 
            d.className = s.val() ? 'status status-online' : 'status status-offline'; 
            d.innerHTML = s.val() ? '✅ Устройство онлайн' : '❌ Устройство офлайн'; 
        } 
    }); 
}

function monitorOnlineStatus() { 
    db.ref('kiosk/online_status').on('value', (s) => { 
        const d = s.val(); 
        if (d) { 
            document.getElementById('statusIcon').innerHTML = d.status === 'online' ? '🟢' : '🔴'; 
            document.getElementById('statusText').innerHTML = d.status === 'online' ? 'В сети' : 'Не в сети'; 
            document.getElementById('batteryText').innerHTML = d.battery ? `🔋 Заряд: ${d.battery}%` : ''; 
        } 
    }); 
}

async function loadHistory(days) { 
    const cutoff = Date.now() - days * 86400000; 
    try {
        const snap = await db.ref('kids/child_device/activity_history/all_events')
            .orderByChild('device_time')
            .startAt(cutoff)
            .get(); 
        const events = []; 
        snap.forEach(c => events.push(c.val())); 
        events.sort((a,b) => (b.device_time||0) - (a.device_time||0)); 
        const cont = document.getElementById('historyList'); 
        if (events.length === 0) { 
            cont.innerHTML = '<div style="text-align:center; padding:40px; color:#666;">Нет событий за выбранный период</div>'; 
            return; 
        } 
        cont.innerHTML = events.map(e => `
            <div class="history-item">
                <div class="history-icon">${e.type==='app_launch'?'🚀':(e.type==='status_change'?(e.title?.includes('в сети')?'🟢':'🔴'):'📍')}</div>
                <div class="history-content">
                    <div class="history-title">${escapeHtml(e.title||'')}</div>
                    <div class="history-details">${escapeHtml(e.details||'')}</div>
                </div>
                <div class="history-time">${new Date(e.device_time).toLocaleString()}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        document.getElementById('historyList').innerHTML = '<div style="text-align:center; padding:40px; color:red;">Ошибка загрузки истории</div>';
    }
}

// Функция экранирования HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
