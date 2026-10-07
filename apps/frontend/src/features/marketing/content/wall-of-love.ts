/**
 * The wall of love: what real people said about Ringee, where they said it.
 * `/wall-of-love` shows every entry in the order below; the home page shows
 * the `featured` ones (or, while none is, the first few).
 *
 * Every entry is a quote. Copy it word for word, typos included, and never
 * write, tidy up or merge one: the same honesty rule as the page copy around
 * it. A public post or review is shown as it is and linked with `url`, which
 * makes the whole card open it. A private chat or email needs its author's
 * OK first.
 *
 * Mark `incentivized` on anything its author was rewarded for, such as the
 * credits of the `customer-review` offer for a Trustpilot review, or that
 * someone close to the team wrote: the card then says so, as the FTC requires
 * of an endorsement with a material connection.
 *
 * Files go in `public/wall-of-love/`: a square profile photo (160 px is
 * plenty), a screenshot, an image or a video. Name each file once and never
 * replace it in place: `next.config.ts` caches images as immutable for a year,
 * so a changed file needs a new name. Crop or blur phone numbers and other
 * people's names out of a screenshot before it goes in. Images and videos need
 * their size in pixels: `sips -g pixelWidth -g pixelHeight <file>` prints it.
 *
 * Adding one, by network:
 *
 *   LinkedIn post   { source: 'linkedin', url, text, media?, reactions?, comments?, reposts? }
 *   LinkedIn comment the same, with kind: 'comment'
 *   WhatsApp        { source: 'whatsapp', messages?, media? } — the chat typed
 *                   out as bubbles, a screenshot (`media` image), or both
 *   X post          { source: 'x', handle, url, text, media? }
 *   Trustpilot      { source: 'trustpilot', url, rating, title, text, country? }
 *   Email           { source: 'email', text, subject?, time?, screenshot? } — the
 *                   body typed out, greeting included; the screenshot proves it
 *   Video           { source: 'video', video, quote?, url? }
 */

/** A file in `public/`, written from the site root: `/wall-of-love/ana.jpg`. */
type PublicPath = `/${string}`;

export type WallImage = {
  src: PublicPath;
  width: number;
  height: number;
  /** What the image shows, for people who cannot see it. */
  alt: string;
};

export type WallVideo = {
  /** An MP4 (H.264 + AAC), the one format every browser plays. */
  src: PublicPath;
  /** The still shown until someone presses play. */
  poster: PublicPath;
  width: number;
  height: number;
  /** What the video shows: the player's accessible name. */
  label: string;
};

export type WallMedia =
  | ({ type: 'image' } & WallImage)
  | ({ type: 'video' } & WallVideo);

export type WallAuthor = {
  name: string;
  /** Their headline as the network shows it: "Head of Sales at Acme". */
  title?: string;
  /** Profile photo. Without one the card shows their initials. */
  avatar?: PublicPath;
};

export type WhatsAppMessage = {
  /** `them` is the author (left, white); `us` is the Ringee team (right, green). */
  from: 'them' | 'us';
  text: string;
  /** The time the chat shows on the message, e.g. "10:42". */
  time?: string;
};

type WallEntryBase = {
  /** Unique and stable: the card's key and its anchor on `/wall-of-love`. */
  id: string;
  author: WallAuthor;
  /** When it was posted or sent (YYYY-MM-DD). */
  date: string;
  /** Language the quote is in ('en', 'es'…), so screen readers voice it right. */
  lang: string;
  /** The public original. The whole card links to it. */
  url?: string;
  /** Also shown on the home page. */
  featured?: boolean;
  /** Its author got something for it, or is close to the team (see above). */
  incentivized?: boolean;
};

