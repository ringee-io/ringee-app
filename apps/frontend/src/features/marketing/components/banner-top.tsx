'use client';

/**
 * Atmospheric banner band that sits above the marketing navbar.
 *
 * Procedural SVG, no raster assets: a green wash, drifting cloud banks, one lit
 * window with a single hotspot, a hazed figure and paper grain — all generated
 * by filters, so it scales to any width without pixelating. Both variants are
 * rendered and swapped with `dark:` classes (rather than reading the theme in
 * JS) so the right one paints on the server and there is no flash on hydration.
 *
 * The band doubles as the trigger for the Manual Dialer preview: no badge, no
 * label, just a hairline lift in the glow on hover. It should read as part of
 * the hero's identity until you touch it.
 */
import { useState } from 'react';

import { ManualDialerPreview } from './manual-dialer-preview';

type Stop = { offset: number; color: string; opacity: number };

type BannerPalette = {
  /** Suffix for gradient/filter ids, so both variants can share a document. */
  id: 'l' | 'd';
  base: string;
  wash: Stop[];
  cool: { color: string; opacity: number };
  glow: Stop[];
  /** Halo behind the figure. In dark it is what keeps the silhouette legible. */
  backlight: Stop[];
  clouds: { stroke: string; opacity: number };
  windowOpacity: number;
  hotspot: { fill: string; opacity: number };
  figure: { fill: string; opacity: number };
  floor: { fill: string; opacity: number; line: string; lineOpacity: number };
  grid: { stroke: string; opacity: number };
  waves: { stroke: string; opacity: number };
  grain: { opacity: number; blend: 'multiply' | 'screen' };
};

const LIGHT: BannerPalette = {
  id: 'l',
  base: '#FFFFFF',
  wash: [
    { offset: 0, color: '#2A7858', opacity: 0 },
    { offset: 0.3, color: '#2A7858', opacity: 0.1 },
    { offset: 0.62, color: '#2A7858', opacity: 0.26 },
    { offset: 0.88, color: '#2A7858', opacity: 0.34 },
    { offset: 1, color: '#2A7858', opacity: 0.06 }
  ],
  cool: { color: '#8FA8A0', opacity: 0.2 },
  glow: [
    { offset: 0, color: '#FFFFFF', opacity: 0.98 },
    { offset: 0.45, color: '#F4FBF7', opacity: 0.72 },
    { offset: 1, color: '#F4FBF7', opacity: 0 }
  ],
  backlight: [
    { offset: 0, color: '#FFFFFF', opacity: 0.55 },
    { offset: 0.55, color: '#F2F8F5', opacity: 0.28 },
    { offset: 1, color: '#F2F8F5', opacity: 0 }
  ],
  clouds: { stroke: '#2A7858', opacity: 0.2 },
  windowOpacity: 0.85,
  hotspot: { fill: '#FFFFFF', opacity: 0.95 },
  figure: { fill: '#7E9188', opacity: 0.38 },
  floor: { fill: '#FFFFFF', opacity: 0.92, line: '#2A7858', lineOpacity: 0.1 },
  grid: { stroke: '#2A7858', opacity: 0.07 },
  waves: { stroke: '#2A7858', opacity: 0.3 },
  grain: { opacity: 0.16, blend: 'multiply' }
};

