importScripts(
  'https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js'
);

// Dynamically read Firebase config from URL parameters
const urlParams = new URLSearchParams(location.search);
firebase.initializeApp({
  apiKey: urlParams.get('apiKey') || '',
  authDomain: urlParams.get('authDomain') || '',
  projectId: urlParams.get('projectId') || '',
  storageBucket: urlParams.get('storageBucket') || '',
  messagingSenderId: urlParams.get('messagingSenderId') || '',
  appId: urlParams.get('appId') || ''
});

const messaging = firebase.messaging();

/** 📨 Mostrar notificación cuando llega en background */
messaging.onBackgroundMessage((payload) => {
  console.log('📦 Background message received:', payload);

  const data = payload.data || {};
  const title = data.title || '📞 Incoming Call';
  const body = data.body || 'Someone is calling you...';

  const notificationOptions = {
    body,
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    vibrate: [200, 100, 200, 100, 200, 100, 400],
    requireInteraction: true,
    tag: 'ringee-incoming-call',
    renotify: true,
    sound: '/sounds/inbound-call.mp3',
    data,
    actions: [
      { action: 'accept_call', title: '📞 Accept' }
      // { action: 'reject_call', title: '❌ Decline' }
    ]
  };

  self.registration.showNotification(title, notificationOptions);
});

/** 🖱️ Cuando el usuario hace clic en la notificación */
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Notification click:', event.action, event.notification.data);
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || `/dashboard/call?from=${data.from || ''}`;

  if (event.action === 'reject_call') {
    console.log('❌ Reject call clicked');
    // fetch("/api/calls/reject", { method: "POST", body: JSON.stringify(data) });
    return;
  }

  // 🟢 🔔 2️⃣ Abrir/enfocar la app con la URL de destino
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
