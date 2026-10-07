import Image from 'next/image';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  CheckCheck,
  Gift,
  Globe,
  Heart,
  Lightbulb,
  ThumbsUp
} from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import type {
  WallAuthor,
  WallEntry,
  WallMedia,
  WallSource,
  WhatsAppMessage
} from '../content/wall-of-love';
import { NETWORK_NAMES, SourceLogo, StarShape } from './wall-of-love-marks';
import {
  ExpandableText,
  ScreenshotLightbox,
  TestimonialVideo
} from './wall-of-love-media';

// A wall-of-love card, drawn after the network the entry comes from. It takes
// plain data and no hooks, so the server renders it on the pages and the
// takeover renders it again in the browser.

type EntryOf<S extends WallSource> = Extract<WallEntry, { source: S }>;

/** Copy every card shares, in the page's language. */
export type WallCardLabels = {
  more: string;
  less: string;
  comment: string;
  viewScreenshot: string;
  close: string;
  rewarded: string;
};

/** One entry with its date and the strings that name it, already translated. */
export type WallCardData = {
  entry: WallEntry;
  date: string;
  /** Accessible name of the card's link, when it has a public original. */
  linkLabel?: string;
  playLabel: string;
  screenshotTitle: string;
  ratingLabel?: string;
  stats?: { reactions?: string; comments?: string; reposts?: string };
};

const AVATAR_COLORS = [
  'bg-emerald-600',
  'bg-sky-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-indigo-600',
  'bg-orange-600'
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? '')
    .join('');
}

/** The same name always gets the same colour. */
function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function Avatar({ author }: { author: WallAuthor }) {
  // The name sits right next to it, so the photo itself is decorative.
  if (author.avatar) {
    return (
      <Image
        src={author.avatar}
        alt=''
        width={36}
        height={36}
        sizes='36px'
        className='h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10'
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white',
        avatarColor(author.name)
      )}
    >
      {initials(author.name)}
    </span>
  );
}

const BRAND_MENTION = /(@?ringee(?:\.io)?)/gi;

/** Mentions of Ringee stand out, the way the network renders a tag. */
function highlightBrand(text: string): ReactNode[] {
  return text.split(BRAND_MENTION).map((part, index) =>
    index % 2 === 1 ? (
      <strong
        key={index}
        className='font-semibold text-emerald-700 dark:text-emerald-400'
      >
        {part}
      </strong>
    ) : (
      part
    )
  );
}

/** A short quote reads as a statement; a long one as the post it is. */
function quoteSize(text: string): string {
  return text.length <= 90
    ? 'text-[17px] leading-snug font-semibold tracking-tight'
    : 'text-[13.5px] leading-[1.5]';
}

/**
 * The network's logo, top right. When the entry has a public original the
 * logo is the card's link, stretched over the whole card; the interactive
 * parts of a card sit above it.
 */
function SourceMark({ card }: { card: WallCardData }) {
  const { entry } = card;
  if (!entry.url) {
    const network =
      entry.source === 'video' ? undefined : NETWORK_NAMES[entry.source];
    return (
      <span
        role={network ? 'img' : undefined}
        aria-label={network}
        className='flex h-5 shrink-0 items-center'
      >
        <SourceLogo source={entry.source} />
      </span>
    );
  }
  return (
    <a
      href={entry.url}
      target='_blank'
      rel='noopener noreferrer'
      className='flex h-5 shrink-0 items-center gap-1 text-black/40 after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-emerald-500 focus-visible:after:ring-inset dark:text-white/40'
    >
      <ArrowUpRight
        aria-hidden
        className='h-3.5 w-3.5 opacity-0 transition-opacity group-hover/card:opacity-100'
      />
      <SourceLogo source={entry.source} />
      <span className='sr-only'>{card.linkLabel}</span>
    </a>
  );
}

