'use client';

import { useEffect, useState } from 'react';
import {
  requestPermissionAndToken,
  listenForegroundMessages
} from '../lib/firebase';

export function useFCM() {
  const [token, setToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function setup() {
      try {
        if ('serviceWorker' in navigator) {
          const swUrl = new URL('/firebase-messaging-sw.js', window.location.href);
          swUrl.searchParams.append('apiKey', process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '');
          swUrl.searchParams.append('authDomain', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '');
          swUrl.searchParams.append('projectId', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '');
          swUrl.searchParams.append('storageBucket', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '');
          swUrl.searchParams.append('messagingSenderId', process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '');
          swUrl.searchParams.append('appId', process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '');

          await navigator.serviceWorker.register(swUrl.href);
        }

        const token = await requestPermissionAndToken();
        if (token) setToken(token);

        listenForegroundMessages((payload) => setNotification(payload));
      } catch (err: any) {
        console.error('❌ FCM setup error:', err);
        setError(err.message);
      }
    }

    setup();
  }, []);

  // 🔊 Listener desde SW (mensaje PLAY_RING_SOUND)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'PLAY_RING_SOUND') {
        const audio = new Audio('/sounds/inbound-call.mp3');
        audio.loop = true;
        audio.play().catch(() => console.warn('🔇 Autoplay bloqueado'));
      }
    });
  }, []);

  return { token, notification, error };
}
