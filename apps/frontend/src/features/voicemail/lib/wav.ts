/**
 * Telnyx's `playback_start` decodes only MP3 and WAV. MediaRecorder gives us
 * webm/opus (Chrome, Firefox) or mp4/aac (Safari) — none of which the provider
 * can play, and a drop built from one runs for the file's duration while the
 * callee hears silence.
 *
 * So the recording is decoded in the browser and re-encoded as the format
 * telephony actually uses: 8 kHz mono 16-bit PCM. No transcoding service, no
 * ffmpeg dependency, and the result is small (~960 KB per minute).
 */

/** Telephony is narrowband; anything higher is discarded by the carrier. */
const TARGET_SAMPLE_RATE = 8000;

/**
 * Decodes any browser-recorded audio blob and re-encodes it as a mono 8 kHz
 * WAV that Telnyx can play back.
 */
export async function encodeBlobToWav(blob: Blob): Promise<Blob> {
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

  const frameCount = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);

  const rendered = await offline.startRendering();
  return encodePcmToWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
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

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling so inter-sample peaks cannot wrap around to the
    // opposite polarity and click.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
