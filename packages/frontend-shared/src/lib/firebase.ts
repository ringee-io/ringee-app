import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ''
};

let messagingInstance: any = null;

export function getClientMessaging() {
  if (typeof window === 'undefined') return null;
  if (!messagingInstance) {
    const app = initializeApp(firebaseConfig);
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

export async function requestPermissionAndToken() {
  if (typeof window === 'undefined') return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return '';

    const registration = await navigator.serviceWorker.ready;
    const messaging = getClientMessaging();

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '',
      serviceWorkerRegistration: registration
    });

    return token;
  } catch (err) {
    console.error('⚠️ Error FCM:', err);
    return '';
  }
}

export function listenForegroundMessages(callback: (data: any) => void) {
  const messaging = getClientMessaging();
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    callback(payload);
  });
}
