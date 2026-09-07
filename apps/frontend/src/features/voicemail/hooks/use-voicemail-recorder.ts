'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder } from '@ringee/frontend-shared/hooks/use-audio-recorder';
import { encodeBlobToWav } from '../lib/wav';

const MAX_RECORDING_SECONDS = 180;

export interface RecordedVoicemail {
  /** Always a mono 8 kHz WAV — the format Telnyx can actually play back. */
  blob: Blob;
  url: string;
  durationSec: number;
  extension: 'wav';
}

/** Uses the shared microphone lifecycle, retaining voicemail's 8 kHz encoding. */
export function useVoicemailRecorder() {
  const recorder = useAudioRecorder(MAX_RECORDING_SECONDS);
  const resetRecorder = recorder.reset;
  const [encoding, setEncoding] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState<RecordedVoicemail | null>(null);
  const seconds = useRef(0);
  seconds.current = recorder.seconds;

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setRecording(null);
    setFailed(false);
    if (!recorder.blob) {
      setEncoding(false);
      return;
    }
    setEncoding(true);
    const durationSec = Math.max(1, Math.round(seconds.current));
    void encodeBlobToWav(recorder.blob)
      .then((wav) => {
        if (cancelled) return;
        url = URL.createObjectURL(wav);
        setRecording({ blob: wav, url, durationSec, extension: 'wav' });
        setEncoding(false);
      })
      .catch(() => {
        if (!cancelled) {
          setEncoding(false);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [recorder.blob]);

  const discard = useCallback(() => {
    resetRecorder();
    setRecording(null);
    setFailed(false);
  }, [resetRecorder]);

  const state = encoding
    ? 'encoding'
    : failed
      ? 'failed'
      : recording
        ? 'recorded'
        : recorder.state === 'requesting'
          ? 'idle'
          : recorder.state;

  return {
    state,
    seconds: Math.floor(recorder.seconds),
    recording,
    start: recorder.start,
    stop: recorder.stop,
    discard,
    maxSeconds: MAX_RECORDING_SECONDS
  };
}