const DARK: BannerPalette = {
  id: 'd',
  base: '#0A0A0A',
  wash: [
    { offset: 0, color: '#2A7858', opacity: 0 },
    { offset: 0.3, color: '#2A7858', opacity: 0.14 },
    { offset: 0.62, color: '#2A7858', opacity: 0.34 },
    { offset: 0.88, color: '#56D197', opacity: 0.2 },
    { offset: 1, color: '#56D197', opacity: 0.05 }
  ],
  cool: { color: '#3A6B58', opacity: 0.16 },
  glow: [
    { offset: 0, color: '#D8FFEB', opacity: 0.92 },
    { offset: 0.4, color: '#56D197', opacity: 0.34 },
    { offset: 1, color: '#56D197', opacity: 0 }
  ],
  backlight: [
    { offset: 0, color: '#2A7858', opacity: 0.46 },
    { offset: 0.52, color: '#2A7858', opacity: 0.22 },
    { offset: 1, color: '#2A7858', opacity: 0 }
  ],
  clouds: { stroke: '#56D197', opacity: 0.26 },
  windowOpacity: 0.7,
  hotspot: { fill: '#EAFFF4', opacity: 0.85 },
  figure: { fill: '#040605', opacity: 0.9 },
  floor: { fill: '#0A0A0A', opacity: 0.88, line: '#56D197', lineOpacity: 0.14 },
  grid: { stroke: '#FFFFFF', opacity: 0.05 },
  waves: { stroke: '#56D197', opacity: 0.34 },
  grain: { opacity: 0.11, blend: 'screen' }
};

const GRID_X = [112, 386, 631, 889, 1131, 1379, 1652, 1903];

const WAVES = [
  'M1788 230 C1838 190 1880 272 1930 232 C1974 197 2006 266 2046 234',
  'M1798 276 C1846 238 1886 318 1934 278 C1976 244 2008 310 2046 280',
  'M1812 322 C1856 288 1892 360 1936 324 C1974 293 2004 352 2040 326',
  'M1830 366 C1868 338 1900 400 1940 368 C1974 341 2000 392 2034 370'
];

/** Stacked scallops, left half. Faded out before they reach the hotspot. */
const CLOUDS: { d: string; width: number; opacity: number }[] = [
  {
    d: 'M-40 286 C-40 168.7, 136 142.3, 136 259.6 C136 112.9, 356 118.3, 356 265.0 C356 171.7, 496 171.7, 496 265.0 C496 137.0, 688 140.6, 688 268.6 C688 191.3, 804 208.7, 804 286',
    width: 1.6,
    opacity: 1
  },
  {
    d: 'M64 286 C64 198.0, 196 178.2, 196 266.2 C196 154.2, 364 158.4, 364 270.4 C364 201.1, 468 201.1, 468 270.4 C468 174.4, 612 190.0, 612 286',
    width: 1.4,
    opacity: 0.72
  },
  {
    d: 'M150 286 C150 222.0, 246 207.6, 246 271.6 C246 186.3, 374 188.7, 374 274.0 C374 220.7, 454 232.7, 454 286',
    width: 1.2,
    opacity: 0.5
  },
  {
    d: 'M390 396 C390 310.7, 518 291.5, 518 376.8 C518 264.8, 686 267.8, 686 379.8 C686 307.8, 794 307.8, 794 379.8 C794 286.5, 934 302.7, 934 396',
    width: 1.4,
    opacity: 0.82
  },
  {
    d: 'M470 396 C470 332.0, 566 317.6, 566 381.6 C566 298.9, 690 301.3, 690 384.0 C690 330.7, 770 342.7, 770 396',
    width: 1.2,
    opacity: 0.52
  }
];

const FIGURE_BODY = `M108 112
  C 78 168, 58 250, 44 330
  C 34 392, 30 442, 38 476
  L 108 486
  C 104 440, 110 372, 122 316
  L 150 300
  L 178 318
  C 190 380, 196 442, 194 486
  L 236 480
  C 240 424, 232 330, 214 246
  C 202 186, 190 138, 178 110 Z`;

