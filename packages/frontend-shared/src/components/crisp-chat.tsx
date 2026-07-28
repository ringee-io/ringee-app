"use client";

import { useEffect } from "react";

const CRISP_SCRIPT_ID = "crisp-chat-script";
const CRISP_WEBSITE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidCrispWebsiteId(
  websiteId: string | undefined,
): websiteId is string {
  return !!websiteId && CRISP_WEBSITE_ID_PATTERN.test(websiteId);
}

type CrispCommand =
  | ["do", action: string]
  | ["set", property: string, value: unknown[]];

declare global {
  interface Window {
    $crisp: CrispCommand[];
    CRISP_WEBSITE_ID: string;
  }
}

export const CrispChat = () => {
  useEffect(() => {
    const websiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
    if (!isValidCrispWebsiteId(websiteId)) return;

    window.$crisp = window.$crisp || [];
    window.CRISP_WEBSITE_ID = websiteId;
    window.$crisp.push(["do", "chat:show"]);

    if (!document.getElementById(CRISP_SCRIPT_ID)) {
      const d = document;
      const s = d.createElement("script");

      s.id = CRISP_SCRIPT_ID;
      s.src = "https://client.crisp.chat/l.js";
      s.async = true;
      d.head.appendChild(s);
    }

    return () => {
      window.$crisp.push(["do", "chat:hide"]);
    };
  }, []);

  return null;
};
