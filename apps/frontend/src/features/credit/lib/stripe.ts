import { loadStripe, type Stripe } from '@stripe/stripe-js';

// Single, lazily-created Stripe.js instance shared across the app. `loadStripe`
// injects a script tag, so it must run exactly once — re-creating it per render
// would reload Stripe.js and reset the embedded checkout.
let stripePromise: Promise<Stripe | null> | null = null;

export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = STRIPE_PUBLISHABLE_KEY
      ? loadStripe(STRIPE_PUBLISHABLE_KEY)
      : Promise.resolve(null);
  }
  return stripePromise;
}
