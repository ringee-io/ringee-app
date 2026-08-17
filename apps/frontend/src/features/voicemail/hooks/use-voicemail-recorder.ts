'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeBlobToWav } from '../lib/wav';

/** Hard stop so a forgotten recording never becomes a 20-minute upload. */
const MAX_RECORDING_SECONDS = 180;

export interface RecordedVoicemail {
  /** Always a mono 8 kHz WAV — the format Telnyx can actually play back. */
  blob: Blob;
  url: string;
  durationSec: number;
  extension: 'wav';
}

type RecorderState =
  | 'idle'
  | 'recording'
  | 'encoding'
  | 'recorded'
  | 'denied'
  | 'failed';

/**
 * Records a voicemail greeting from the browser's microphone and hands back a
 * WAV.
 *
 * MediaRecorder only emits webm/opus (Chrome, Firefox) or mp4/aac (Safari),
 * and Telnyx's playback decodes neither — a drop built from one runs for the
 * file's full duration while the callee hears silence. So every recording is
 * re-encoded to 8 kHz mono PCM WAV before it leaves the browser.
 */
export function useVoicemailRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState<RecordedVoicemail | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  // `onstop` fires outside React's render cycle, so the duration is read from
  // a ref rather than the (stale) closed-over state value.
  const secondsRef = useRef(0);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Release the mic and any preview URL if the panel unmounts mid-recording.
  useEffect(() => {
    return () => {
      cleanup();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [cleanup]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setRecording(null);
    setSeconds(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState('denied');
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg'
    ].find((type) => MediaRecorder.isTypeSupported(type));

    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    );
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const type = recorder.mimeType || 'audio/webm';
      const raw = new Blob(chunksRef.current, { type });
      // Duration comes off the live counter: MediaRecorder blobs carry no
      // duration metadata until they are decoded.
      const durationSec = Math.max(1, Math.round(secondsRef.current));
      cleanup();
      setState('encoding');

      encodeBlobToWav(raw)
        .then((wav) => {
          const url = URL.createObjectURL(wav);
          objectUrlRef.current = url;
          setRecording({ blob: wav, url, durationSec, extension: 'wav' });
          setState('recorded');
        })
        .catch(() => {
          // Deliberately not falling back to the raw blob: uploading it would
          // produce a drop that plays silence, which is worse than failing.
          setState('failed');
        });
    };

    recorder.start();
    setState('recording');
    tickRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (
          next >= MAX_RECORDING_SECONDS &&
          recorderRef.current?.state === 'recording'
        ) {
          recorderRef.current.stop();
        }
        return next;
      });
    }, 1000);
  }, [cleanup]);

  const discard = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setRecording(null);
    setSeconds(0);
    setState('idle');
  }, []);

  return {
    state,
    seconds,
    recording,
    start,
    stop,
    discard,
    maxSeconds: MAX_RECORDING_SECONDS
  };
}
