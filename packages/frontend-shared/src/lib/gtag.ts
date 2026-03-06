export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

export const pageview = (url: string) => {
  // @ts-ignore
  if (!window?.gtag) return;
  // @ts-ignore
  window.gtag('config', GA_TRACKING_ID, {
    page_path: url
  });
};

const event = ({
  action,
  category,
  label,
  value
}: {
  action: string;
  category: string;
  label: string;
  value: number;
}) => {
  // @ts-ignore
  if (!window?.gtag) return;
  // @ts-ignore
  window.gtag('event', action, {
    event_category: category,
    event_label: label,
    value: value
  });
};

export const trackCallEvent = (
  callId: string,
  action: string,
  category: string,
  label: string,
  value: number
) => {
  event({ action, category, label, value });
};

export const fireNewCallEvent = (callId: string) => {
  trackCallEvent(callId, 'new_call', 'call', 'new_call', 1);
};
