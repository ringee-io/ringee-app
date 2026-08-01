import { RingeeError } from "../errors";

/**
 * Owns the single hidden `<audio autoplay>` element that plays the far end.
 * Created during initialize, removed on destroy, never duplicated. The
 * integrator does not create it. Also carries the selected output device
 * (`setSinkId`) for browsers that support it.
 */
export class RemoteAudioManager {
  private el: HTMLAudioElement | null = null;
  private sinkId: string | null = null;
  private readonly domId: string;

  constructor(instanceId: string) {
    this.domId = `ringee-remote-audio-${instanceId}`;
  }

  /** Create + attach the element (idempotent). No-op outside the browser. */
  mount(): void {
    if (typeof document === "undefined") return;
    if (this.el) return;
    const existing = document.getElementById(
      this.domId,
    ) as HTMLAudioElement | null;
    const el = existing ?? document.createElement("audio");
    el.id = this.domId;
    el.autoplay = true;
    el.hidden = true;
    (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    if (!existing) document.body.appendChild(el);
    this.el = el;
  }

  /** Route a MediaStream (Telnyx `call.remoteStream`) to the element. */
  async attachStream(stream: MediaStream | null | undefined): Promise<void> {
    if (!this.el || !stream) return;
    if (this.el.srcObject === stream) return;
    this.el.srcObject = stream;
    try {
      await this.el.play();
    } catch {
      // Autoplay policy: the page needs a user gesture before audio can play.
      throw new RingeeError(
        "AUDIO_PLAYBACK_BLOCKED",
        "The browser blocked call audio. A user interaction is required to enable sound.",
      );
    }
  }

  /** Select the output device by id (no-op where `setSinkId` is unsupported). */
  async setOutputDevice(deviceId: string): Promise<void> {
    this.sinkId = deviceId;
    const el = this.el as
      | (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> })
      | null;
    if (el?.setSinkId) {
      await el.setSinkId(deviceId).catch(() => undefined);
    }
  }

  getOutputDeviceId(): string | null {
    return this.sinkId;
  }

  detach(): void {
    if (this.el) {
      try {
        this.el.srcObject = null;
      } catch {
        /* ignore */
      }
    }
  }

  /** Remove the element from the DOM. */
  destroy(): void {
    this.detach();
    if (this.el?.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  }
}
