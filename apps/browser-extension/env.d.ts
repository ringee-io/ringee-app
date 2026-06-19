/// <reference types="vite/client" />
/// <reference types="chrome" />

interface ImportMetaEnv {
  /** Clerk publishable key (same instance as the web app). */
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  /** Clerk syncHost — the web app origin the extension shares a session with. */
  readonly VITE_CLERK_SYNC_HOST?: string;
  /** Ringee backend API base, e.g. https://api.ringee.io/api */
  readonly VITE_RINGEE_API_URL?: string;
  /** Default region (ISO 3166-1 alpha-2) for numbers without a country code. */
  readonly VITE_DEFAULT_REGION?: string;

  /**
   * Optional static Telnyx WebRTC SIP login — the web-app pattern
   * (NEXT_PUBLIC_TELNYX_LOGIN). When set together with VITE_TELNYX_PASSWORD the
   * extension dials with these shared credentials instead of the backend-minted
   * ephemeral ones. Useful for local dev / a shared trial line.
   */
  readonly VITE_TELNYX_LOGIN?: string;
  /** Static Telnyx WebRTC SIP password (pairs with VITE_TELNYX_LOGIN). */
  readonly VITE_TELNYX_PASSWORD?: string;
  /**
   * Optional public caller ID (E.164) to dial from — mirrors the web app's
   * NEXT_PUBLIC_RINGEE_PUBLIC_CALLER_ID. When set it overrides the
   * backend-resolved caller ID.
   */
  readonly VITE_RINGEE_PUBLIC_CALLER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