export type WallEntry = WallEntryBase &
  (
    | {
        source: 'linkedin';
        /** A post of their own (the default) or a comment under a post. */
        kind?: 'post' | 'comment';
        text: string;
        media?: WallMedia;
        reactions?: number;
        comments?: number;
        reposts?: number;
      }
    | {
        source: 'whatsapp';
        messages?: WhatsAppMessage[];
        media?: WallMedia;
      }
    | {
        source: 'x';
        /** Their handle, without the @. */
        handle: string;
        text: string;
        media?: WallMedia;
      }
    | {
        source: 'trustpilot';
        rating: 1 | 2 | 3 | 4 | 5;
        title: string;
        text: string;
        /** The two-letter country Trustpilot shows next to the reviewer. */
        country?: string;
      }
    | {
        source: 'email';
        /** The subject line the inbox shows. */
        subject?: string;
        /** The body, greeting included. */
        text: string;
        /** The time the inbox shows on the email, e.g. "11:07 AM". */
        time?: string;
        /** The email as the inbox shows it, opened whole from the card. */
        screenshot?: WallImage;
      }
    | {
        source: 'video';
        video: WallVideo;
        /** A line from the video, shown under it. */
        quote?: string;
      }
  );

export type WallSource = WallEntry['source'];

export const WALL_OF_LOVE: WallEntry[] = [
  {
    id: 'email-ray-massey',
    source: 'email',
    author: {
      name: 'Ray Massey',
      title: 'Chief Business Officer at onSpark',
      avatar: '/wall-of-love/ray-massey-email.jpg'
    },
    date: '2026-09-10',
    time: '11:07 AM',
    lang: 'en',
    subject: 'Ringee <> Attio',
    text: "Hey Edison,\n\nLoving the UI in Ringee.io! I've used many dialers and am really excited.",
    screenshot: {
      src: '/wall-of-love/ray-massey-email-screenshot.png',
      width: 1074,
      height: 344,
      alt: "Ray Massey's email in Gmail, subject Ringee <> Attio: Hey Edison, Loving the UI in Ringee.io! I've used many dialers and am really excited."
    },
    featured: true
  },
  {
    id: 'trustpilot-travelm',
    source: 'trustpilot',
    author: { name: 'Travelm' },
    country: 'DO',
    date: '2026-08-19',
    lang: 'es',
    rating: 5,
    title: 'El mejor precio + IA + Integraciones avanzadas + Ventas',
    text: 'Es la mejor y mas completa solucion costo-beneficio con integraciones asombrosas para automatizar procesos con IA, realmente la mejor alternativa para potencial las ventas, tiene integraciones con los mejores CRMs y su propio widget para tu web, simplemente el milagro que esperaban los departamentos de ventas tras la salida de skype del mercado.',
    url: 'https://www.trustpilot.com/reviews/6a86264a6744003687b863ea',
    featured: true
  },
  {
    id: 'trustpilot-muhammad-uzair',
    source: 'trustpilot',
    author: {
      name: 'Muhammad Uzair',
      avatar: '/wall-of-love/muhammad-uzair-trustpilot.png'
    },
    country: 'PK',
    date: '2026-08-18',
    lang: 'en',
    rating: 5,
    title: 'Best calling software for new startups',
    text: 'From a long time I was looking for a Voip software that has bearable pricing, and a proper dashboard. Majority needed business verifications at time of sign-up, but then I found ringee that solved all these three problems, and the best part is I can even call with a public number. I also liked their customer service, they replies fast, answers every query they can.',
    url: 'https://www.trustpilot.com/reviews/6a84920baa10b28afb20ba31',
    featured: true
  },
  {
    id: 'trustpilot-geison-medina',
    source: 'trustpilot',
    author: {
      name: 'Geison Medina',
      avatar: '/wall-of-love/geison-medina-trustpilot.png'
    },
    country: 'DO',
    date: '2026-08-18',
    lang: 'es',
    rating: 5,
    title: 'La mejor app de llamada',
    text: 'La mejor app de llamadas',
    url: 'https://www.trustpilot.com/reviews/6a84657f4d3540c5d5796981',
    featured: true
  }
];

/** How many entries the home page shows at most. */
const HOME_LIMIT = 6;

/** The entries the home page shows: the featured ones, else the first few. */
export function homeWallEntries(): WallEntry[] {
  const featured = WALL_OF_LOVE.filter((entry) => entry.featured);
  return (featured.length > 0 ? featured : WALL_OF_LOVE).slice(0, HOME_LIMIT);
}
