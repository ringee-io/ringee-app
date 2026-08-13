'use client';

import { useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { CustomIntegrationWithSecrets } from '../types/custom-integrations';
import { useCustomIntegrations } from '../hooks/use-custom-integrations';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: CustomIntegrationWithSecrets) => void;
}

export function CustomIntegrationCreateDialog({
  open,
  onOpenChange,
  onCreated
}: Props) {
  const { create } = useCustomIntegrations();
  const t = useTranslations('integrations.custom.create');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CustomIntegrationWithSecrets | null>(
    null
  );

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('nameRequired'));
      return;
    }
    setCreating(true);
    try {
      const item = await create(name.trim());
      setResult(item);
      onCreated(item);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error'));
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(o) : handleClose())}
    >
      <DialogContent className='sm:max-w-lg'>
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('title')}</DialogTitle>
              <DialogDescription>{t('description')}</DialogDescription>
            </DialogHeader>
            <div className='space-y-2 py-2'>
              <Label htmlFor='ci-name'>{t('name')}</Label>
              <Input
                id='ci-name'
                value={name}
                placeholder={t('namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant='ghost' onClick={handleClose} disabled={creating}>
                {t('cancel')}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !name.trim()}
              >
                {creating ? t('creating') : t('submit')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <SecretsReveal item={result} onDone={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SecretsReveal({
  item,
  onDone
}: {
  item: CustomIntegrationWithSecrets;
  onDone: () => void;
}) {
  const t = useTranslations('integrations.custom.create.reveal');
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription className='flex gap-1.5'>
          <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
          <span>
            {t.rich('warning', {
              strong: (chunks) => <strong>{chunks}</strong>
            })}
          </span>
        </DialogDescription>
      </DialogHeader>
      <div className='space-y-4 py-2'>
        <CopyableSecret label={t('apiKey')} value={item.apiKey ?? ''} />
        <CopyableSecret
          label={t('signingSecret')}
          value={item.signingSecret ?? ''}
        />
      </div>
      <DialogFooter>
        <Button onClick={onDone}>{t('done')}</Button>
      </DialogFooter>
    </>
  );
}

function CopyableSecret({ label, value }: { label: string; value: string }) {
  const t = useTranslations('integrations.custom.create.reveal');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(t('copied'));
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className='space-y-1.5'>
      <Label className='text-muted-foreground text-xs tracking-wide uppercase'>
        {label}
      </Label>
      <div className='bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2'>
        <code className='flex-1 truncate font-mono text-xs'>{value}</code>
        <Button size='icon' variant='ghost' className='h-7 w-7' onClick={copy}>
          {copied ? (
            <Check className='h-3.5 w-3.5' />
          ) : (
            <Copy className='h-3.5 w-3.5' />
          )}
        </Button>
      </div>
    </div>
  );
}
