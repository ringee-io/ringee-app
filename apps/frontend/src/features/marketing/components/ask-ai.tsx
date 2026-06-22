'use client';

import { type ReactNode, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ChevronDown, Copy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';

import { SITE_NAME, SITE_URL } from '../site';

/* -------------------------------------------------------------------------- */
/*  Brand marks                                                               */
/* -------------------------------------------------------------------------- */

/** OpenAI / ChatGPT mark. Inherits `currentColor` so it adapts to the theme. */
function ChatGptIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      className='text-foreground size-5'
      fill='currentColor'
      aria-hidden
    >
      <path d='M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z' />
    </svg>
  );
}

/** Anthropic / Claude mark, in the brand clay color. */
function ClaudeIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      className='size-[1.15rem]'
      fill='#D97757'
      aria-hidden
    >
      <path d='M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5527h3.7442L10.5363 3.541Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z' />
    </svg>
  );
}

/** Google Gemini spark, with the brand gradient. */
function GeminiIcon() {
  return (
    <svg viewBox='0 0 24 24' className='size-5' aria-hidden>
      <defs>
        <linearGradient
          id='ringee-ask-ai-gemini'
          x1='0'
          y1='0'
          x2='24'
          y2='24'
          gradientUnits='userSpaceOnUse'
        >
          <stop offset='0' stopColor='#4285F4' />
          <stop offset='0.5' stopColor='#9B72CB' />
          <stop offset='1' stopColor='#D96570' />
        </linearGradient>
      </defs>
      <path
        fill='url(#ringee-ask-ai-gemini)'
        d='M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z'
      />
    </svg>
  );
}

/** The canonical Markdown mark. */
function MarkdownIcon() {
  return (
    <svg viewBox='0 0 208 128' className='text-foreground size-5' aria-hidden>
      <rect
        width='198'
        height='118'
        x='5'
        y='5'
        ry='10'
        fill='none'
        stroke='currentColor'
        strokeWidth='10'
      />
      <path
        fill='currentColor'
        d='M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z'
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  DOM → Markdown                                                            */
/* -------------------------------------------------------------------------- */

/** Serialize an inline node (text + emphasis + links) to Markdown. */
function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\s+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  if (el.getAttribute('aria-hidden') === 'true') return '';

  const inner = Array.from(el.childNodes).map(inlineToMarkdown).join('');
  const text = inner.trim();

  switch (el.tagName.toLowerCase()) {
    case 'strong':
    case 'b':
      return text ? `**${inner}**` : '';
    case 'em':
    case 'i':
      return text ? `*${inner}*` : '';
    case 'code':
      return text ? `\`${inner}\`` : '';
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      const url = href.startsWith('/') ? `${SITE_URL}${href}` : href;
      return text && url ? `[${inner}](${url})` : inner;
    }
    case 'br':
      return '\n';
    default:
      return inner;
  }
}

/**
 * Walk a container and emit block-level Markdown (headings, paragraphs, lists,
 * quotes, rules). Descends through layout wrappers until it reaches content.
 */
function blocksToMarkdown(root: HTMLElement, out: string[]): void {
  for (const child of Array.from(root.children) as HTMLElement[]) {
    if (child.getAttribute('aria-hidden') === 'true') continue;

    const tag = child.tagName.toLowerCase();
    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4': {
        const text = inlineToMarkdown(child).trim();
        if (text) out.push(`${'#'.repeat(Number(tag[1]))} ${text}`, '');
        break;
      }
      case 'p': {
        const text = inlineToMarkdown(child).trim();
        if (text) out.push(text, '');
        break;
      }
      case 'ul':
      case 'ol': {
        Array.from(child.children).forEach((li, index) => {
          const text = inlineToMarkdown(li).trim();
          if (text)
            out.push(tag === 'ol' ? `${index + 1}. ${text}` : `- ${text}`);
        });
        out.push('');
        break;
      }
      case 'blockquote': {
        const text = inlineToMarkdown(child).trim();
        if (text) out.push(`> ${text}`, '');
        break;
      }
      case 'hr':
        out.push('---', '');
        break;
      case 'script':
      case 'style':
      case 'svg':
      case 'noscript':
        break;
      default:
        blocksToMarkdown(child, out);
    }
  }
}

/** Build a full Markdown document from the current page's `<main>` region. */
function buildPageMarkdown(url: string): string {
  const main = document.querySelector('main');
  const title = document.title || SITE_NAME;
  const lines: string[] = [];
  if (main) blocksToMarkdown(main as HTMLElement, lines);
  const body = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `# ${title}\n\n> Source: ${url}\n\n${body}\n`;
}

/* -------------------------------------------------------------------------- */
/*  Menu row                                                                  */
/* -------------------------------------------------------------------------- */

