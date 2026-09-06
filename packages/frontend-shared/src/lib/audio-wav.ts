/**
 * Browser uploads and MediaRecorder output are decoded and re-encoded to mono
 * 16-bit PCM WAV. Voicemail defaults to telephony's 8 kHz; voice cloning requests
 * 24 kHz and bounds the decoded duration before allocating the output buffer.
 */

/** Telephony is narrowband; anything higher is discarded by the carrier. */
const TARGET_SAMPLE_RATE = 8000;

/**
 * Decodes browser-supported audio and re-encodes it to the requested sample rate.
 */
export async function encodeBlobToWav(
  blob: Blob,
  options: {
    sampleRate?: number;
    minSeconds?: number;
    maxSeconds?: number;
  } = {},
): Promise<Blob> {
  const sampleRate = options.sampleRate ?? TARGET_SAMPLE_RATE;
  const arrayBuffer = await blob.arrayBuffer();

  // A plain AudioContext decodes at the device's rate (usually 44.1/48 kHz);
  // an OfflineAudioContext resamples to the rate we ask for as it renders.
  const AudioCtx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;

  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    void decodeCtx.close();
  }

  if (
    decoded.duration < (options.minSeconds ?? 0) ||
    decoded.duration > (options.maxSeconds ?? Infinity)
  ) {
    throw new RangeError("Audio duration is outside the accepted range");
  }
  const frameCount = Math.ceil(decoded.duration * sampleRate);
  const offline = new OfflineAudioContext(1, frameCount, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);

  const rendered = await offline.startRendering();
  return encodePcmToWav(rendered.getChannelData(0), sampleRate);
}

/** Wraps float PCM samples in a 16-bit mono WAV container. */
function encodePcmToWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling so inter-sample peaks cannot wrap around to the
    // opposite polarity and click.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
