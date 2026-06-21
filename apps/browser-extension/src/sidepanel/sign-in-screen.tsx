import { ExternalLink, RefreshCw } from "lucide-react";
import { RingeeLogo } from "./ringee-logo";

const SYNC_HOST =
  import.meta.env.VITE_CLERK_SYNC_HOST ?? "https://www.ringee.io";

/**
 * Signed-out state. The extension shares the Ringee web-app session via Clerk's
 * Sync Host — it does NOT run its own sign-in (Clerk development instances don't
 * support in-extension auth, hence the "Unable to authenticate this browser"
 * error). So we send the user to the Ringee app to sign in; once they do, the
 * session syncs back here.
 */
export function SignInScreen() {
  const openRingee = () => {
    // No `tabs` permission needed just to open a tab.
    chrome.tabs.create({ url: SYNC_HOST });
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
      <RingeeLogo className="h-9" />

      <div className="space-y-1.5">
        <h1 className="text-lg font-bold tracking-tight">
          Modern, low-cost outbound dialing
        </h1>
        <p className="text-muted-foreground mx-auto max-w-[260px] text-sm">
          Open source and pay-as-you-go from $0.020/min — no per-seat tax. Sign
          in to Ringee in your browser, then come back here.
        </p>
      </div>

      <div className="flex w-full max-w-[260px] flex-col gap-2">
        <button
          onClick={openRingee}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          Open Ringee to sign in
          <ExternalLink className="h-4 w-4" />
        </button>
        <button
          onClick={() => window.location.reload()}
          className="text-muted-foreground hover:text-foreground flex h-10 items-center justify-center gap-2 rounded-lg text-sm transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          I&apos;ve signed in — refresh
        </button>
      </div>

      <p className="text-muted-foreground/70 max-w-[240px] text-[11px]">
        Signed in at{" "}
        <span className="font-medium">{new URL(SYNC_HOST).host}</span>
      </p>
    </div>
  );
}
