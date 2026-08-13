import type { Transition, Variants } from 'framer-motion';

/**
 * Motion language for the Journey workspace. Deliberately small and sober: the
 * page is read, not watched. Components pair these with framer's
 * `useReducedMotion` and fall back to opacity-only.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

/** Calm spring for the sliding active indicator in the secondary nav. */
export const SPRING: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 38,
  mass: 0.9
};

/** Section swap inside the workspace. */
export const contentVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.16, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: EASE_IN } }
};
