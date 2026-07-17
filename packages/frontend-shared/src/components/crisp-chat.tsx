'use client';

import { useEffect } from 'react';

const CRISP_SCRIPT_ID = 'crisp-chat-script';

declare global {
  interface Window {
    $crisp: any[];
    CRISP_WEBSITE_ID: string;
  }
}

export const CrispChat = () => {
  useEffect(() => {
    const websiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
    if (!websiteId) return;

    window.$crisp = window.$crisp || [];
    window.CRISP_WEBSITE_ID = websiteId;
    window.$crisp.push(['do', 'chat:show']);

    if (!document.getElementById(CRISP_SCRIPT_ID)) {
      const d = document;
      const s = d.createElement('script');

      s.id = CRISP_SCRIPT_ID;
      s.src = 'https://client.crisp.chat/l.js';
      s.async = true;
      d.head.appendChild(s);
    }

    return () => {
      window.$crisp.push(['do', 'chat:hide']);
    };
  }, []);

  return null;
};
