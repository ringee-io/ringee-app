'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { Form } from '@ringee/frontend-shared/components/ui/form';
import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { useBackofficeApi, type CreatedAccount } from '../api';
import { errorMessage } from '../lib/format';

const CC_EMAIL = 'edison@getringee.com';

/** The limits `CreateAccountDto` enforces on the server. */
const NAME_MAX = 100;
const EMAIL_MAX = 255;

const schema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required.')
    .max(NAME_MAX, `Use ${NAME_MAX} characters or fewer.`),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required.')
    .max(NAME_MAX, `Use ${NAME_MAX} characters or fewer.`),
  email: z
    .string()
    .trim()
    .max(EMAIL_MAX, `Use ${EMAIL_MAX} characters or fewer.`)
    .email('Enter a valid email address.')
});

type Fields = z.infer<typeof schema>;

const EMPTY: Fields = { firstName: '', lastName: '', email: '' };

/**
 * Create a login from a name and an email (LIFE-005). The server generates
 * the password and emails the credentials with the team in cc; the password
 * comes back here only when that email could not be sent.
 */
export function CreateAccountForm() {
  const api = useBackofficeApi();
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY
  });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    account: CreatedAccount;
  } | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const account = await api.createAccount(values);
      setCreated({ name: `${values.firstName} ${values.lastName}`, account });
      form.reset(EMPTY);
      if (account.emailSent) toast.success('Account created.');
      else toast.warning('Account created, but the email was not sent.');
    } catch (error) {
      const message = errorMessage(error, 'Could not create the account.');
      // The email already has a login: say so on the field that caused it.
      if (error instanceof ApiError && error.status === 409) {
        form.setError('email', { message });
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  });

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
          <Form form={form} onSubmit={submit} className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormInput
                control={form.control}
                name='firstName'
                label='First name'
                required
              />
              <FormInput
                control={form.control}
                name='lastName'
                label='Last name'
                required
              />
            </div>
            <FormInput
              control={form.control}
              name='email'
              type='email'
              label='Email'
              placeholder='jane@acme.com'
              required
            />
            <Button
              type='submit'
              disabled={saving}
              className='w-full sm:w-auto'
            >
              {saving ? 'Creating…' : 'Create account'}
            </Button>
          </Form>
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
