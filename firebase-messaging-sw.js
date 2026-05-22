importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAStWFyRYy4RVSEfQ5obMJwPCOslAaBCGU",
    authDomain: "parentalcontrol-c7f7a.firebaseapp.com",
    databaseURL: "https://parentalcontrol-c7f7a-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "parentalcontrol-c7f7a",
    storageBucket: "parentalcontrol-c7f7a.firebasestorage.app",
    messagingSenderId: "773827816415",
    appId: "1:773827816415:web:9b4a2c9ed3e297706a326a",
    measurementId: "G-1Q58H5V8YT"
});

const messaging = firebase.messaging();

// Обработка фоновых уведомлений
messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification?.title || 'Родительский контроль';
    const notificationOptions = {
        body: payload.notification?.body || 'Новое событие',
        icon: '/icon-192.png',
        badge: '/icon-192.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Обработка push-событий (критически важно!)
self.addEventListener('push', function(event) {
    console.log('Push event received:', event);
    // Firebase обработает самостоятельно, но обработчик нужен для регистрации
});