function MenuRow({
  icon,
  tileClassName,
  title,
  subtitle,
  onSelect,
  external = true
}: {
  icon: ReactNode;
  tileClassName?: string;
  title: string;
  subtitle: string;
  onSelect: () => void;
  external?: boolean;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className='group/row focus:bg-accent/60 cursor-pointer gap-3 rounded-xl p-2.5'
    >
      <span
        className={cn(
          'border-border/60 flex size-9 shrink-0 items-center justify-center rounded-lg border',
          tileClassName
        )}
      >
        {icon}
      </span>
      <span className='flex min-w-0 flex-col'>
        <span className='text-foreground text-sm font-medium'>{title}</span>
        <span className='text-muted-foreground truncate text-xs'>
          {subtitle}
        </span>
      </span>
      {external ? (
        <ArrowUpRight className='group-focus/row:text-muted-foreground ml-auto size-4 text-transparent transition-colors' />
      ) : (
        <Copy className='group-focus/row:text-muted-foreground ml-auto size-4 text-transparent transition-colors' />
      )}
    </DropdownMenuItem>
  );
}

/* -------------------------------------------------------------------------- */
/*  AskAi                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Floating "Ask AI" control rendered on every marketing page. Opens a polished
 * menu that hands the current page off to ChatGPT, Claude, or Gemini with a
 * ready-made prompt — or exposes the page as plain Markdown.
 */
export function AskAi() {
  const pathname = usePathname();

  // Canonical, publicly reachable URL (so the assistant can fetch the page even
  // when we're previewing on localhost).
  const pageUrl = `${SITE_URL}${pathname === '/' ? '' : pathname}`;

  const buildPrompt = useCallback(() => {
    const title = document.title || SITE_NAME;
    return `I'm reading the ${SITE_NAME} page "${title}". Please read it at ${pageUrl}, give me a concise overview, and then answer my follow-up questions about it.`;
  }, [pageUrl]);

  const openInChatGpt = useCallback(() => {
    const q = encodeURIComponent(buildPrompt());
    window.open(
      `https://chatgpt.com/?hints=search&q=${q}`,
      '_blank',
      'noopener,noreferrer'
    );
  }, [buildPrompt]);

  const openInClaude = useCallback(() => {
    const q = encodeURIComponent(buildPrompt());
    window.open(
      `https://claude.ai/new?q=${q}`,
      '_blank',
      'noopener,noreferrer'
    );
  }, [buildPrompt]);

  // Gemini has no reliable prompt-prefill URL param, so we copy the prompt and
  // open the app — the user just pastes.
  const openInGemini = useCallback(() => {
    const prompt = buildPrompt();
    void navigator.clipboard?.writeText(prompt).then(
      () => toast.success('Prompt copied — paste it into Gemini'),
      () => undefined
    );
    window.open(
      'https://gemini.google.com/app',
      '_blank',
      'noopener,noreferrer'
    );
  }, [buildPrompt]);

  const viewAsMarkdown = useCallback(() => {
    const markdown = buildPageMarkdown(pageUrl);
    // text/plain renders inline in the browser instead of triggering a download.
    const blob = new Blob([markdown], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }, [pageUrl]);

  const copyAsMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildPageMarkdown(pageUrl));
      toast.success('Page copied as Markdown');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }, [pageUrl]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          aria-label='Ask AI about this page'
          className='group border-border/70 bg-background/90 focus-visible:ring-offset-background fixed bottom-4 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border py-2.5 pr-3 pl-4 text-sm font-semibold shadow-lg shadow-black/5 backdrop-blur-md transition-all hover:border-emerald-500/50 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:bottom-6'
        >
          <Sparkles className='size-4 text-emerald-600 dark:text-emerald-400' />
          Ask AI
          <ChevronDown className='text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-180' />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side='top'
        align='center'
        sideOffset={12}
        className='border-border/70 w-[20rem] rounded-2xl p-2 shadow-2xl'
      >
        <div className='px-2 pt-1 pb-2'>
          <p className='text-foreground text-sm font-semibold'>
            Ask AI about this page
          </p>
          <p className='text-muted-foreground text-xs'>
            Open it in your assistant, pre-filled and ready.
          </p>
        </div>

        <MenuRow
          icon={<ChatGptIcon />}
          tileClassName='bg-muted/50'
          title='Open in ChatGPT'
          subtitle='Read this page in ChatGPT'
          onSelect={openInChatGpt}
        />
        <MenuRow
          icon={<ClaudeIcon />}
          tileClassName='bg-[#D97757]/10'
          title='Open in Claude'
          subtitle='Read this page in Claude'
          onSelect={openInClaude}
        />
        <MenuRow
          icon={<GeminiIcon />}
          tileClassName='bg-blue-500/10'
          title='Open in Gemini'
          subtitle='Copy the prompt and open Gemini'
          onSelect={openInGemini}
        />

        <DropdownMenuSeparator className='my-2' />

        <MenuRow
          icon={<MarkdownIcon />}
          tileClassName='bg-muted/50'
          title='View as Markdown'
          subtitle='Open a clean plain-text version'
          onSelect={viewAsMarkdown}
        />
        <MenuRow
          icon={<MarkdownIcon />}
          tileClassName='bg-muted/50'
          title='Copy as Markdown'
          subtitle='Copy the page to your clipboard'
          onSelect={() => void copyAsMarkdown()}
          external={false}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
