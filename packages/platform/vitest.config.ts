import { defineConfig } from "vitest/config";

/**
 * Scoped to pure utilities that have no NestJS or workspace-alias dependencies
 * and so run without the full app bootstrap: the Dialer SDK crypto/token
 * helpers (`src/sdk`) and the CRM provider mappers (`src/crm`).
 * `APP_ENCRYPTION_SECRET` is provided so key derivation works.
 */
export default defineConfig({
  test: {
    include: ["src/sdk/**/*.test.ts", "src/crm/**/*.test.ts"],
    env: {
      APP_ENCRYPTION_SECRET:
        process.env.APP_ENCRYPTION_SECRET ??
        "test-only-encryption-secret-do-not-use-in-prod",
    },
  },
});
