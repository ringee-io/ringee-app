'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem
} from '@ringee/frontend-shared/components/ui/radio-group';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useOrganization } from '@clerk/nextjs';
import { AlertCircle, Plus, User, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  ODOO_VALIDATION_MESSAGES,
  PROVIDER_META,
  type CrmProviderType
} from '../types/crm';

type OdooProvider = Extract<CrmProviderType, 'odoo_14_18' | 'odoo_19_plus'>;

interface Props {
  provider: OdooProvider;
  alreadyConnected: boolean;
  onConnected: () => void;
}

type ConnectResponse =
  | {
      ok: true;
      connection: {
        id: string;
        provider: OdooProvider;
        accountName: string | null;
      };
    }
  | {
      ok: false;
      reason: keyof typeof ODOO_VALIDATION_MESSAGES;
      message: string;
      field?: 'baseUrl' | 'database' | 'login' | 'apiKey';
    };

export function OdooConnectDialog({
  provider,
  alreadyConnected,
  onConnected
}: Props) {
  const api = useApi();
  const { organization } = useOrganization();
  const meta = PROVIDER_META[provider];
  const loginRequired = provider === 'odoo_14_18';
  const t = useTranslations('integrations.odoo');

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'personal' | 'organization'>(
    organization ? 'organization' : 'personal'
  );
  const [form, setForm] = useState({
    baseUrl: '',
    database: '',
    login: '',
    apiKey: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{
    title: string;
    body: string;
    field?: string;
  } | null>(null);

  const canSubmit = useMemo(() => {
    if (!form.baseUrl.trim() || !form.database.trim() || !form.apiKey.trim()) {
      return false;
    }
    if (loginRequired && !form.login.trim()) return false;
    return true;
  }, [form, loginRequired]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<ConnectResponse>(`/crm/${provider}/connect`, {
        baseUrl: form.baseUrl.trim(),
        database: form.database.trim(),
        login: form.login.trim() || undefined,
        apiKey: form.apiKey.trim(),
        scope
      });
      if (!res) {
        setError({
          title: t('errors.unexpectedResponse'),
          body: t('errors.emptyResponse')
        });
        return;
      }
      if (res.ok) {
        toast.success(t('toasts.connected', { provider: meta.name }));
        setOpen(false);
        setForm({ baseUrl: '', database: '', login: '', apiKey: '' });
        onConnected();
        return;
      }
      const reason =
        res.reason in ODOO_VALIDATION_MESSAGES
          ? res.reason
          : 'unknown_odoo_error';
      const hint = t(`errors.reasons.${reason}`);
      setError({
        title: titleForReason(reason, t as TFunc),
        body: `${hint}${res.message ? ` — ${res.message}` : ''}`,
        field: res.field
      });
    } catch (err) {
      setError({
        title: t('errors.couldNotConnect'),
        body: err instanceof Error ? err.message : t('errors.unknown')
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size='sm'
          variant={alreadyConnected ? 'outline' : 'default'}
          className='w-full'
        >
          <Plus className='mr-1.5 h-3.5 w-3.5' />
          {alreadyConnected
            ? t('addAnother')
            : t('connect', { provider: meta.name })}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{t('connect', { provider: meta.name })}</DialogTitle>
          <DialogDescription>
            {provider === 'odoo_14_18'
              ? t('description.legacy')
              : t('description.modern')}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4 py-1'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={`${provider}-url`}>{t('fields.url')}</Label>
            <Input
              id={`${provider}-url`}
              placeholder='https://mycompany.odoo.com'
              value={form.baseUrl}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, baseUrl: e.target.value }))
              }
              aria-invalid={error?.field === 'baseUrl'}
            />
          </div>

          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={`${provider}-db`}>{t('fields.database')}</Label>
            <Input
              id={`${provider}-db`}
              placeholder='mycompany-main'
              value={form.database}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, database: e.target.value }))
              }
              aria-invalid={error?.field === 'database'}
            />
          </div>

          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={`${provider}-login`}>
              {loginRequired ? t('fields.login') : t('fields.loginOptional')}
            </Label>
            <Input
              id={`${provider}-login`}
              placeholder='sales@mycompany.com'
              value={form.login}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, login: e.target.value }))
              }
              aria-invalid={error?.field === 'login'}
            />
            {!loginRequired && (
              <p className='text-muted-foreground text-[11px]'>
                {t('fields.loginHint')}
              </p>
            )}
          </div>

          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={`${provider}-apikey`}>{t('fields.apiKey')}</Label>
            <Input
              id={`${provider}-apikey`}
              type='password'
              placeholder='Odoo API key'
              value={form.apiKey}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, apiKey: e.target.value }))
              }
              aria-invalid={error?.field === 'apiKey'}
            />
            <p className='text-muted-foreground text-[11px]'>
              {t('fields.apiKeyHintPrefix')}{' '}
              <strong>{t('fields.apiKeyHintPath')}</strong>.
            </p>
          </div>

          <div className='flex flex-col gap-2 pt-1'>
            <Label className='text-muted-foreground text-xs tracking-wide uppercase'>
              {t('workspace.title')}
            </Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as 'personal' | 'organization')}
              className='gap-2'
            >
              <Label
                htmlFor={`${provider}-scope-personal`}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  scope === 'personal' && 'border-primary bg-primary/5'
                )}
              >
                <RadioGroupItem
                  value='personal'
                  id={`${provider}-scope-personal`}
                />
                <div className='flex-1'>
                  <div className='flex items-center gap-2 text-sm font-medium'>
                    <User className='h-3.5 w-3.5' /> {t('workspace.personal')}
                  </div>
                  <p className='text-muted-foreground mt-0.5 text-xs'>
                    {t('workspace.personalHint')}
                  </p>
                </div>
              </Label>

              <Label
                htmlFor={`${provider}-scope-org`}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                  !organization && 'cursor-not-allowed opacity-50',
                  organization && 'cursor-pointer',
                  scope === 'organization' && 'border-primary bg-primary/5'
                )}
              >
                <RadioGroupItem
                  value='organization'
                  id={`${provider}-scope-org`}
                  disabled={!organization}
                />
                <div className='flex-1'>
                  <div className='flex items-center gap-2 text-sm font-medium'>
                    <Users className='h-3.5 w-3.5' />
                    {organization
                      ? organization.name
                      : t('workspace.orgNoTeam')}
                  </div>
                  <p className='text-muted-foreground mt-0.5 text-xs'>
                    {organization
                      ? t('workspace.orgHint')
                      : t('workspace.orgSwitchHint')}
                  </p>
                </div>
              </Label>
            </RadioGroup>
          </div>

          {error && (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>{error.body}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
          <Button disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting
              ? t('validating')
              : t('connect', { provider: meta.name })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TFunc = (key: string, values?: Record<string, unknown>) => string;

function titleForReason(reason: string, t: TFunc): string {
  return t(`errors.reasonTitles.${reason}`);
}
