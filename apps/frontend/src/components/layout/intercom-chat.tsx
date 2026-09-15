'use client';

import { useEffect } from 'react';
import Intercom, {
  boot,
  hide,
  show,
  shutdown,
  update
} from '@intercom/messenger-js-sdk';

const INTERCOM_APP_ID_PATTERN = /^[a-z0-9]+$/i;

export function getIntercomAppId(): string | undefined {
  const appId = process.env.NEXT_PUBLIC_INTERCOM_APP_ID;
  return appId && INTERCOM_APP_ID_PATTERN.test(appId) ? appId : undefined;
}

export type IntercomUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  /** Sign-up date. */
  createdAt?: Date | null;
};

/**
 * Identity the messenger was last booted with, shared across mounts so a
 * client-side navigation between layouts can tell when the person changed.
 * `undefined` means the widget has not been loaded on this page yet.
 */
let bootedUserId: string | null | undefined;

/**
 * Loads the Intercom messenger when `NEXT_PUBLIC_INTERCOM_APP_ID` is set, and
 * renders nothing otherwise. Pass `user` to identify a signed-in person; omit
 * it for anonymous visitors.
 */
export function IntercomChat({ user }: { user?: IntercomUser | null }) {
  const userId = user?.id ?? null;
  const name = user?.name ?? undefined;
  const email = user?.email ?? undefined;
  const createdAt = user?.createdAt
    ? Math.floor(user.createdAt.getTime() / 1000)
    : undefined;

  useEffect(() => {
    const appId = getIntercomAppId();
    if (!appId) return;

    const settings = {
      app_id: appId,
      hide_default_launcher: false,
      ...(userId ? { user_id: userId, name, email, created_at: createdAt } : {})
    };

    if (bootedUserId === undefined) {
      Intercom(settings);
    } else if (bootedUserId !== null && bootedUserId !== userId) {
      // Signed out or switched accounts: end the previous person's session so
      // their conversations do not carry over to whoever uses the browser next.
      shutdown();
      boot(settings);
    } else {
      // Same person, or an anonymous visitor who just signed in — Intercom
      // merges the visitor's conversation into the identified user.
      update(settings);
    }
    bootedUserId = userId;

    return () => {
      hide();
      update({ hide_default_launcher: true });
    };
  }, [userId, name, email, createdAt]);

  return null;
}

/** Opens the messenger. Returns false when Intercom is not available. */
export function openIntercomChat(): boolean {
  if (!getIntercomAppId() || bootedUserId === undefined) return false;
  show();
  return true;
}
