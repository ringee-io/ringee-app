'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Users,
  User
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useAttioAppToken } from '../hooks/use-attio-app-token';
import { PROVIDER_META } from '../types/crm';

export function AttioAppTokenSection() {
  const t = useTranslations('integrations.attio.token');
  const { token, context, generating, error, generate, clear } =
    useAttioAppToken();
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meta = PROVIDER_META.attio;

  const handleGenerate = useCallback(async () => {
    try {
      await generate();
      setRevealed(true);
      toast.success(t('toasts.generated'));
    } catch {
      toast.error(t('toasts.generateError'));
    }
  }, [generate, t]);

  const handleCopy = useCallback(async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success(t('toasts.copied'));
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('toasts.copyError'));
    }
  }, [token, t]);

  const maskedToken = token
    ? `${token.slice(0, 12)}${'•'.repeat(32)}${token.slice(-8)}`
    : null;

  return (
    <section className='flex flex-col gap-4'>
      <div>
        <h2 className='text-muted-foreground text-sm font-semibold tracking-wide uppercase'>
          Attio App Token
        </h2>
        <p className='text-muted-foreground mt-1 text-xs'>
          Generate a secure token to connect the Ringee app inside your Attio
          workspace. Paste it into Attio &rarr; Apps &rarr; Ringee &rarr;
          Settings.
        </p>
      </div>

      <div className='bg-card rounded-xl border'>
        {/* Header */}
        <div className='flex items-center gap-3 border-b px-5 py-4'>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border font-semibold ${meta.color}`}
          >
            {meta.name.slice(0, 1)}
          </div>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <h3 className='text-sm font-semibold'>{t('title')}</h3>
              <Badge
                variant='outline'
                className='border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-500'
              >
                {t('badge')}
              </Badge>
            </div>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {t('description')}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className='px-5 py-4'>
          {!token ? (
            <div className='flex flex-col items-center gap-4 py-6 text-center'>
              <div className='flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10'>
                <Key className='h-5 w-5 text-violet-500' />
              </div>
              <div>
                <p className='text-sm font-medium'>{t('empty.title')}</p>
                <p className='text-muted-foreground mt-1 max-w-sm text-xs'>
                  {t('empty.description')}
                </p>
              </div>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                ) : (
                  <Key className='mr-1.5 h-3.5 w-3.5' />
                )}
                {t('generate')}
              </Button>
              {error && <p className='text-destructive text-xs'>{error}</p>}
            </div>
          ) : (
            <div className='flex flex-col gap-4'>
              {/* Context info */}
              {context && (
                <div className='text-muted-foreground flex flex-wrap items-center gap-2 text-xs'>
                  <span className='bg-muted/40 inline-flex items-center gap-1 rounded-md border px-2 py-0.5'>
                    {context.scope === 'organization' ? (
                      <>
                        <Users className='h-3 w-3' />{' '}
                        {context.organizationName ?? t('context.organization')}
                      </>
                    ) : (
                      <>
                        <User className='h-3 w-3' /> {t('context.personal')}
                      </>
                    )}
                  </span>
                  {context.userName && (
                    <span className='bg-muted/40 inline-flex items-center gap-1 rounded-md border px-2 py-0.5'>
                      <ShieldCheck className='h-3 w-3' />
                      {context.userName}
                    </span>
                  )}
                </div>
              )}

              {/* Token display */}
              <div className='group bg-muted/30 relative flex items-center gap-2 rounded-lg border px-3 py-2.5'>
                <code className='flex-1 font-mono text-xs leading-relaxed break-all select-all'>
                  {revealed ? token : maskedToken}
                </code>
                <div className='flex shrink-0 items-center gap-1'>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-7 w-7'
                          onClick={() => setRevealed((r) => !r)}
                        >
                          {revealed ? (
                            <EyeOff className='h-3.5 w-3.5' />
                          ) : (
                            <Eye className='h-3.5 w-3.5' />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side='top'>
                        {revealed ? t('hide') : t('reveal')}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-7 w-7'
                          onClick={handleCopy}
                        >
                          {copied ? (
                            <Check className='h-3.5 w-3.5 text-emerald-500' />
                          ) : (
                            <Copy className='h-3.5 w-3.5' />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side='top'>
                        {copied ? t('copiedBang') : t('copyToken')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {/* Actions */}
              <div className='flex items-center justify-between'>
                <p className='text-muted-foreground text-[11px]'>
                  This token does not expire. Regenerate it to revoke access
                  from a previously shared token.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant='outline'
                      size='sm'
                      className='shrink-0'
                      disabled={generating}
                    >
                      {generating ? (
                        <Loader2 className='mr-1.5 h-3 w-3 animate-spin' />
                      ) : (
                        <RotateCcw className='mr-1.5 h-3 w-3' />
                      )}
                      {t('regenerate')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('regenerateDialog.title')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('regenerateDialog.description')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t('regenerateDialog.cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={handleGenerate}>
                        {t('regenerate')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Setup instructions */}
              <div className='bg-muted/20 rounded-lg border border-dashed px-4 py-3'>
                <p className='text-foreground text-xs font-medium'>
                  {t('howTo.title')}
                </p>
                <ol className='text-muted-foreground mt-2 list-inside list-decimal space-y-1 text-xs'>
                  <li>{t('howTo.step1')}</li>
                  <li>
                    {t('howTo.step2Prefix')}{' '}
                    <span className='text-foreground font-medium'>
                      {t('howTo.step2Path')}
                    </span>
                  </li>
                  <li>
                    {t('howTo.step3Prefix')}{' '}
                    <span className='text-foreground font-medium'>
                      {t('howTo.step3Field')}
                    </span>{' '}
                    {t('howTo.step3Suffix')}
                  </li>
                  <li>{t('howTo.step4')}</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
