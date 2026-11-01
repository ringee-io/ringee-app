import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import type { RingeeApi } from "../../lib/ringee-api";
import { Spinner } from "./ui";

/**
 * Plays a call's recording. The stored file is encrypted (REC-001): its URL in
 * an <audio> element plays nothing, so the audio comes decrypted from the API
 * and is handed to the player as a Blob URL.
 */
export function RecordingPlayer({
  api,
  callId,
}: {
  api: RingeeApi;
  callId: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // "Try again" bumps it to load the recording once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Leaving the screen stops the download instead of finishing it unseen.
    const request = new AbortController();
    let blobUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    api
      .getCallRecording(callId, request.signal)
      .then((audio) => {
        if (request.signal.aborted) return;
        blobUrl = URL.createObjectURL(audio);
        setSrc(blobUrl);
      })
      .catch(() => {
        if (!request.signal.aborted) setFailed(true);
      });
    return () => {
      request.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [api, callId, attempt]);

  if (failed) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Couldn&apos;t load the recording.
        </p>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="hover:bg-accent flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }
  if (!src) return <Spinner inline />;
  return <audio controls src={src} className="w-full" />;
}
