import { defineConfig } from "vitest/config";

/**
 * Scoped to the pure Dialer SDK crypto/token utilities (`src/sdk`), which have
 * no NestJS or workspace-alias dependencies and so run without the full app
 * bootstrap. `APP_ENCRYPTION_SECRET` is provided so key derivation works.
 */
export default defineConfig({
  test: {
    include: ["src/sdk/**/*.test.ts"],
    env: {
      APP_ENCRYPTION_SECRET:
        process.env.APP_ENCRYPTION_SECRET ??
        "test-only-encryption-secret-do-not-use-in-prod",
    },
  },
});
