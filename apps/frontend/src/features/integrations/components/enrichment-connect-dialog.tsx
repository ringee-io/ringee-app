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
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useEnrichmentMutations } from '../hooks/use-enrichment-connections';
import {
  ENRICHMENT_PROVIDER_META,
  type EnrichmentProviderType
} from '../types/enrichment';

interface Props {
  provider: EnrichmentProviderType;
  alreadyConnected: boolean;
  onConnected: () => void;
}

export function EnrichmentConnectDialog({
  provider,
  alreadyConnected,
  onConnected
}: Props) {
  const meta = ENRICHMENT_PROVIDER_META[provider];
  const { validate, connect } = useEnrichmentMutations();

  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tested, setTested] = useState<{ accountName: string | null } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!apiKey.trim()) return;
    setValidating(true);
    setError(null);
    setTested(null);
    try {
      const r = await validate(provider, apiKey.trim());
      setTested({ accountName: r.accountName });
      toast.success(
        `API key valid${r.accountName ? ` — ${r.accountName}` : ''}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate');
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!apiKey.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await connect(provider, apiKey.trim());
      toast.success(`${meta.name} connected`);
      setApiKey('');
      setTested(null);
      setOpen(false);
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm' variant={alreadyConnected ? 'outline' : 'default'}>
          {alreadyConnected ? (
            'Reconnect'
          ) : (
            <>
              <Plus className='mr-1 h-4 w-4' /> Connect
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <KeyRound className='h-5 w-5' />
            Connect {meta.name}
          </DialogTitle>
          <DialogDescription>
            Paste your {meta.name} API key. We&apos;ll encrypt it before
            storing.{' '}
            <a
              className='underline'
              href={meta.docsUrl}
              target='_blank'
              rel='noreferrer'
            >
              Find your key
            </a>
            .
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label htmlFor='apiKey'>API key</Label>
            <Input
              id='apiKey'
              type='password'
              autoComplete='off'
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTested(null);
              }}
              placeholder='••••••••••••'
            />
          </div>
          {error && (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>Could not validate</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {tested && (
            <Alert>
              <CheckCircle2 className='h-4 w-4 text-green-600' />
              <AlertTitle>Looks good</AlertTitle>
              <AlertDescription>
                {tested.accountName ??
                  'Account validated. Click Save to store the key.'}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className='flex gap-2 sm:justify-between'>
          <Button
            variant='ghost'
            disabled={!apiKey.trim() || validating || submitting}
            onClick={handleTest}
          >
            {validating ? (
              <Loader2 className='mr-1 h-4 w-4 animate-spin' />
            ) : null}
            Test connection
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!apiKey.trim() || submitting}
          >
            {submitting ? (
              <Loader2 className='mr-1 h-4 w-4 animate-spin' />
            ) : null}
            Save & connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