function BannerArt({ p, className }: { p: BannerPalette; className: string }) {
  const stops = (list: Stop[]) =>
    list.map((s) => (
      <stop
        key={s.offset}
        offset={s.offset}
        stopColor={s.color}
        stopOpacity={s.opacity}
      />
    ));

  return (
    <svg
      aria-hidden
      viewBox='0 0 2048 620'
      // Crops the band from the top edge, the way `object-cover object-top`
      // would for an image.
      preserveAspectRatio='xMidYMin slice'
      className={`absolute inset-0 isolate h-full w-full transition-transform duration-[400ms] ease-out group-hover:scale-[1.01] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${className}`}
    >
      <defs>
        <linearGradient
          id={`wash-${p.id}`}
          x1='0.06'
          y1='0.05'
          x2='0.52'
          y2='1'
        >
          {stops(p.wash)}
        </linearGradient>

        <radialGradient id={`cool-${p.id}`} cx='0.16' cy='0.34' r='0.62'>
          <stop
            offset='0'
            stopColor={p.cool.color}
            stopOpacity={p.cool.opacity}
          />
          <stop offset='1' stopColor={p.cool.color} stopOpacity='0' />
        </radialGradient>

        <radialGradient id={`glow-${p.id}`} cx='0.5' cy='0.5' r='0.5'>
          {stops(p.glow)}
        </radialGradient>

        <radialGradient
          id={`back-${p.id}`}
          cx='1512'
          cy='404'
          r='540'
          gradientUnits='userSpaceOnUse'
        >
          {stops(p.backlight)}
        </radialGradient>

        {/* Fades the clouds out before they reach the hotspot, and softens the
            far-left edge. */}
        <linearGradient id={`cloudfade-${p.id}`} x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0' stopColor='#fff' stopOpacity='0.25' />
          <stop offset='0.1' stopColor='#fff' stopOpacity='1' />
          <stop offset='0.4' stopColor='#fff' stopOpacity='1' />
          <stop offset='0.56' stopColor='#fff' stopOpacity='0' />
        </linearGradient>

        <mask id={`cloudmask-${p.id}`}>
          <rect width='2048' height='620' fill={`url(#cloudfade-${p.id})`} />
        </mask>

        {/* Paper grain. */}
        <filter id={`grain-${p.id}`} x='0' y='0' width='100%' height='100%'>
          <feTurbulence
            type='fractalNoise'
            baseFrequency='0.85'
            numOctaves='4'
            seed='11'
            result='n'
          />
          <feColorMatrix in='n' type='saturate' values='0' />
        </filter>

        {/* Haze: noise displacement + heavy blur, so the figure's edge
            dissolves the way an overexposed scan does. */}
        <filter
          id={`haze-${p.id}`}
          x='-40%'
          y='-40%'
          width='180%'
          height='180%'
        >
          <feTurbulence
            type='fractalNoise'
            baseFrequency='0.022'
            numOctaves='3'
            seed='5'
            result='warp'
          />
          <feDisplacementMap
            in='SourceGraphic'
            in2='warp'
            scale='34'
            xChannelSelector='R'
            yChannelSelector='G'
          />
          <feGaussianBlur stdDeviation='13' />
        </filter>

        <filter
          id={`soft-${p.id}`}
          x='-60%'
          y='-60%'
          width='220%'
          height='220%'
        >
          <feGaussianBlur stdDeviation='46' />
        </filter>
      </defs>

      <rect width='2048' height='620' fill={p.base} />

      {/* Cool counter-wash, upper left. */}
      <rect width='2048' height='620' fill={`url(#cool-${p.id})`} />

      {/* The green wash, held to the same narrow value range as the
          reference's peach band. */}
      <rect width='2048' height='620' fill={`url(#wash-${p.id})`} />

      {/* Cloud banks: far layer, so the window bloom passes over them. */}
      <g mask={`url(#cloudmask-${p.id})`} opacity={p.clouds.opacity}>
        {CLOUDS.map((cloud) => (
          <path
            key={cloud.d}
            d={cloud.d}
            fill='none'
            stroke={p.clouds.stroke}
            strokeWidth={cloud.width}
            strokeLinecap='round'
            strokeLinejoin='round'
            opacity={cloud.opacity}
          />
        ))}
        <path
          d='M-40 318 C420 288, 1100 302, 2088 280'
          fill='none'
          stroke={p.clouds.stroke}
          strokeWidth='1'
          strokeLinecap='round'
          opacity='0.4'
        />
      </g>

      {/* Lit window, center right. Lifts to full on hover — the whole tell
          that the band is interactive. */}
      <g
        filter={`url(#soft-${p.id})`}
        opacity={p.windowOpacity}
        className='transition-opacity duration-[400ms] ease-out group-hover:opacity-100 motion-reduce:transition-none'
      >
        <rect
          x='878'
          y='196'
          width='470'
          height='300'
          fill={`url(#glow-${p.id})`}
        />
      </g>

      {/* Hover-only halo, widening the bloom rather than adding a new mark. */}
      <ellipse
        cx='1178'
        cy='330'
        rx='214'
        ry='156'
        fill={`url(#glow-${p.id})`}
        className='opacity-0 transition-opacity duration-[400ms] ease-out group-hover:opacity-40 motion-reduce:transition-none'
      />

      {/* The hotspot: one small hard bloom, the only bright note. */}
      <ellipse
        cx='1178'
        cy='330'
        rx='126'
        ry='96'
        fill={`url(#glow-${p.id})`}
      />
      <rect
        x='1146'
        y='306'
        width='62'
        height='46'
        rx='3'
        fill={p.hotspot.fill}
        opacity={p.hotspot.opacity}
      />

      {/* Backlight. Without it the silhouette disappears into the dark base. */}
      <rect width='2048' height='620' fill={`url(#back-${p.id})`} />

      <g filter={`url(#haze-${p.id})`}>
        <g
          transform='translate(1548 84)'
          fill={p.figure.fill}
          opacity={p.figure.opacity}
        >
          <ellipse cx='150' cy='72' rx='53' ry='49' />
          <path d='M182 50 C214 44 248 54 258 68 C246 82 212 90 184 88 Z' />
          <path d={FIGURE_BODY} />
          <path d='M40 452 C 20 462, 6 476, 4 492 L 62 496 L 66 458 Z' />
        </g>
      </g>

      {/* Floor plane: catches the figure's feet and cuts the frame. */}
      <path
        d='M0 568 L2048 524 L2048 620 L0 620 Z'
        fill={p.floor.fill}
        opacity={p.floor.opacity}
      />
      <path
        d='M0 568 L2048 524'
        stroke={p.floor.line}
        strokeWidth='1'
        opacity={p.floor.lineOpacity}
        fill='none'
      />

      <g opacity={p.grid.opacity}>
        {GRID_X.map((x) => (
          <line
            key={x}
            x1={x}
            y1='0'
            x2={x}
            y2='620'
            stroke={p.grid.stroke}
            strokeWidth='1'
          />
        ))}
      </g>

      <g opacity={p.waves.opacity}>
        {WAVES.map((d) => (
          <path
            key={d}
            d={d}
            fill='none'
            stroke={p.waves.stroke}
            strokeWidth='1.6'
            strokeLinecap='round'
          />
        ))}
      </g>

      {/* Grain over everything. */}
      <rect
        width='2048'
        height='620'
        filter={`url(#grain-${p.id})`}
        opacity={p.grain.opacity}
        style={{ mixBlendMode: p.grain.blend }}
      />
    </svg>
  );
}

export function MarketingTopBanner() {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <button
        type='button'
        onClick={() => setPreviewOpen(true)}
        aria-label='Preview Ringee Manual Dialer'
        aria-haspopup='dialog'
        // The art's own top fade is dropped — nothing sits above the band here.
        // It dissolves downward instead, so it butts against the navbar with no
        // seam and the page's dotted texture reads through the crop edge.
        style={{
          maskImage:
            'linear-gradient(to bottom, #000 0%, #000 58%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, #000 0%, #000 58%, transparent 100%)'
        }}
        className='group relative block h-[132px] w-full shrink-0 cursor-pointer overflow-hidden focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:outline-none focus-visible:ring-inset sm:h-[168px] lg:h-[212px] xl:h-[248px]'
      >
        <BannerArt p={LIGHT} className='dark:hidden' />
        <BannerArt p={DARK} className='hidden dark:block' />
      </button>

      <ManualDialerPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
