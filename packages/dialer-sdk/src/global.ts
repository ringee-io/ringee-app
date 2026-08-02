import { RingeeDialer } from "./ringee-dialer";
import { RingeeError } from "./errors";
import type { RingeeDialerOptions } from "./types";

/**
 * CDN/global entry. Exposes `window.Ringee` with a headless factory.
 *
 * `mount()` / `open()` / `close()` belong to the UI builds (Floating & Bar),
 * which are a later phase; in the headless bundle they throw a clear error so
 * an integrator gets an actionable message instead of a silent no-op.
 */
function notInHeadless(method: string): never {
  throw new RingeeError(
    "UNKNOWN_ERROR",
    `Ringee.${method}() requires the Ringee Dialer UI bundle; the headless bundle only provides Ringee.create().`,
  );
}

export function create(options: RingeeDialerOptions): RingeeDialer {
  return new RingeeDialer(options);
}

export const mount = (): never => notInHeadless("mount");
export const open = (): never => notInHeadless("open");
export const close = (): never => notInHeadless("close");
export const destroy = (): never => notInHeadless("destroy");

export { RingeeDialer, RingeeError };
