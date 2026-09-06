import { BadRequestException } from "@nestjs/common";

export const VOICE_CLONE_MAX_BYTES = 5 * 1024 * 1024;
export const VOICE_CLONE_MIN_SECONDS = 3;
export const VOICE_CLONE_MAX_SECONDS = 15;

/**
 * Browser uploads and recordings are decoded to mono 24 kHz PCM WAV first.
 * Verify actual sample bytes, never a client-supplied MIME type or duration.
 */
export function validateVoiceCloneSample(audio: Buffer): number {
  if (
    audio.length < 44 ||
    audio.length > VOICE_CLONE_MAX_BYTES ||
    audio.toString("ascii", 0, 4) !== "RIFF" ||
    audio.readUInt32LE(4) !== audio.length - 8 ||
    audio.toString("ascii", 8, 16) !== "WAVEfmt " ||
    audio.readUInt32LE(16) !== 16 ||
    audio.readUInt16LE(20) !== 1 ||
    audio.readUInt16LE(22) !== 1 ||
    audio.readUInt32LE(24) !== 24000 ||
    audio.readUInt32LE(28) !== 48000 ||
    audio.readUInt16LE(32) !== 2 ||
    audio.readUInt16LE(34) !== 16 ||
    audio.toString("ascii", 36, 40) !== "data" ||
    audio.readUInt32LE(40) !== audio.length - 44 ||
    (audio.length - 44) % 2 !== 0
  ) {
    throw new BadRequestException(
      "Upload a valid mono 24 kHz PCM WAV reference sample.",
    );
  }
  const duration = (audio.length - 44) / 48000;
  if (
    duration < VOICE_CLONE_MIN_SECONDS ||
    duration > VOICE_CLONE_MAX_SECONDS
  ) {
    throw new BadRequestException(
      "Reference audio must be between 3 and 15 seconds.",
    );
  }
  return duration;
}

/** Ultra accepts up to ten seconds, while Ringee accepts 3–15 second inputs. */
export function limitVoiceCloneSample(
  audio: Buffer,
  maxSeconds: number,
): Buffer {
  validateVoiceCloneSample(audio);
  const result = Buffer.from(audio.subarray(0, 44 + maxSeconds * 48000));
  result.writeUInt32LE(result.length - 8, 4);
  result.writeUInt32LE(result.length - 44, 40);
  return result;
}
