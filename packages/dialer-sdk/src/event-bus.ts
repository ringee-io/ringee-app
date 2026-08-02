import type {
  RingeeEventName,
  RingeeEventHandler,
  RingeeEventPayloads,
} from "./types";

/**
 * Tiny typed event emitter. `on()` returns an unsubscribe function. Handler
 * errors are isolated so one bad listener can't break emission for the rest.
 */
export class EventBus {
  private readonly handlers = new Map<
    RingeeEventName,
    Set<(payload: unknown) => void>
  >();

  on<TEvent extends RingeeEventName>(
    event: TEvent,
    handler: RingeeEventHandler<TEvent>,
  ): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const fn = handler as (payload: unknown) => void;
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }

  emit<TEvent extends RingeeEventName>(
    event: TEvent,
    payload: RingeeEventPayloads[TEvent],
  ): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Copy so a handler that unsubscribes during emit doesn't skip siblings.
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        // Never let a listener throw into the SDK.
        console.error(`[ringee] event handler for "${event}" threw`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
