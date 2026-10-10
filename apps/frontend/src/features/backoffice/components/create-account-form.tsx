'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCopy
} from '@tabler/icons-react';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { useBackofficeApi, type CreatedAccount } from '../api';
import { errorMessage } from '../lib/format';

const CC_EMAIL = 'edison@getringee.com';

const EMPTY = { firstName: '', lastName: '', email: '' };

type Fields = typeof EMPTY;

/**
 * Create a login from a name and an email (LIFE-005). The server generates
 * the password and emails the credentials with the team in cc; the password
 * comes back here only when that email could not be sent.
 */
export function CreateAccountForm() {
  const api = useBackofficeApi();
  const [form, setForm] = useState<Fields>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    account: CreatedAccount;
  } | null>(null);

  const set = (key: keyof Fields, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const canSubmit =
    !!form.firstName.trim() &&
    !!form.lastName.trim() &&
    /^\S+@\S+\.\S+$/.test(form.email.trim());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const account = await api.createAccount({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim()
      });
      setCreated({
        name: `${form.firstName.trim()} ${form.lastName.trim()}`,
        account
      });
      setForm(EMPTY);
      if (account.emailSent) toast.success('Account created.');
      else toast.warning('Account created, but the email was not sent.');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not create the account.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='mx-auto max-w-xl space-y-4 sm:space-y-6'>
      <div>
        <h1 className='text-xl font-semibold sm:text-2xl'>New account</h1>
        <p className='text-muted-foreground text-sm'>
          Creates the login with a generated password and emails the credentials
          to the person, with {CC_EMAIL} in cc.
        </p>
      </div>

      {created ? (
        <CreatedNotice name={created.name} account={created.account} />
      ) : null}

      <Card>
        <CardContent>
          <form onSubmit={submit} className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='grid gap-1.5'>
                <Label htmlFor='account-first-name'>First name</Label>
                <Input
                  id='account-first-name'
                  autoComplete='off'
                  value={form.firstName}
                  onChange={(event) => set('firstName', event.target.value)}
                />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='account-last-name'>Last name</Label>
                <Input
                  id='account-last-name'
                  autoComplete='off'
                  value={form.lastName}
                  onChange={(event) => set('lastName', event.target.value)}
                />
              </div>
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='account-email'>Email</Label>
              <Input
                id='account-email'
                type='email'
                autoComplete='off'
                placeholder='jane@acme.com'
                value={form.email}
                onChange={(event) => set('email', event.target.value)}
              />
            </div>
            <Button
              type='submit'
              disabled={!canSubmit || saving}
              className='w-full sm:w-auto'
            >
              {saving ? 'Creating…' : 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function CreatedNotice({
  name,
  account
}: {
  name: string;
  account: CreatedAccount;
}) {
  const openAccount = account.userId ? (
    <Link
      href={`/backoffice/accounts/user/${account.userId}`}
      className='text-primary underline-offset-4 hover:underline'
    >
      Open account
    </Link>
  ) : null;

  if (account.emailSent || !account.temporaryPassword) {
    return (
      <Alert>
        <IconCircleCheck className='text-emerald-600' />
        <AlertTitle>Account created for {name}</AlertTitle>
        <AlertDescription>
          <p>
            Credentials emailed to {account.email} (cc {CC_EMAIL}).
          </p>
          {openAccount}
        </AlertDescription>
      </Alert>
    );
  }

  const password = account.temporaryPassword;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Email: ${account.email}\nTemporary password: ${password}`
      );
      toast.success('Credentials copied.');
    } catch {
      toast.error('Could not copy. Select the text instead.');
    }
  };

  return (
    <Alert variant='destructive'>
      <IconAlertTriangle />
      <AlertTitle>Account created, but the email was not sent</AlertTitle>
      <AlertDescription>
        <p>Send {name} these credentials yourself:</p>
        <div className='bg-muted text-foreground w-full rounded-md px-3 py-2 font-mono text-sm break-all select-all'>
          <div>Email: {account.email}</div>
          <div>Temporary password: {password}</div>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          <Button type='button' size='sm' variant='outline' onClick={copy}>
            <IconCopy className='size-4' />
            Copy
          </Button>
          {openAccount}
        </div>
      </AlertDescription>
    </Alert>
  );
}
