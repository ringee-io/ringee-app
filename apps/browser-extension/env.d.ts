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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
