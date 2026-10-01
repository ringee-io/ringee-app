'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClerk, useUser } from '@clerk/nextjs';
import { useFormatter, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  Terminal,
  XCircle
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { Logo } from '@/features/landing/components/navbar/logo';
import type { CliAuthRequestView } from '../types';

type Outcome = 'approved' | 'denied' | 'expired' | 'used' | 'notFound';

/** Upper-cases and inserts the dash as the user types: "wdjbm" → "WDJB-M". */
function formatCodeInput(value: string): string {
  const raw = value
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

/**
 * The browser half of `ringee login`. Follows RFC 8628 §5.4: show what is
 * asking for access and the code to compare with the terminal, and require an
 * explicit click — a phished code is the attack this screen exists to stop.
 */
export function CliAuthorize({ initialCode }: { initialCode: string | null }) {
  const t = useTranslations('auth.cliAuthorize');
  const api = useApi();
  const router = useRouter();

  const [code, setCode] = useState(initialCode);
  const [request, setRequest] = useState<CliAuthRequestView | null>(null);
  const [loading, setLoading] = useState(Boolean(initialCode));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [workspaceId, setWorkspaceId] = useState('personal');
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (userCode: string) => {
      setLoading(true);
      setLoadError(null);
      setOutcome(null);
      try {
        const data = await api.get<CliAuthRequestView>(
          `/cli/auth/requests/${encodeURIComponent(userCode)}`
        );
        setRequest(data);
        setWorkspaceId(data.activeWorkspaceId);
        if (data.state !== 'pending') setOutcome(data.state);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setOutcome('notFound');
        } else {
          setLoadError(t('loadError'));
        }
      } finally {
        setLoading(false);
      }
    },
    [api, t]
  );

  useEffect(() => {
    if (code) void load(code);
  }, [code, load]);

  const submitCode = (value: string) => {
    setCode(value);
    router.replace(`/cli/authorize?code=${encodeURIComponent(value)}`);
  };

  const decide = async (decision: 'approve' | 'deny') => {
    if (!request) return;
    setSubmitting(decision);
    setActionError(null);
    try {
      const path = `/cli/auth/requests/${encodeURIComponent(request.userCode)}/${decision}`;
      await api.post(path, decision === 'approve' ? { workspaceId } : {});
      setOutcome(decision === 'approve' ? 'approved' : 'denied');
    } catch (err) {
      // Expired between loading and clicking: reload to show why.
      if (err instanceof ApiError && err.status === 400) {
        await load(request.userCode);
      } else {
        setActionError(t('actionError'));
      }
    } finally {
      setSubmitting(null);
    }
  };

  const reset = () => {
    setCode(null);
    setRequest(null);
    setOutcome(null);
    router.replace('/cli/authorize');
  };

  return (
    <div className='bg-muted/30 flex min-h-dvh flex-col items-center justify-center gap-6 p-4'>
      <Logo />
      <Card className='w-full max-w-md'>
        {!code ? (
          <EnterCode onSubmit={submitCode} />
        ) : loading ? (
          <LoadingState />
        ) : outcome ? (
          <OutcomeState outcome={outcome} onReset={reset} />
        ) : loadError || !request ? (
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription className='text-destructive'>
              {loadError ?? t('loadError')}
            </CardDescription>
          </CardHeader>
        ) : (
          <PendingRequest
            request={request}
            workspaceId={workspaceId}
            onWorkspaceChange={setWorkspaceId}
            submitting={submitting}
            actionError={actionError}
            onDecide={decide}
          />
        )}
      </Card>
    </div>
  );
}

