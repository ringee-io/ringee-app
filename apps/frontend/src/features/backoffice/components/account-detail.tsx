'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { IconArrowLeft } from '@tabler/icons-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  useBackofficeApi,
  type AccountDetail as AccountDetailData,
  type AccountType,
  type NumberListItem,
  type PipelineType,
  type RecordingSettings,
  type UserGeneralSettings
} from '../api';
import {
  errorMessage,
  formatDate,
  formatMoney,
  formatNumber
} from '../lib/format';

export function AccountDetail({ type, id }: { type: AccountType; id: string }) {
  const api = useBackofficeApi();
  const [account, setAccount] = useState<AccountDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccount(await api.getAccount(type, id));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load account'));
    } finally {
      setLoading(false);
    }
  }, [api, type, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !account) {
    return <p className='text-muted-foreground p-6 text-sm'>Loading…</p>;
  }
  if (!account) {
    return (
      <p className='text-muted-foreground p-6 text-sm'>Account not found.</p>
    );
  }

  return (
    <div className='space-y-4 sm:space-y-6'>
      <div className='space-y-2'>
        <Link
          href='/backoffice/accounts'
          className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm'
        >
          <IconArrowLeft className='size-4' /> Back to accounts
        </Link>
        <div className='flex flex-wrap items-center gap-3'>
          <h1 className='min-w-0 text-xl font-semibold break-words sm:text-2xl'>
            {account.name}
          </h1>
          <Badge variant='secondary'>
            {account.type === 'user' ? 'User' : 'Organization'}
          </Badge>
        </div>
        <p className='text-muted-foreground text-sm break-words'>
          {account.email || account.slug || account.id} ·{' '}
          {formatNumber(account.callsCount)} calls · joined{' '}
          {formatDate(account.createdAt)}
        </p>
      </div>

      <div className='grid gap-4 sm:gap-6 lg:grid-cols-2'>
        <CreditCard
          type={type}
          id={id}
          balance={account.creditBalance}
          onUpdated={(balance) =>
            setAccount((a) => (a ? { ...a, creditBalance: balance } : a))
          }
        />
        {account.userSettings && (
          <GeneralSettingsCard
            type={type}
            id={id}
            settings={account.userSettings}
            onUpdated={(userSettings) =>
              setAccount((a) => (a ? { ...a, userSettings } : a))
            }
          />
        )}
        <RecordingCard
          type={type}
          id={id}
          settings={account}
          onUpdated={(s) => setAccount((a) => (a ? { ...a, ...s } : a))}
        />
        <AiPipelineCard
          type={type}
          id={id}
          account={account}
          onChanged={load}
        />
        <NumbersCard type={type} id={id} account={account} onChanged={load} />
      </div>
    </div>
  );
}

// ── General user settings ───────────────────────────────────

