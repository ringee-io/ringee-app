'use client';

import { Bold, Braces, Code2, List, ListOrdered, Quote } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { VoiceAgentVariable } from '../types';
import { PromptVariableMenu } from './prompt-variable-menu';

type EditorMode = 'visual' | 'markdown';
type VisualCommand =
  | 'bold'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'formatBlock';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/** A small, deliberately safe Markdown subset for the Word-like editor. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]?.startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2] ?? '')}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? '')) {
        items.push(
          `<li>${inlineMarkdown((lines[index] ?? '').replace(/^\s*[-*]\s+/, ''))}</li>`
        );
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] ?? '')) {
        items.push(
          `<li>${inlineMarkdown((lines[index] ?? '').replace(/^\s*\d+\.\s+/, ''))}</li>`
        );
        index += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        quoted.push((lines[index] ?? '').replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(
        `<blockquote>${inlineMarkdown(quoted.join('\n'))}</blockquote>`
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !/^(#{1,4})\s+|^```|^\s*[-*]\s+|^\s*\d+\.\s+|^>\s?/.test(
        lines[index] ?? ''
      )
    ) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
  }

  return blocks.join('');
}

function inlineFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  const content = Array.from(node.childNodes).map(inlineFromNode).join('');
  switch (node.tagName) {
    case 'STRONG':
    case 'B':
      return `**${content}**`;
    case 'EM':
    case 'I':
      return `*${content}*`;
    case 'CODE':
      return node.parentElement?.tagName === 'PRE' ? content : `\`${content}\``;
    case 'BR':
      return '\n';
    default:
      return content;
  }
}

function blockFromElement(element: HTMLElement): string {
  const inline = () =>
    Array.from(element.childNodes).map(inlineFromNode).join('').trimEnd();
  switch (element.tagName) {
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
      return `${'#'.repeat(Number(element.tagName.slice(1)))} ${inline()}`;
    case 'UL':
      return Array.from(element.children)
        .map((item) => `- ${inlineFromNode(item).trim()}`)
        .join('\n');
    case 'OL':
      return Array.from(element.children)
        .map((item, index) => `${index + 1}. ${inlineFromNode(item).trim()}`)
        .join('\n');
    case 'BLOCKQUOTE':
      return inline()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'PRE':
      return `\`\`\`\n${element.textContent ?? ''}\n\`\`\``;
    default:
      return inline();
  }
}

export function htmlToMarkdown(root: HTMLElement): string {
  return Array.from(root.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
      return node instanceof HTMLElement ? blockFromElement(node) : '';
    })
    .filter((block) => block.trim())
    .join('\n\n')
    .trim();
}

function ToolButton({
  label,
  children,
  onRun
}: {
  label: string;
  children: ReactNode;
  onRun: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='size-9 rounded-md p-0'
          aria-label={label}
          onMouseDown={(event) => {
            event.preventDefault();
            onRun();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  variables,
  label,
  placeholder,
  invalid
}: {
  value: string;
  onChange: (value: string) => void;
  variables: VoiceAgentVariable[];
  label: string;
  placeholder: string;
  invalid?: boolean;
}) {
  const t = useTranslations('aiVoiceAgents.conversation.editor');
  const [mode, setMode] = useState<EditorMode>('visual');
  const visualRef = useRef<HTMLDivElement>(null);
  const rawRef = useRef<HTMLTextAreaElement>(null);
  const lastRendered = useRef('');
  const selection = useRef<Range | null>(null);

  useEffect(() => {
    const editor = visualRef.current;
    if (
      mode !== 'visual' ||
      !editor ||
      (lastRendered.current === value && editor.innerHTML)
    )
      return;
    editor.innerHTML = markdownToHtml(value);
    lastRendered.current = value;
  }, [mode, value]);

  const rememberSelection = useCallback(() => {
    const editor = visualRef.current;
    const current = window.getSelection();
    if (editor && current?.rangeCount && editor.contains(current.anchorNode)) {
      selection.current = current.getRangeAt(0).cloneRange();
    }
  }, []);

  const emitVisual = useCallback(() => {
    const editor = visualRef.current;
    if (!editor) return;
    const markdown = htmlToMarkdown(editor);
    lastRendered.current = markdown;
    onChange(markdown);
    rememberSelection();
  }, [onChange, rememberSelection]);

  const restoreVisualSelection = () => {
    const editor = visualRef.current;
    if (!editor) return;
    editor.focus();
    const current = window.getSelection();
    if (!selection.current) {
      const end = document.createRange();
      end.selectNodeContents(editor);
      end.collapse(false);
      current?.removeAllRanges();
      current?.addRange(end);
      selection.current = end;
      return;
    }
    current?.removeAllRanges();
    current?.addRange(selection.current);
  };

  const runVisual = (command: VisualCommand, valueArgument?: string) => {
    restoreVisualSelection();
    document.execCommand(command, false, valueArgument);
    emitVisual();
  };

  const replaceRawSelection = (before: string, after = before) => {
    const textarea = rawRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    });
  };

  const insertText = (text: string) => {
    if (mode === 'markdown') {
      replaceRawSelection(text, '');
      return;
    }
    restoreVisualSelection();
    document.execCommand('insertText', false, text);
    emitVisual();
  };

  const run = (
    command: VisualCommand,
    visualValue: string | undefined,
    rawBefore: string,
    rawAfter = rawBefore
  ) => {
    if (mode === 'visual') runVisual(command, visualValue);
    else replaceRawSelection(rawBefore, rawAfter);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    document.execCommand(
      'insertText',
      false,
      event.clipboardData.getData('text/plain')
    );
  };

  const handleRawKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      replaceRawSelection('**');
    }
  };

  return (
    <div
      className={cn(
        'bg-background overflow-hidden rounded-xl border shadow-xs',
        invalid && 'border-destructive ring-destructive/20 ring-2'
      )}
    >
      <div className='bg-muted/40 flex flex-wrap items-center gap-1 border-b p-2'>
        <div className='bg-muted mr-1 flex rounded-lg p-0.5'>
          {(['visual', 'markdown'] as const).map((candidate) => (
            <button
              key={candidate}
              type='button'
              className={cn(
                'focus-visible:ring-ring min-h-9 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                mode === candidate
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-pressed={mode === candidate}
              onClick={() => setMode(candidate)}
            >
              {candidate === 'visual' ? t('visual') : t('markdown')}
            </button>
          ))}
        </div>

        {(['H1', 'H2', 'H3'] as const).map((heading) => (
          <ToolButton
            key={heading}
            label={t('heading', { level: heading.slice(1) })}
            onRun={() =>
              run(
                'formatBlock',
                `<${heading.toLowerCase()}>`,
                `${'#'.repeat(Number(heading.slice(1)))} `,
                ''
              )
            }
          >
            <span className='text-xs font-semibold'>{heading}</span>
          </ToolButton>
        ))}
        <ToolButton
          label={t('bold')}
          onRun={() => run('bold', undefined, '**')}
        >
          <Bold className='size-4' />
        </ToolButton>
        <ToolButton
          label={t('bulletedList')}
          onRun={() => run('insertUnorderedList', undefined, '- ', '')}
        >
          <List className='size-4' />
        </ToolButton>
        <ToolButton
          label={t('numberedList')}
          onRun={() => run('insertOrderedList', undefined, '1. ', '')}
        >
          <ListOrdered className='size-4' />
        </ToolButton>
        <ToolButton
          label={t('quote')}
          onRun={() => run('formatBlock', '<blockquote>', '> ', '')}
        >
          <Quote className='size-4' />
        </ToolButton>
        <ToolButton
          label={t('codeBlock')}
          onRun={() => run('formatBlock', '<pre>', '```\n', '\n```')}
        >
          <Code2 className='size-4' />
        </ToolButton>

        <div className='ml-auto'>
          <PromptVariableMenu variables={variables} onInsert={insertText} />
        </div>
      </div>

      {mode === 'visual' ? (
        <div
          ref={visualRef}
          role='textbox'
          aria-label={label}
          aria-multiline='true'
          aria-invalid={invalid}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          className={cn(
            'min-h-96 cursor-text overflow-y-auto px-6 py-5 text-base leading-7 outline-none',
            'empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]',
            '[&_blockquote]:border-primary/40 [&_blockquote]:text-muted-foreground [&_blockquote]:border-l-4 [&_blockquote]:pl-4',
            '[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm',
            '[&_h1]:mt-5 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold',
            '[&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold',
            '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold',
            '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:my-3',
            '[&_pre]:bg-muted [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-4',
            '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-7'
          )}
          onInput={emitVisual}
          onBlur={emitVisual}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onPaste={handlePaste}
        />
      ) : (
        <Textarea
          ref={rawRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleRawKeyDown}
          aria-label={label}
          aria-invalid={invalid}
          placeholder={placeholder}
          className='min-h-96 resize-y rounded-none border-0 px-5 py-4 font-mono text-sm shadow-none focus-visible:ring-0'
        />
      )}

      <div className='text-muted-foreground flex items-center gap-1.5 border-t px-3 py-2 text-xs'>
        <Braces className='size-3.5' />
        {t('footer')}
      </div>
    </div>
  );
}