function EnterCode({ onSubmit }: { onSubmit: (code: string) => void }) {
  const t = useTranslations('auth.cliAuthorize');
  const [value, setValue] = useState('');
  const complete = value.length === 9;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) onSubmit(value);
      }}
    >
      <CardHeader>
        <TerminalBadge />
        <CardTitle className='text-xl'>{t('enterCode.title')}</CardTitle>
        <CardDescription>
          {t.rich('enterCode.description', {
            code: (chunks) => <code className='font-mono'>{chunks}</code>
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-2 pt-4'>
        <Label htmlFor='cli-code'>{t('enterCode.label')}</Label>
        <Input
          id='cli-code'
          autoFocus
          autoComplete='one-time-code'
          inputMode='text'
          spellCheck={false}
          placeholder='XXXX-XXXX'
          value={value}
          onChange={(e) => setValue(formatCodeInput(e.target.value))}
          className='h-12 text-center font-mono text-xl tracking-[0.3em]'
        />
      </CardContent>
      <CardFooter className='pt-4'>
        <Button type='submit' className='w-full' disabled={!complete}>
          {t('enterCode.submit')}
        </Button>
      </CardFooter>
    </form>
  );
}

function PendingRequest({
  request,
  workspaceId,
  onWorkspaceChange,
  submitting,
  actionError,
  onDecide
}: {
  request: CliAuthRequestView;
  workspaceId: string;
  onWorkspaceChange: (id: string) => void;
  submitting: 'approve' | 'deny' | null;
  actionError: string | null;
  onDecide: (decision: 'approve' | 'deny') => void;
}) {
  const t = useTranslations('auth.cliAuthorize');
  const format = useFormatter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress;
  const now = new Date();

  return (
    <>
      <CardHeader>
        <TerminalBadge />
        <CardTitle className='text-xl'>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>

      <CardContent className='flex flex-col gap-5 pt-4'>
        <div className='bg-muted/50 flex flex-col items-center gap-1 rounded-lg border p-4'>
          <span className='text-muted-foreground text-xs'>
            {t('codeLabel')}
          </span>
          <span className='font-mono text-3xl font-semibold tracking-[0.2em]'>
            {request.userCode}
          </span>
        </div>

        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm'>
          <DeviceRow label={t('device.name')} value={request.deviceName} />
          <DeviceRow label={t('device.system')} value={request.platform} />
          <DeviceRow
            label={t('device.version')}
            value={request.clientVersion}
          />
          <DeviceRow label={t('device.ip')} value={request.requestIp} />
          <DeviceRow
            label={t('device.requested')}
            value={format.relativeTime(new Date(request.createdAt), now)}
          />
        </dl>

        {request.workspaces.length > 1 && (
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='cli-workspace'>{t('workspaceLabel')}</Label>
            <Select value={workspaceId} onValueChange={onWorkspaceChange}>
              <SelectTrigger id='cli-workspace' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {request.workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.type === 'personal' ? t('personal') : w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              {t.rich('workspaceHint', {
                code: (chunks) => <code className='font-mono'>{chunks}</code>
              })}
            </p>
          </div>
        )}

        <p className='text-muted-foreground text-xs'>{t('access')}</p>

        <div className='flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400'>
          <ShieldAlert className='mt-0.5 h-4 w-4 shrink-0' />
          <span>
            {t.rich('phishingWarning', {
              code: (chunks) => <code className='font-mono'>{chunks}</code>
            })}
          </span>
        </div>

        {actionError && (
          <p className='text-destructive text-sm' role='alert'>
            {actionError}
          </p>
        )}
      </CardContent>

      <CardFooter className='flex flex-col gap-4 pt-4'>
        <div className='flex w-full gap-2'>
          <Button
            variant='outline'
            className='flex-1'
            disabled={submitting !== null}
            onClick={() => onDecide('deny')}
          >
            {submitting === 'deny' && (
              <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
            )}
            {t('deny')}
          </Button>
          <Button
            className='flex-1'
            disabled={submitting !== null}
            onClick={() => onDecide('approve')}
          >
            {submitting === 'approve' && (
              <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
            )}
            {t('authorize')}
          </Button>
        </div>
        {email && (
          <p className='text-muted-foreground text-center text-xs'>
            {t('signedInAs', { email })}{' '}
            <button
              type='button'
              className='hover:text-primary underline underline-offset-4'
              onClick={() =>
                signOut({
                  redirectUrl: `/auth/sign-in?redirect_url=${encodeURIComponent(
                    `/cli/authorize?code=${request.userCode}`
                  )}`
                })
              }
            >
              {t('switchAccount')}
            </button>
          </p>
        )}
      </CardFooter>
    </>
  );
}

function DeviceRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='truncate font-medium' title={value}>
        {value}
      </dd>
    </>
  );
}

function TerminalBadge() {
  return (
    <div className='bg-primary/10 text-primary mb-2 flex h-10 w-10 items-center justify-center rounded-lg'>
      <Terminal className='h-5 w-5' />
    </div>
  );
}

function LoadingState() {
  return (
    <CardContent className='flex flex-col gap-4 py-8'>
      <Skeleton className='h-6 w-48' />
      <Skeleton className='h-4 w-64' />
      <Skeleton className='h-20 w-full' />
      <Skeleton className='h-24 w-full' />
    </CardContent>
  );
}

const OUTCOME_ICON: Record<Outcome, typeof CheckCircle2> = {
  approved: CheckCircle2,
  denied: XCircle,
  expired: Clock,
  used: AlertTriangle,
  notFound: AlertTriangle
};

function OutcomeState({
  outcome,
  onReset
}: {
  outcome: Outcome;
  onReset: () => void;
}) {
  const t = useTranslations('auth.cliAuthorize');
  const Icon = OUTCOME_ICON[outcome];
  const tone =
    outcome === 'approved'
      ? 'text-emerald-500'
      : outcome === 'denied'
        ? 'text-muted-foreground'
        : 'text-amber-500';

  return (
    <CardContent
      className='flex flex-col items-center gap-3 py-10 text-center'
      aria-live='polite'
    >
      <Icon className={`h-10 w-10 ${tone}`} />
      <h1 className='text-lg font-semibold'>{t(`${outcome}.title`)}</h1>
      <p className='text-muted-foreground max-w-xs text-sm'>
        {t.rich(`${outcome}.description`, {
          code: (chunks) => <code className='font-mono'>{chunks}</code>
        })}
      </p>
      {outcome !== 'approved' && outcome !== 'denied' && (
        <Button variant='outline' size='sm' className='mt-2' onClick={onReset}>
          {t('tryAnotherCode')}
        </Button>
      )}
    </CardContent>
  );
}
