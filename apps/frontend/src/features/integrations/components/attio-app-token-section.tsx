'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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
  AlertDialogTrigger,
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
  User,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAttioAppToken } from '../hooks/use-attio-app-token';
import { PROVIDER_META } from '../types/crm';

export function AttioAppTokenSection() {
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
      toast.success('Token generated — copy it and paste it into your Attio workspace settings.');
    } catch {
      toast.error('Failed to generate token');
    }
  }, [generate]);

  const handleCopy = useCallback(async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success('Token copied to clipboard');
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy — try selecting the token manually');
    }
  }, [token]);

  const maskedToken = token
    ? `${token.slice(0, 12)}${'•'.repeat(32)}${token.slice(-8)}`
    : null;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Attio App Token
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Generate a secure token to connect the Ringee app inside your Attio
          workspace. Paste it into Attio &rarr; Apps &rarr; Ringee &rarr;
          Settings.
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border font-semibold ${meta.color}`}
          >
            {meta.name.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Ringee for Attio</h3>
              <Badge
                variant="outline"
                className="border-violet-500/30 bg-violet-500/10 text-violet-500 text-[10px]"
              >
                App Token
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Enables click-to-call, call history, and activity sync from within
              Attio
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {!token ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
                <Key className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  No token generated yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Generate a token to link your Ringee account to the Attio app.
                  The token is tied to your current user and{' '}
                  organization context.
                </p>
              </div>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Key className="mr-1.5 h-3.5 w-3.5" />
                )}
                Generate Token
              </Button>
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Context info */}
              {context && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5">
                    {context.scope === 'organization' ? (
                      <>
                        <Users className="h-3 w-3" />{' '}
                        {context.organizationName ?? 'Organization'}
                      </>
                    ) : (
                      <>
                        <User className="h-3 w-3" /> Personal
                      </>
                    )}
                  </span>
                  {context.userName && (
                    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5">
                      <ShieldCheck className="h-3 w-3" />
                      {context.userName}
                    </span>
                  )}
                </div>
              )}

              {/* Token display */}
              <div className="group relative flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
                <code className="flex-1 break-all text-xs font-mono leading-relaxed select-all">
                  {revealed ? token : maskedToken}
                </code>
                <div className="flex shrink-0 items-center gap-1">
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setRevealed((r) => !r)}
                        >
                          {revealed ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {revealed ? 'Hide' : 'Reveal'}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={handleCopy}
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {copied ? 'Copied!' : 'Copy token'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  This token does not expire. Regenerate it to revoke access from
                  a previously shared token.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={generating}
                    >
                      {generating ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-1.5 h-3 w-3" />
                      )}
                      Regenerate
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Regenerate token?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This creates a new token. The previous token will no
                        longer work — you&apos;ll need to update it in your Attio
                        workspace settings.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleGenerate}>
                        Regenerate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Setup instructions */}
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium text-foreground">
                  How to connect
                </p>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
                  <li>Copy the token above</li>
                  <li>
                    In Attio, go to{' '}
                    <span className="font-medium text-foreground">
                      Settings &rarr; Apps &rarr; Ringee
                    </span>
                  </li>
                  <li>
                    Paste the token into the{' '}
                    <span className="font-medium text-foreground">
                      Integration Token
                    </span>{' '}
                    field
                  </li>
                  <li>Save — the connection status will turn green</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
