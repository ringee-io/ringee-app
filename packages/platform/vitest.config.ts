import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Runs the units in this package that need no app bootstrap: the Dialer SDK
 * crypto/token helpers, the CRM provider mappers and phone normalization, the
 * carrier event normalizer, and the provider services that can be driven with
 * a stubbed client.
 * `APP_ENCRYPTION_SECRET` is provided so key derivation works.
 */
export default defineConfig({
  resolve: {
    alias: {
      /**
       * `@ringee/configuration` declares no `main`/`exports`, so vite cannot
       * find an entry for it and any module that reads configuration fails to
       * collect. Resolving it to its source makes it reachable without
       * building a sibling package first.
       *
       * Resolving it is not the same as loading it: the module validates the
       * whole app environment on import and calls `process.exit(1)` when a
       * variable is missing, so a test that pulls one in still has to stub it
       * (see `telnyx.service.test.ts`).
       */
      "@ringee/configuration": fileURLToPath(
        new URL("../configuration/src/index.ts", import.meta.url),
      ),
    },
  },
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
