'use client';

import { useEffect, useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { toast } from 'sonner';
import { Pencil, X, Check, UserCircle2 } from 'lucide-react';

type ContactPayload = {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber: string;
  organization?: string | null;
  company?: string | null;
  jobTitle?: string | null;
};

type FormState = {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phoneNumber: string;
  organization: string;
  jobTitle: string;
};

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  name: '',
  email: '',
  phoneNumber: '',
  organization: '',
  jobTitle: ''
};

function toForm(c: ContactPayload | null): FormState {
  if (!c) return emptyForm;
  return {
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    name: c.name ?? '',
    email: c.email ?? '',
    phoneNumber: c.phoneNumber ?? '',
    organization: c.organization ?? c.company ?? '',
    jobTitle: c.jobTitle ?? ''
  };
}

export function InCallContactInfo({ contactId }: { contactId: string }) {
  const api = useApi();
  const [contact, setContact] = useState<ContactPayload | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<ContactPayload>(`/contacts/${contactId}`)
      .then((c) => {
        if (!active) return;
        setContact(c);
        setForm(toForm(c));
      })
      .catch(() => {
        if (active) toast.error('No se pudo cargar el contacto');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, contactId]);

  const setField = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    if (!form.phoneNumber || form.phoneNumber.length < 5) {
      toast.error('El número de teléfono es requerido');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        name:
          form.name ||
          [form.firstName, form.lastName].filter(Boolean).join(' ') ||
          undefined
      };
      const updated = await api.put<ContactPayload>(
        `/contacts/${contactId}`,
        payload
      );
      setContact(updated);
      setForm(toForm(updated));
      setEditing(false);
      toast.success('Contacto actualizado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setForm(toForm(contact));
    setEditing(false);
  }

  if (loading) {
    return (
      <div className='space-y-3 p-4 md:p-6'>
        <Skeleton className='h-6 w-40' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6 text-center'>
        <UserCircle2 className='text-muted-foreground mb-2 h-8 w-8' />
        <p className='text-muted-foreground text-sm'>
          No se encontró información del contacto.
        </p>
      </div>
    );
  }

  const displayName =
    contact.name ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    contact.phoneNumber;

  return (
    <ScrollArea className='h-full'>
      <div className='flex flex-col gap-4 p-4 md:p-6'>
        <div className='flex items-center justify-between'>
          <div>
            <h3 className='text-base md:text-lg font-bold'>{displayName}</h3>
            <p className='text-muted-foreground text-xs'>
              {contact.phoneNumber}
            </p>
          </div>
          {editing ? (
            <div className='flex gap-1'>
              <Button
                size='sm'
                variant='ghost'
                onClick={handleCancel}
                disabled={saving}
              >
                <X className='mr-1 h-4 w-4' />
                Cancelar
              </Button>
              <Button size='sm' onClick={handleSave} disabled={saving}>
                <Check className='mr-1 h-4 w-4' />
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          ) : (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setEditing(true)}
            >
              <Pencil className='mr-1 h-4 w-4' />
              Editar
            </Button>
          )}
        </div>

        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <Field
            label='Nombre'
            value={form.firstName}
            onChange={setField('firstName')}
            disabled={!editing}
          />
          <Field
            label='Apellido'
            value={form.lastName}
            onChange={setField('lastName')}
            disabled={!editing}
          />
        </div>

        <Field
          label='Nombre a mostrar'
          value={form.name}
          onChange={setField('name')}
          disabled={!editing}
          placeholder='Auto-generado desde nombre y apellido'
        />

        <Field
          label='Email'
          value={form.email}
          onChange={setField('email')}
          disabled={!editing}
          type='email'
        />

        <Field
          label='Teléfono'
          value={form.phoneNumber}
          onChange={setField('phoneNumber')}
          disabled={!editing}
        />

        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <Field
            label='Empresa'
            value={form.organization}
            onChange={setField('organization')}
            disabled={!editing}
          />
          <Field
            label='Puesto'
            value={form.jobTitle}
            onChange={setField('jobTitle')}
            disabled={!editing}
          />
        </div>
      </div>
    </ScrollArea>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className='space-y-1.5'>
      <Label className='text-muted-foreground text-xs uppercase tracking-wider'>
        {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        type={type}
      />
    </div>
  );
}
