importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

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
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification?.title || payload.data?.title || 'Родительский контроль';
    const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || 'Новое событие',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: payload.data?.url || '/' }
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/';
    event.waitUntil(clients.openWindow(urlToOpen));
});
