"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Captures browser audio; callers choose the output encoding for their use case. */
export function useAudioRecorder(maxSeconds: number) {
  const [state, setState] = useState<
    "idle" | "requesting" | "recording" | "denied" | "failed"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const session = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    timer: ReturnType<typeof setInterval>;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);
  const generation = useRef(0);

  const release = useCallback(() => {
    const current = session.current;
    if (!current) return;
    clearInterval(current.timer);
    clearTimeout(current.timeout);
    current.recorder.onstop = null;
    current.recorder.ondataavailable = null;
    current.recorder.onerror = null;
    if (current.recorder.state !== "inactive") current.recorder.stop();
    current.stream.getTracks().forEach((track) => track.stop());
    session.current = null;
  }, []);

  const reset = useCallback(() => {
    generation.current++;
    release();
    setState("idle");
    setSeconds(0);
    setBlob(null);
  }, [release]);

  useEffect(
    () => () => {
      generation.current++;
      release();
    },
    [release],
  );

  const stop = useCallback(() => {
    if (session.current?.recorder.state === "recording")
      session.current.recorder.stop();
  }, []);

  const start = useCallback(async () => {
    reset();
    const attempt = generation.current;
    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (attempt === generation.current) setState("denied");
      return;
    }
    // Permission can be granted after the dialog has already closed.
    if (attempt !== generation.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    try {
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const result = new Blob(chunks, { type: recorder.mimeType });
        release();
        if (attempt === generation.current) {
          setBlob(result);
          setState("idle");
        }
      };
      recorder.onerror = () => {
        release();
        if (attempt === generation.current) setState("failed");
      };
      const startedAt = performance.now();
      recorder.start();
      session.current = {
        recorder,
        stream,
        timer: setInterval(
          () =>
            setSeconds(
              Math.min(maxSeconds, (performance.now() - startedAt) / 1000),
            ),
          100,
        ),
        timeout: setTimeout(stop, maxSeconds * 1000),
      };
      setState("recording");
    } catch {
      release();
      stream.getTracks().forEach((track) => track.stop());
      if (attempt === generation.current) setState("failed");
    }
  }, [maxSeconds, release, reset, stop]);

  return { state, seconds, blob, start, stop, reset };
}
