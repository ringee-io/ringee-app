/**
 * Local DTMF tone playback for keypad feedback. This is purely the audible
 * "beep" the user hears when pressing a key — the actual DTMF signaling is sent
 * over the call via `sendDtmf`. Shared so the keypad sounds the same in the web
 * app and the extension side panel.
 */
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

export const DTMF_KEYS = Object.keys(DTMF_FREQUENCIES);

export function isDtmfDigit(digit: string): boolean {
  return digit in DTMF_FREQUENCIES;
}

/** Play the dual-tone for a single key. No-op outside a browser/AudioContext. */
export function playDtmfTone(digit: string, durationMs = 180): void {
  const freqs = DTMF_FREQUENCIES[digit];
  if (!freqs) return;
  const AudioCtx =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const [f1, f2] = freqs;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();
  osc1.frequency.value = f1;
  osc2.frequency.value = f2;
  gain.gain.value = 0.12;
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);
  osc1.start();
  osc2.start();
  setTimeout(() => {
    osc1.stop();
    osc2.stop();
    void ctx.close();
  }, durationMs);
}
