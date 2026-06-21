import { createRoot } from "react-dom/client";
import { ClerkProvider, SignedIn, SignedOut } from "@clerk/chrome-extension";
import { CallExperience } from "./call-experience";
import { SignInScreen } from "./sign-in-screen";
import "./theme.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const SYNC_HOST =
  import.meta.env.VITE_CLERK_SYNC_HOST ?? "https://www.ringee.io";

// Follow the OS light/dark preference so the panel matches the Ringee app's
// theme (the shared tokens + logo swap on the `.dark` class).
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = (dark: boolean) =>
  document.documentElement.classList.toggle("dark", dark);
applyTheme(darkQuery.matches);
darkQuery.addEventListener("change", (e) => applyTheme(e.matches));

createRoot(document.getElementById("root")!).render(
  <ClerkProvider
    publishableKey={PUBLISHABLE_KEY}
    syncHost={SYNC_HOST}
    afterSignOutUrl="/"
  >
    {/* Signed in → the shared call experience. */}
    <SignedIn>
      <CallExperience />
    </SignedIn>
    {/* Signed out → send the user to the Ringee web app to sign in; the session
        then syncs back via Sync Host (required for Clerk dev instances). */}
    <SignedOut>
      <SignInScreen />
    </SignedOut>
  </ClerkProvider>,
);
