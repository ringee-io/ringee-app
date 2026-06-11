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
          title: 'Unexpected response',
          body: 'Empty response from server.'
        });
        return;
      }
      if (res.ok) {
        toast.success(`${meta.name} connected`);
        setOpen(false);
        setForm({ baseUrl: '', database: '', login: '', apiKey: '' });
        onConnected();
        return;
      }
      const hint =
        ODOO_VALIDATION_MESSAGES[res.reason] ??
        ODOO_VALIDATION_MESSAGES.unknown_odoo_error;
      setError({
        title: titleForReason(res.reason),
        body: `${hint}${res.message ? ` — ${res.message}` : ''}`,
        field: res.field
      });
    } catch (err) {
      setError({
        title: 'Could not connect',
        body: err instanceof Error ? err.message : 'Unknown error'
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
          {alreadyConnected ? 'Add another' : `Connect ${meta.name}`}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>Connect {meta.name}</DialogTitle>
          <DialogDescription>
            {provider === 'odoo_14_18'
              ? "Uses Odoo's legacy RPC compatibility. Compatible with versions 14 through 18."
              : "Uses Odoo's modern JSON-2 API. Available from version 19."}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4 py-1'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={`${provider}-url`}>Odoo URL</Label>
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
            <Label htmlFor={`${provider}-db`}>Database name</Label>
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
              Login / Email {loginRequired ? '' : '(optional)'}
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
                Only needed for owner mapping on leads/activities.
              </p>
            )}
          </div>

          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={`${provider}-apikey`}>API key</Label>
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
              Generate one from{' '}
              <strong>
                Odoo &rarr; Preferences &rarr; Account Security &rarr; New API
                Key
              </strong>
              .
            </p>
          </div>

          <div className='flex flex-col gap-2 pt-1'>
            <Label className='text-muted-foreground text-xs tracking-wide uppercase'>
              Workspace
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
                    <User className='h-3.5 w-3.5' /> Personal workspace
                  </div>
                  <p className='text-muted-foreground mt-0.5 text-xs'>
                    Only your calls are logged. Your credentials stay on your
                    account.
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
                      : 'Organization (no active team)'}
                  </div>
                  <p className='text-muted-foreground mt-0.5 text-xs'>
                    {organization
                      ? 'All teammates in this org share this connection.'
                      : 'Switch to an organization from the top-left to enable org-level sync.'}
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
            Cancel
          </Button>
          <Button disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting ? 'Validating…' : `Connect ${meta.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function titleForReason(reason: string): string {
  switch (reason) {
    case 'invalid_credentials':
      return 'Invalid credentials';
    case 'database_not_found':
      return 'Database not found';
    case 'invalid_base_url':
      return 'URL unreachable';
    case 'unsupported_version':
      return 'Unsupported Odoo version';
    case 'api_mode_not_available':
      return 'API mode not available';
    case 'crm_module_missing':
      return 'CRM module not installed';
    case 'insufficient_permissions':
      return 'Insufficient permissions';
    case 'partner_access_denied':
      return 'Partner access denied';
    case 'activity_access_denied':
      return 'Activity access denied';
    default:
      return 'Could not connect';
  }
}