function CardHeader({ card, meta }: { card: WallCardData; meta: ReactNode }) {
  const { author } = card.entry;
  return (
    <div className='flex items-start gap-2.5'>
      <Avatar author={author} />
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[13px] leading-[18px] font-semibold'>
          {author.name}
        </p>
        {author.title ? (
          <p className='text-muted-foreground line-clamp-2 text-[11.5px] leading-4'>
            {author.title}
          </p>
        ) : null}
        <p className='text-muted-foreground mt-px flex items-center gap-1 text-[11.5px] leading-4'>
          {meta}
        </p>
      </div>
      <SourceMark card={card} />
    </div>
  );
}

function CardShell({
  card,
  labels,
  flush,
  children
}: {
  card: WallCardData;
  labels: WallCardLabels;
  /** Media runs to the edges; the card pads its own text. */
  flush?: boolean;
  children: ReactNode;
}) {
  const { entry } = card;
  return (
    <article
      className={cn(
        'group/card border-border bg-card text-card-foreground relative overflow-hidden rounded-xl border text-left shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)] transition-shadow duration-200',
        entry.url && 'hover:shadow-[0_12px_32px_-10px_rgba(0,0,0,0.3)]',
        !flush && 'p-4'
      )}
    >
      {children}
      {entry.incentivized ? (
        <p
          className={cn(
            'text-muted-foreground mt-3 flex items-center gap-1.5 text-[11px]',
            flush && 'px-4 pb-4'
          )}
        >
          <Gift aria-hidden className='h-3 w-3' />
          {labels.rewarded}
        </p>
      ) : null}
    </article>
  );
}

/** An image or video in a post, edge to edge like the network shows it. */
function PostMedia({ media, card }: { media: WallMedia; card: WallCardData }) {
  if (media.type === 'video') {
    return (
      <TestimonialVideo
        video={media}
        playLabel={card.playLabel}
        className='-mx-4 mt-3'
      />
    );
  }
  return (
    <Image
      src={media.src}
      alt={media.alt}
      width={media.width}
      height={media.height}
      sizes='(min-width: 1280px) 300px, (min-width: 640px) 45vw, 80vw'
      className='-mx-4 mt-3 block h-auto max-h-64 w-[calc(100%+2rem)] max-w-none object-cover'
    />
  );
}

function LinkedInCard({
  card,
  entry,
  labels
}: {
  card: WallCardData;
  entry: EntryOf<'linkedin'>;
  labels: WallCardLabels;
}) {
  const comment = entry.kind === 'comment';
  const { stats } = card;
  return (
    <CardShell card={card} labels={labels}>
      <CardHeader
        card={card}
        meta={
          comment ? (
            <>
              {labels.comment} · {card.date}
            </>
          ) : (
            <>
              {card.date} · <Globe aria-hidden className='h-3 w-3' />
            </>
          )
        }
      />
      <ExpandableText
        lang={entry.lang}
        moreLabel={labels.more}
        lessLabel={labels.less}
        className={cn(
          'mt-3',
          comment
            ? 'rounded-lg rounded-tl-sm bg-[#F3F2EF] px-3 py-2.5 text-[13px] leading-[1.5] dark:bg-white/[0.06]'
            : quoteSize(entry.text)
        )}
      >
        {highlightBrand(entry.text)}
      </ExpandableText>
      {entry.media ? <PostMedia media={entry.media} card={card} /> : null}
      {stats?.reactions || stats?.comments || stats?.reposts ? (
        <div className='text-muted-foreground mt-3 flex items-center justify-between gap-3 text-[11px]'>
          {entry.reactions ? (
            <span className='flex items-center gap-1.5'>
              <span aria-hidden className='flex -space-x-1'>
                <span className='border-card flex h-4 w-4 items-center justify-center rounded-full border bg-[#378FE9]'>
                  <ThumbsUp className='h-2 w-2 fill-white text-white' />
                </span>
                <span className='border-card flex h-4 w-4 items-center justify-center rounded-full border bg-[#DF704D]'>
                  <Heart className='h-2 w-2 fill-white text-white' />
                </span>
                <span className='border-card flex h-4 w-4 items-center justify-center rounded-full border bg-[#F5BB5C]'>
                  <Lightbulb className='h-2 w-2 fill-white text-white' />
                </span>
              </span>
              <span className='sr-only'>{stats.reactions}</span>
              <span aria-hidden>{entry.reactions}</span>
            </span>
          ) : (
            <span />
          )}
          <span className='flex gap-2.5'>
            {stats.comments ? <span>{stats.comments}</span> : null}
            {stats.reposts ? <span>{stats.reposts}</span> : null}
          </span>
        </div>
      ) : null}
    </CardShell>
  );
}

