'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  MAX_NUMBERS_PER_REGISTRATION,
  useBackofficeApi,
  type NumberRegistrationResult
} from '../api';
import { errorMessage } from '../lib/format';
import { AccountPicker, type PickedAccount } from './account-picker';
import { RegistrationResults } from './registration-results';

/** One number per line; commas and semicolons separate too. */
function splitNumbers(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Register numbers in Ringee — its own records only: nothing is bought or
 * changed in Telnyx — and optionally assign them to an account right away.
 */
export function AddNumbersDialog({ onAdded }: { onAdded: () => void }) {
  const api = useBackofficeApi();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [assign, setAssign] = useState(false);
  const [account, setAccount] = useState<PickedAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<NumberRegistrationResult[] | null>(
    null
  );

  const entries = useMemo(() => splitNumbers(text), [text]);
  const tooMany = entries.length > MAX_NUMBERS_PER_REGISTRATION;
  const target = assign ? account : null;
  const canSubmit =
    entries.length > 0 && !tooMany && (!assign || !!account) && !saving;
  const submitLabel =
    entries.length === 0
      ? 'Add numbers'
      : `Add ${entries.length} number${entries.length === 1 ? '' : 's'}`;

  const reset = () => {
    setText('');
    setAssign(false);
    setAccount(null);
    setResults(null);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const res = await api.registerNumbers({
        phoneNumbers: entries,
        ...(target ? { accountType: target.type, accountId: target.id } : {})
      });
      setResults(res.results);
      if (res.results.some((r) => r.numberId)) onAdded();
      const failed = res.results.filter(
        (r) => r.outcome === 'failed' || r.error
      ).length;
      if (failed === 0) toast.success('Numbers saved.');
      else toast.warning(`${failed} of ${res.results.length} need attention.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add the numbers'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className='w-full sm:w-auto'>
          <IconPlus className='size-4' />
          Add numbers
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-lg sm:p-6'>
        <DialogHeader>
          <DialogTitle>Add numbers</DialogTitle>
          <DialogDescription>
            Registers the numbers in Ringee only. Nothing is bought or changed
            in Telnyx, so add numbers that already work there.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <RegistrationResults results={results} account={target} />
        ) : (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='register-numbers'>Phone numbers</Label>
              <Textarea
                id='register-numbers'
                rows={5}
                value={text}
                disabled={saving}
                placeholder={'+13055550101\n+18095550123'}
                className='font-mono'
                onChange={(e) => setText(e.target.value)}
              />
              <p
                className={
                  tooMany
                    ? 'text-destructive text-xs'
                    : 'text-muted-foreground text-xs'
                }
              >
                One per line, with + and the country code. Up to{' '}
                {MAX_NUMBERS_PER_REGISTRATION} at a time
                {entries.length > 0 ? ` — ${entries.length} entered` : ''}.
              </p>
            </div>

            <div className='space-y-3'>
              <div className='flex items-center justify-between gap-3'>
                <Label htmlFor='register-assign'>Assign to an account</Label>
                <Switch
                  id='register-assign'
                  checked={assign}
                  disabled={saving}
                  onCheckedChange={setAssign}
                />
              </div>
              {assign ? (
                <AccountPicker
                  value={account}
                  onChange={setAccount}
                  disabled={saving}
                />
              ) : (
                <p className='text-muted-foreground text-xs'>
                  Off: the numbers stay available to assign later.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {results ? (
            <>
              <Button variant='outline' onClick={reset}>
                Add more
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </>
          ) : (
            <Button disabled={!canSubmit} onClick={submit}>
              {saving ? 'Saving…' : submitLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
