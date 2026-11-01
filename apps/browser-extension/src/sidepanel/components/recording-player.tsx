import { useEffect, useState } from "react";
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

  useEffect(() => {
    let alive = true;
    let blobUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    api
      .getCallRecording(callId)
      .then((audio) => {
        if (!alive) return;
        blobUrl = URL.createObjectURL(audio);
        setSrc(blobUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [api, callId]);

  if (failed) {
    return (
      <p className="text-muted-foreground text-xs">
        Couldn&apos;t load the recording.
      </p>
    );
  }
  if (!src) return <Spinner inline />;
  return <audio controls src={src} className="w-full" />;
}
