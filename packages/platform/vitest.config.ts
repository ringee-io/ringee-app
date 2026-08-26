import { defineConfig } from "vitest/config";

/**
 * Runs the pure units in this package — helpers with no NestJS or
 * workspace-alias dependencies, so no app bootstrap is needed: the Dialer SDK
 * crypto/token helpers, the CRM provider mappers and phone normalization, and
 * the carrier event normalizer.
 * `APP_ENCRYPTION_SECRET` is provided so key derivation works.
 */
export default defineConfig({
  test: {
    // Any `*.test.ts` under src/. The previous per-directory allowlist meant a
    // new test file outside src/sdk or src/crm was silently never run.
    include: ["src/**/*.test.ts"],
    env: {
      APP_ENCRYPTION_SECRET:
        process.env.APP_ENCRYPTION_SECRET ??
        "test-only-encryption-secret-do-not-use-in-prod",
    },
  },
});
