import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Subject, Observable, filter, map } from "rxjs";

export interface SSEEvent {
  channel: string;
  event: string;
  data: any;
}

export interface SSEMessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

/**
 * In-process event bridge for SSE.
 * The dialer orchestration emits events here, and SSE endpoints subscribe per-session.
 * Using in-process Subject instead of Redis pub/sub for MVP simplicity
 * (both dialer and SSE live in the same backend process).
 */
@Injectable()
export class SSEBridgeService implements OnModuleDestroy {
  private readonly subject = new Subject<SSEEvent>();

  onModuleDestroy() {
    this.subject.complete();
  }

  /**
   * Emit an event to a specific channel (e.g. "agent:<sessionId>").
   */
  emit(channel: string, event: string, data: any): void {
    this.subject.next({ channel, event, data });
  }

  /**
   * Subscribe to events on a specific channel.
   * Returns an Observable compatible with NestJS @Sse().
   */
  subscribe(channel: string): Observable<SSEMessageEvent> {
    return this.subject.asObservable().pipe(
      filter((e) => e.channel === channel),
      map(
        (e) =>
          ({
            data: JSON.stringify({ ...e.data, _event: e.event }),
            type: e.event,
          }) as SSEMessageEvent
      )
    );
  }
}
