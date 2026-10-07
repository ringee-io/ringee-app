import type { CSSProperties } from 'react';

import { Container } from './primitives';
import { RINGEE_LOGO_GLYPHS, RINGEE_LOGO_VIEW_BOX } from './ringee-logo';
import styles from './footer-wordmark.module.css';

/** The share of the logo's height above the footer; the rest sinks behind it. */
const SHOWN = 0.75;

/**
 * The giant Ringee logo that closes every marketing page: as wide as the page,
 * in an emerald gradient, cut off by the footer's top edge so it seems to rise
 * out of it. Decoration only; the motion is in `footer-wordmark.module.css`.
 */
export function FooterWordmark() {
  const { width, height } = RINGEE_LOGO_VIEW_BOX;
  const shown = Math.round(height * SHOWN);

  return (
    <div aria-hidden className={styles.horizon}>
      <Container className='max-w-7xl px-4 sm:px-6'>
        <div
          className={styles.window}
          style={{ aspectRatio: `${width} / ${shown}` }}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className={styles.logo}
            focusable='false'
          >
            <defs>
              {/* In user space, so every glyph shares one gradient that ends
                  at the footer's edge. */}
              <linearGradient
                id='footer-wordmark-fill'
                gradientUnits='userSpaceOnUse'
                x1='0'
                y1='0'
                x2='0'
                y2={shown}
              >
                <stop offset='0' className={styles.stopTop} />
                <stop offset='0.55' className={styles.stopMid} />
                <stop offset='1' className={styles.stopBottom} />
              </linearGradient>
            </defs>
            {RINGEE_LOGO_GLYPHS.map((d, index) => (
              <path
                key={index}
                d={d}
                fill='url(#footer-wordmark-fill)'
                fillRule='evenodd'
                className={styles.glyph}
                style={{ '--i': index } as CSSProperties}
              />
            ))}
          </svg>
        </div>
      </Container>
    </div>
  );
}
