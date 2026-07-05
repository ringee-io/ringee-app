import type {
  Appearance,
  StripePaymentElementOptions
} from '@stripe/stripe-js';

// Ringee-native theming for the custom Stripe Elements checkout. The card fields
// still live in secure Stripe iframes (PCI), but the `appearance` API repaints
// them to match the current Ringee surface (light OR dark) with the emerald/teal
// accent — so the form reads as one system with the rest of the popover, never a
// raw embed. Passing a new appearance restyles the mounted Elements in place
// (no remount), so toggling the app theme recolors the fields live.

const shared: Appearance['variables'] = {
  colorPrimary: '#0d9488',
  colorDanger: '#ef4444',
  borderRadius: '10px',
  spacingUnit: '4px',
  fontSizeBase: '15px',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
};

const dark: Appearance = {
  theme: 'night',
  labels: 'above',
  variables: {
    ...shared,
    colorPrimary: '#14b8a6',
    colorBackground: '#111114',
    colorText: '#e5e7eb',
    colorTextSecondary: '#9ca3af',
    colorTextPlaceholder: '#6b7280'
  },
  rules: {
    '.Input': {
      backgroundColor: '#17171b',
      border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: 'none',
      padding: '12px'
    },
    '.Input:focus': {
      border: '1px solid #14b8a6',
      boxShadow: '0 0 0 1px rgba(20,184,166,0.6)'
    },
    '.Input--invalid': { border: '1px solid #f87171' },
    '.Label': {
      color: '#9ca3af',
      fontWeight: '500',
      fontSize: '12px'
    },
    '.Tab, .Block': {
      backgroundColor: '#17171b',
      border: '1px solid rgba(255,255,255,0.08)'
    }
  }
};

const light: Appearance = {
  theme: 'stripe',
  labels: 'above',
  variables: {
    ...shared,
    colorBackground: '#ffffff',
    colorText: '#0a0a0b',
    colorTextSecondary: '#6b7280',
    colorTextPlaceholder: '#9ca3af'
  },
  rules: {
    '.Input': {
      backgroundColor: '#ffffff',
      border: '1px solid rgba(0,0,0,0.12)',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      padding: '12px'
    },
    '.Input:focus': {
      border: '1px solid #0d9488',
      boxShadow: '0 0 0 1px rgba(13,148,136,0.45)'
    },
    '.Input--invalid': { border: '1px solid #ef4444' },
    '.Label': {
      color: '#6b7280',
      fontWeight: '500',
      fontSize: '12px'
    },
    '.Tab, .Block': {
      backgroundColor: '#ffffff',
      border: '1px solid rgba(0,0,0,0.10)'
    }
  }
};

/** Resolve the Stripe `Appearance` for the active app theme. */
export function buildCheckoutAppearance(theme: 'light' | 'dark'): Appearance {
  return theme === 'light' ? light : dark;
}

// Minimal card-only form: the intent is created with `payment_method_types:
// ['card']`, so wallets/Link never appear. We still hard-disable wallets to keep
// the surface to just the fields required to pay.
export const paymentElementOptions: StripePaymentElementOptions = {
  layout: { type: 'tabs', defaultCollapsed: false },
  wallets: { applePay: 'never', googlePay: 'never', link: 'never' }
};
