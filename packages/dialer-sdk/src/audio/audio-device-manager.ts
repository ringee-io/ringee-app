import { RingeeError } from "../errors";
import type { AudioDevice } from "../types";

/**
 * Enumerates and selects microphone (input) and speaker (output) devices.
 * Raw `MediaDevices`/permission errors never surface — they are mapped to
 * typed {@link RingeeError}s.
 */
export class AudioDeviceManager {
  private inputDeviceId: string | null = null;

  private get mediaDevices(): MediaDevices | null {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.enumerateDevices === "function"
      ) {
        return navigator.mediaDevices;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  async getInputDevices(): Promise<AudioDevice[]> {
    return this.list("audioinput", "input");
  }

  async getOutputDevices(): Promise<AudioDevice[]> {
    return this.list("audiooutput", "output");
  }

  private async list(
    kind: MediaDeviceKind,
    publicKind: "input" | "output",
  ): Promise<AudioDevice[]> {
    const md = this.mediaDevices;
    if (!md) return [];
    let devices: MediaDeviceInfo[];
    try {
      devices = await md.enumerateDevices();
    } catch {
      throw new RingeeError("NO_AUDIO_DEVICE", "Could not read audio devices.");
    }
    return devices
      .filter((d) => d.kind === kind)
      .map((d, i) => ({
        id: d.deviceId,
        label:
          d.label ||
          `${publicKind === "input" ? "Microphone" : "Speaker"} ${i + 1}`,
        kind: publicKind,
      }));
  }

  setInputDevice(deviceId: string): void {
    this.inputDeviceId = deviceId;
  }

  getInputDeviceId(): string | null {
    return this.inputDeviceId;
  }

  /**
   * Ensure microphone permission before a call. Maps a denied prompt / missing
   * device to a typed error. Returns immediately when `getUserMedia` is absent.
   */
  async ensureMicrophone(): Promise<void> {
    const md = this.mediaDevices;
    if (!md || typeof md.getUserMedia !== "function") return;
    try {
      const constraints: MediaStreamConstraints = {
        audio: this.inputDeviceId
          ? { deviceId: { exact: this.inputDeviceId } }
          : true,
      };
      const stream = await md.getUserMedia(constraints);
      // We only needed the permission; stop the probe tracks immediately.
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new RingeeError(
          "MICROPHONE_DENIED",
          "Microphone access was denied.",
        );
      }
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        throw new RingeeError("NO_AUDIO_DEVICE", "No microphone was found.");
      }
      throw new RingeeError(
        "NO_AUDIO_DEVICE",
        "The microphone is unavailable.",
      );
    }
  }
}