function GeneralSettingsCard({
  type,
  id,
  settings,
  onUpdated
}: {
  type: AccountType;
  id: string;
  settings: UserGeneralSettings;
  onUpdated: (settings: UserGeneralSettings) => void;
}) {
  const api = useBackofficeApi();
  const [canCall, setCanCall] = useState(settings.canCall);
  const [freeCallTrial, setFreeCallTrial] = useState(settings.freeCallTrial);
  const [phoneRequired, setPhoneRequired] = useState(settings.phoneRequired);
  const [minimumCreditPurchase, setMinimumCreditPurchase] = useState(
    settings.minimumCreditPurchase.toString()
  );
  const [numberPurchaseLimit, setNumberPurchaseLimit] = useState(
    settings.numberPurchaseLimit?.toString() ?? ''
  );
  const [savingLimits, setSavingLimits] = useState(false);
  const [savingToggle, setSavingToggle] = useState<
    'canCall' | 'freeCallTrial' | 'phoneRequired' | null
  >(null);

  useEffect(() => {
    setCanCall(settings.canCall);
    setFreeCallTrial(settings.freeCallTrial);
    setPhoneRequired(settings.phoneRequired);
  }, [settings.canCall, settings.freeCallTrial, settings.phoneRequired]);

  useEffect(() => {
    setMinimumCreditPurchase(settings.minimumCreditPurchase.toString());
    setNumberPurchaseLimit(settings.numberPurchaseLimit?.toString() ?? '');
  }, [settings.minimumCreditPurchase, settings.numberPurchaseLimit]);

  const toggleSetting = async (
    key: 'canCall' | 'freeCallTrial' | 'phoneRequired',
    value: boolean
  ) => {
    const setLocal =
      key === 'canCall'
        ? setCanCall
        : key === 'freeCallTrial'
          ? setFreeCallTrial
          : setPhoneRequired;
    const previous =
      key === 'canCall'
        ? canCall
        : key === 'freeCallTrial'
          ? freeCallTrial
          : phoneRequired;
    setLocal(value);
    setSavingToggle(key);
    try {
      const updated = await api.updateUserGeneralSettings(type, id, {
        [key]: value
      });
      onUpdated(updated);
      toast.success(
        key === 'phoneRequired'
          ? value
            ? 'Phone verification required'
            : 'Phone verification waived'
          : key === 'canCall'
            ? value
              ? 'Calling enabled'
              : 'Calling disabled'
            : value
              ? 'Free trial call enabled'
              : 'Free trial call disabled'
      );
    } catch (err) {
      setLocal(previous);
      toast.error(errorMessage(err, 'Failed to update setting'));
    } finally {
      setSavingToggle(null);
    }
  };

  const saveLimits = async () => {
    const minimum = Number(minimumCreditPurchase);
    const limit =
      numberPurchaseLimit === '' ? null : Number(numberPurchaseLimit);
    if (!Number.isFinite(minimum) || minimum < 0.5 || minimum > 2000) {
      toast.error('Minimum credit purchase must be between $0.50 and $2,000');
      return;
    }
    if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
      toast.error('Number purchase limit must be a whole number');
      return;
    }

    setSavingLimits(true);
    try {
      const updated = await api.updateUserGeneralSettings(type, id, {
        minimumCreditPurchase: minimum,
        numberPurchaseLimit: limit
      });
      onUpdated(updated);
      toast.success('General settings updated');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update general settings'));
    } finally {
      setSavingLimits(false);
    }
  };

  return (
    <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='px-4 sm:px-6'>
        <CardTitle>General settings</CardTitle>
        <CardDescription>
          Calling and purchasing controls for this user.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5 px-4 sm:px-6'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <Label>Can place calls</Label>
            <p className='text-muted-foreground text-xs'>
              Disable to block every outbound call for this user.
            </p>
          </div>
          <Switch
            checked={canCall}
            disabled={savingToggle !== null}
            onCheckedChange={(value) => toggleSetting('canCall', value)}
          />
        </div>

        <div className='flex items-center justify-between gap-4'>
          <div>
            <Label>Free trial call</Label>
            <p className='text-muted-foreground text-xs'>
              Grants the existing one-time free call trial.
            </p>
          </div>
          <Switch
            checked={freeCallTrial}
            disabled={savingToggle !== null}
            onCheckedChange={(value) => toggleSetting('freeCallTrial', value)}
          />
        </div>

        <div className='flex items-center justify-between gap-4'>
          <div>
            <Label>Require verified phone</Label>
            <p className='text-muted-foreground text-xs'>
              Turn off after reviewing the user&apos;s case in Crisp when SMS
              verification is unavailable in their country.
            </p>
          </div>
          <Switch
            checked={phoneRequired}
            disabled={savingToggle !== null}
            onCheckedChange={(value) => toggleSetting('phoneRequired', value)}
          />
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-1'>
            <Label htmlFor='minimum-credit-purchase'>
              Minimum credit purchase (USD)
            </Label>
            <Input
              id='minimum-credit-purchase'
              type='number'
              min='0.5'
              max='2000'
              step='0.01'
              placeholder='5.00'
              required
              value={minimumCreditPurchase}
              onChange={(e) => setMinimumCreditPurchase(e.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              Defaults to $5 and can be customized for this user.
            </p>
          </div>
          <div className='space-y-1'>
            <Label htmlFor='number-purchase-limit'>Number purchase limit</Label>
            <Input
              id='number-purchase-limit'
              type='number'
              min='0'
              step='1'
              placeholder='Unlimited'
              value={numberPurchaseLimit}
              onChange={(e) => setNumberPurchaseLimit(e.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              Leave blank for unlimited purchases.
            </p>
          </div>
        </div>

        <Button
          className='w-full sm:w-auto'
          onClick={saveLimits}
          disabled={savingLimits}
        >
          {savingLimits ? 'Saving…' : 'Save limits'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Credit ───────────────────────────────────────────────────

function CreditCard({
  type,
  id,
  balance,
  onUpdated
}: {
  type: AccountType;
  id: string;
  balance: number;
  onUpdated: (balance: number) => void;
}) {
  const api = useBackofficeApi();
  const [mode, setMode] = useState<'set' | 'adjust'>('set');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const apply = async () => {
    const value = Number(amount);
    if (Number.isNaN(value)) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      const res = await api.setCredit(type, id, { mode, amount: value });
      onUpdated(res.balance);
      setAmount('');
      toast.success(`Balance updated to ${formatMoney(res.balance)}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update credit'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='px-4 sm:px-6'>
        <CardTitle>Credit</CardTitle>
        <CardDescription>
          Current balance:{' '}
          <span className='text-foreground font-semibold'>
            {formatMoney(balance)}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4 px-4 sm:px-6'>
        <div className='grid grid-cols-2 gap-2'>
          <Button
            size='sm'
            variant={mode === 'set' ? 'default' : 'outline'}
            onClick={() => setMode('set')}
          >
            Set balance
          </Button>
          <Button
            size='sm'
            variant={mode === 'adjust' ? 'default' : 'outline'}
            onClick={() => setMode('adjust')}
          >
            Adjust (+/−)
          </Button>
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
          <div className='flex-1 space-y-1'>
            <Label htmlFor='credit-amount'>
              {mode === 'set' ? 'New balance' : 'Amount to add/subtract'}
            </Label>
            <Input
              id='credit-amount'
              type='number'
              step='0.01'
              placeholder={mode === 'set' ? '0.00' : 'e.g. 50 or -10'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button
            className='w-full sm:w-auto'
            onClick={apply}
            disabled={saving || amount === ''}
          >
            {saving ? 'Saving…' : 'Apply'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Recording settings ───────────────────────────────────────

const RECORDING_FIELDS: {
  key: keyof RecordingSettings;
  label: string;
  description: string;
}[] = [
  {
    key: 'recordAllCalls',
    label: 'Record all calls',
    description: 'Automatically record every call.'
  },
  {
    key: 'transcribeRealtime',
    label: 'Transcribe in real time',
    description: 'Live transcription during the call.'
  },
  {
    key: 'transcribeRecordings',
    label: 'Transcribe all recordings',
    description: 'Transcribe stored recordings once available.'
  }
];

function RecordingCard({
  type,
  id,
  settings,
  onUpdated
}: {
  type: AccountType;
  id: string;
  settings: RecordingSettings;
  onUpdated: (s: RecordingSettings) => void;
}) {
  const api = useBackofficeApi();
  const [saving, setSaving] = useState<keyof RecordingSettings | null>(null);

  const toggle = async (key: keyof RecordingSettings, value: boolean) => {
    setSaving(key);
    try {
      const res = await api.updateRecordingSettings(type, id, { [key]: value });
      onUpdated(res);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update settings'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='px-4 sm:px-6'>
        <CardTitle>Recording &amp; transcription</CardTitle>
        <CardDescription>Global call recording settings.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4 px-4 sm:px-6'>
        {RECORDING_FIELDS.map((f) => (
          <div key={f.key} className='flex items-center justify-between gap-4'>
            <div>
              <Label>{f.label}</Label>
              <p className='text-muted-foreground text-xs'>{f.description}</p>
            </div>
            <Switch
              checked={settings[f.key]}
              disabled={saving === f.key}
              onCheckedChange={(v) => toggle(f.key, v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── AI pipeline ──────────────────────────────────────────────

function AiPipelineCard({
  type,
  id,
  account,
  onChanged
}: {
  type: AccountType;
  id: string;
  account: AccountDetailData;
  onChanged: () => void;
}) {
  const api = useBackofficeApi();
  const [busy, setBusy] = useState(false);

  const allEnabled =
    account.pipelines.length > 0 && account.pipelines.every((p) => p.enabled);

  const setAll = async (enabled: boolean) => {
    setBusy(true);
    try {
      await api.setAiPipeline(type, id, { enabled });
      toast.success(enabled ? 'AI pipeline enabled' : 'AI pipeline disabled');
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update AI pipeline'));
    } finally {
      setBusy(false);
    }
  };

  const setOne = async (pipelineType: PipelineType, enabled: boolean) => {
    setBusy(true);
    try {
      await api.setAiPipeline(type, id, { enabled, pipelineType });
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update pipeline'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='px-4 sm:px-6'>
        <CardTitle>AI pipeline</CardTitle>
        <CardDescription>
          Enable AI analysis for this {type === 'org' ? 'organization' : 'user'}
          .
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4 px-4 sm:px-6'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <Label>All pipelines</Label>
            <p className='text-muted-foreground text-xs'>
              Master switch for every pipeline.
            </p>
          </div>
          <Switch
            checked={allEnabled}
            disabled={busy}
            onCheckedChange={setAll}
          />
        </div>

        <div className='space-y-3 border-t pt-3'>
          {account.pipelines.map((p) => (
            <div
              key={p.type}
              className='flex items-center justify-between gap-4'
            >
              <div>
                <Label>{p.name}</Label>
                {!p.implemented && (
                  <span className='text-muted-foreground ml-2 text-[10px] tracking-wide uppercase'>
                    coming soon
                  </span>
                )}
              </div>
              <Switch
                checked={p.enabled}
                disabled={busy}
                onCheckedChange={(v) => setOne(p.type, v)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Numbers ──────────────────────────────────────────────────

function NumbersCard({
  type,
  id,
  account,
  onChanged
}: {
  type: AccountType;
  id: string;
  account: AccountDetailData;
  onChanged: () => void;
}) {
  const api = useBackofficeApi();
  const [busy, setBusy] = useState(false);

  const unassign = async (numberId: string) => {
    setBusy(true);
    try {
      await api.unassignNumber(type, id, numberId);
      toast.success('Number unassigned');
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to unassign number'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='flex flex-col items-start gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
        <div>
          <CardTitle>Numbers</CardTitle>
          <CardDescription>Assigned phone numbers.</CardDescription>
        </div>
        <AssignNumberDialog type={type} id={id} onAssigned={onChanged} />
      </CardHeader>
      <CardContent className='px-4 sm:px-6'>
        {account.numbers.length === 0 ? (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            No numbers assigned.
          </p>
        ) : (
          <ul className='divide-y'>
            {account.numbers.map((n) => (
              <li
                key={n.id}
                className='flex flex-col items-start gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-2'
              >
                <div>
                  <span className='font-medium'>{n.phoneNumber}</span>
                  <span className='text-muted-foreground ml-2 text-xs uppercase'>
                    {n.isoCountry}
                  </span>
                </div>
                <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end'>
                  {n.status && (
                    <Badge variant='outline' className='text-xs'>
                      {n.status}
                    </Badge>
                  )}
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={() => unassign(n.id)}
                  >
                    Unassign
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AssignNumberDialog({
  type,
  id,
  onAssigned
}: {
  type: AccountType;
  id: string;
  onAssigned: () => void;
}) {
  const api = useBackofficeApi();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [numbers, setNumbers] = useState<NumberListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNumbers(
        await api.listNumbers({
          status: 'available',
          search: search.trim() || undefined
        })
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load numbers'));
    } finally {
      setLoading(false);
    }
  }, [api, search]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [open, load]);

  const assign = async (numberId: string) => {
    setAssigning(numberId);
    try {
      await api.assignNumber(type, id, numberId);
      toast.success('Number assigned');
      setOpen(false);
      onAssigned();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to assign number'));
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm'>Assign number</Button>
      </DialogTrigger>
      <DialogContent className='max-h-[calc(100dvh-2rem)] p-4 sm:p-6'>
        <DialogHeader>
          <DialogTitle>Assign an available number</DialogTitle>
        </DialogHeader>
        <Input
          placeholder='Search by phone number…'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className='max-h-72 overflow-y-auto'>
          {loading ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              Loading…
            </p>
          ) : numbers.length === 0 ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              No available numbers.
            </p>
          ) : (
            <ul className='divide-y'>
              {numbers.map((n) => (
                <li
                  key={n.id}
                  className='flex flex-col items-start gap-2 py-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between min-[400px]:gap-4 min-[400px]:py-2'
                >
                  <div>
                    <span className='font-medium'>{n.phoneNumber}</span>
                    <span className='text-muted-foreground ml-2 text-xs uppercase'>
                      {n.isoCountry}
                    </span>
                  </div>
                  <Button
                    size='sm'
                    disabled={assigning === n.id}
                    onClick={() => assign(n.id)}
                  >
                    {assigning === n.id ? 'Assigning…' : 'Assign'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
