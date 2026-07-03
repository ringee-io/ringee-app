import type { Transition, Variants } from 'framer-motion';

/**
 * Shared motion language for Ringee Infra.
 *
 * Every animated surface in the module imports from here so the whole console
 * moves with one voice: sober, quick, premium — never flashy. Durations are in
 * seconds (framer-motion) and easings are cubic-bezier control points.
 *
 * Reduced motion: components should call framer-motion's `useReducedMotion` and
 * fall back to opacity-only (drop the transforms). These variants stay small on
 * purpose so that fallback reads well.
 */

/** easeOutQuint — the signature "settle" curve for entrances. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** A slightly softer ease-out for surfaces that slide in. */
export const EASE_SOFT = [0.22, 1, 0.36, 1] as const;
/** Fast ease-in for exits. */
export const EASE_IN = [0.4, 0, 1, 1] as const;

export const DURATION = {
  /** Micro-interactions: hover, tiny state flips. */
  micro: 0.14,
  /** Surface entrances: inspector, modal, empty states. */
  enter: 0.22,
  /** Exits — always quicker than entrances. */
  exit: 0.15,
  /** Larger reveals: module load, workspace crossfade. */
  surface: 0.26,
  /** Tab / step content swaps inside a surface. */
  content: 0.16
} as const;

/** A calm spring for panels and layout indicators. */
export const SPRING: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 38,
  mass: 0.9
};

// ── Inspector — floating control surface ────────────────────────────────────
export const panelVariants: Variants = {
  hidden: { opacity: 0, x: 16, scale: 0.985 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: DURATION.enter, ease: EASE_SOFT }
  },
  exit: {
    opacity: 0,
    x: 12,
    scale: 0.99,
    transition: { duration: DURATION.exit, ease: EASE_IN }
  }
};

// ── Tab / step content swap ─────────────────────────────────────────────────
export const contentVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.content, ease: EASE_OUT }
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: DURATION.exit * 0.8, ease: EASE_IN }
  }
};

// ── Floating menus (context menus) ──────────────────────────────────────────
export const menuVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: DURATION.micro, ease: EASE_OUT }
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -2,
    transition: { duration: 0.1, ease: EASE_IN }
  }
};

// ── Empty state / spotlight / hint ──────────────────────────────────────────
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION.surface, ease: EASE_OUT }
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: { duration: DURATION.exit, ease: EASE_IN }
  }
};

// ── Staggered lists (discovery cards, node reveal) ──────────────────────────
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03, delayChildren: 0.04 }
  }
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.enter, ease: EASE_OUT }
  }
};

// ── Module / canvas load + workspace crossfade ──────────────────────────────
export const canvasFade: Variants = {
  hidden: { opacity: 0, scale: 0.99 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION.surface, ease: EASE_OUT }
  }
};
