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
  A: [697, 1633],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  B: [770, 1633],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  C: [852, 1633],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
  D: [941, 1633],
};

export const DTMF_KEY_ROWS = [
  ["1", "2", "3", "A"],
  ["4", "5", "6", "B"],
  ["7", "8", "9", "C"],
  ["*", "0", "#", "D"],
] as const;
export const DTMF_KEYS = DTMF_KEY_ROWS.flat();

export const DTMF_LETTER_ROWS = [
  ["A", "B", "C", "D", "E", "F"],
  ["G", "H", "I", "J", "K", "L"],
  ["M", "N", "O", "P", "Q", "R"],
  ["S", "T", "U", "V", "W", "X"],
  ["Y", "Z"],
] as const;

const T9_LETTER_GROUPS = [
  ["ABC", "2"],
  ["DEF", "3"],
  ["GHI", "4"],
  ["JKL", "5"],
  ["MNO", "6"],
  ["PQRS", "7"],
  ["TUV", "8"],
  ["WXYZ", "9"],
] as const;

/**
 * Phone networks cannot transmit arbitrary text through DTMF. Convert a letter
 * to the digit printed beneath it on a standard telephone keypad instead.
 */
export function letterToDtmfDigit(letter: string): string | null {
  const normalized = letter.trim().toUpperCase();
  if (normalized.length !== 1) return null;
  const group = T9_LETTER_GROUPS.find(([letters]) =>
    letters.includes(normalized),
  );
  return group?.[1] ?? null;
}

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