function WhatsAppBubble({
  message,
  first
}: {
  message: WhatsAppMessage;
  /** First of a run from the same side: the bubble gets its tail. */
  first: boolean;
}) {
  const ours = message.from === 'us';
  return (
    <li
      className={cn(
        'max-w-[88%] rounded-lg px-2 pt-1 pb-0.5 text-[13px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] dark:text-[#e9edef]',
        ours
          ? 'ml-auto bg-[#d9fdd3] dark:bg-[#005c4b]'
          : 'mr-auto bg-white dark:bg-[#202c33]',
        first && (ours ? 'mt-1.5 rounded-tr-none' : 'mt-1.5 rounded-tl-none')
      )}
    >
      <span className='whitespace-pre-line'>{message.text}</span>
      {message.time ? (
        <span
          className={cn(
            'float-right mt-1.5 ml-2 flex items-center gap-0.5 text-[10px] leading-none text-[#667781]',
            ours ? 'dark:text-white/60' : 'dark:text-[#8696a0]'
          )}
        >
          {message.time}
          {ours ? (
            <CheckCheck aria-hidden className='h-3 w-3 text-[#53bdeb]' />
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

function WhatsAppCard({
  card,
  entry,
  labels
}: {
  card: WallCardData;
  entry: EntryOf<'whatsapp'>;
  labels: WallCardLabels;
}) {
  const messages = entry.messages ?? [];
  return (
    <CardShell card={card} labels={labels}>
      <CardHeader card={card} meta={card.date} />
      <div
        lang={entry.lang}
        className='mt-3 rounded-lg bg-[#efeae2] p-2 dark:bg-[#0b141a]'
      >
        {messages.length ? (
          <ol className='-mt-1.5 flex flex-col gap-1 pb-0.5'>
            {messages.map((message, index) => (
              <WhatsAppBubble
                key={index}
                message={message}
                first={messages[index - 1]?.from !== message.from}
              />
            ))}
          </ol>
        ) : null}
        {entry.media ? (
          <div className={cn(messages.length > 0 && 'mt-2')}>
            {entry.media.type === 'image' ? (
              <ScreenshotLightbox
                image={entry.media}
                title={card.screenshotTitle}
                openLabel={labels.viewScreenshot}
                closeLabel={labels.close}
              />
            ) : (
              <TestimonialVideo
                video={entry.media}
                playLabel={card.playLabel}
                className='rounded-md'
              />
            )}
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}

function XCard({
  card,
  entry,
  labels
}: {
  card: WallCardData;
  entry: EntryOf<'x'>;
  labels: WallCardLabels;
}) {
  return (
    <CardShell card={card} labels={labels}>
      <CardHeader
        card={card}
        meta={
          <>
            @{entry.handle} · {card.date}
          </>
        }
      />
      <ExpandableText
        lang={entry.lang}
        moreLabel={labels.more}
        lessLabel={labels.less}
        className={cn('mt-3', quoteSize(entry.text))}
      >
        {highlightBrand(entry.text)}
      </ExpandableText>
      {entry.media ? <PostMedia media={entry.media} card={card} /> : null}
    </CardShell>
  );
}

/** Trustpilot colours the stars by the rating itself, not star by star. */
const TRUSTPILOT_COLORS = {
  1: '#FF3722',
  2: '#FF8622',
  3: '#FFCE00',
  4: '#73CF11',
  5: '#00B67A'
} as const;

function TrustpilotCard({
  card,
  entry,
  labels
}: {
  card: WallCardData;
  entry: EntryOf<'trustpilot'>;
  labels: WallCardLabels;
}) {
  return (
    <CardShell card={card} labels={labels}>
      <CardHeader
        card={card}
        meta={entry.country ? `${entry.country} · ${card.date}` : card.date}
      />
      <div
        role='img'
        aria-label={card.ratingLabel}
        className='mt-3 flex gap-0.5'
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={cn(
              'flex h-4 w-4 items-center justify-center',
              star > entry.rating && 'bg-[#DCDCE6] dark:bg-white/10'
            )}
            style={
              star <= entry.rating
                ? { backgroundColor: TRUSTPILOT_COLORS[entry.rating] }
                : undefined
            }
          >
            <StarShape
              className={cn(
                'h-3 w-3 text-white',
                star > entry.rating && 'dark:text-white/40'
              )}
            />
          </span>
        ))}
      </div>
      <p lang={entry.lang} className='mt-2 text-[14px] leading-snug font-bold'>
        {entry.title}
      </p>
      <ExpandableText
        lang={entry.lang}
        moreLabel={labels.more}
        lessLabel={labels.less}
        clampClassName='line-clamp-6'
        className={cn('mt-1', quoteSize(entry.text))}
      >
        {entry.text}
      </ExpandableText>
    </CardShell>
  );
}

function EmailCard({
  card,
  entry,
  labels
}: {
  card: WallCardData;
  entry: EntryOf<'email'>;
  labels: WallCardLabels;
}) {
  return (
    <CardShell card={card} labels={labels}>
      <CardHeader
        card={card}
        meta={entry.time ? `${card.date} · ${entry.time}` : card.date}
      />
      {entry.subject ? (
        <p
          lang={entry.lang}
          className='mt-3 text-[14px] leading-snug font-bold'
        >
          {entry.subject}
        </p>
      ) : null}
      <ExpandableText
        lang={entry.lang}
        moreLabel={labels.more}
        lessLabel={labels.less}
        className={cn(entry.subject ? 'mt-1' : 'mt-3', quoteSize(entry.text))}
      >
        {highlightBrand(entry.text)}
      </ExpandableText>
      {entry.screenshot ? (
        // An inbox is white, like a light card: the ring is its edge.
        <div className='mt-3 rounded-lg ring-1 ring-black/[0.08] dark:ring-white/10'>
          <ScreenshotLightbox
            image={entry.screenshot}
            title={card.screenshotTitle}
            openLabel={labels.viewScreenshot}
            closeLabel={labels.close}
          />
        </div>
      ) : null}
    </CardShell>
  );
}

function VideoCard({
  card,
  entry,
  labels
}: {
  card: WallCardData;
  entry: EntryOf<'video'>;
  labels: WallCardLabels;
}) {
  return (
    <CardShell card={card} labels={labels} flush>
      <TestimonialVideo video={entry.video} playLabel={card.playLabel} />
      <div className='p-4'>
        <CardHeader card={card} meta={card.date} />
        {entry.quote ? (
          <p lang={entry.lang} className={cn('mt-3', quoteSize(entry.quote))}>
            “{entry.quote}”
          </p>
        ) : null}
      </div>
    </CardShell>
  );
}

export function WallCard({
  card,
  labels
}: {
  card: WallCardData;
  labels: WallCardLabels;
}) {
  const { entry } = card;
  switch (entry.source) {
    case 'linkedin':
      return <LinkedInCard card={card} entry={entry} labels={labels} />;
    case 'whatsapp':
      return <WhatsAppCard card={card} entry={entry} labels={labels} />;
    case 'x':
      return <XCard card={card} entry={entry} labels={labels} />;
    case 'trustpilot':
      return <TrustpilotCard card={card} entry={entry} labels={labels} />;
    case 'email':
      return <EmailCard card={card} entry={entry} labels={labels} />;
    case 'video':
      return <VideoCard card={card} entry={entry} labels={labels} />;
  }
}
