'use client';

import { useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useFormatter, useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Radio,
  RefreshCw
} from 'lucide-react';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useExternalCarriers } from '../hooks/use-external-carriers';
import type { ExternalNumber, SipEndpoint } from '../types';
import { CarrierForm, EndpointForm, NumberForm } from './carrier-forms';

type Editor =
  | { kind: 'carrier'; edit?: boolean }
  | { kind: 'endpoint'; endpoint?: SipEndpoint }
  | { kind: 'number'; number?: ExternalNumber; endpointId?: string };
type Removal = {
  kind: 'carrier' | 'endpoint' | 'number';
  id: string;
  label: string;
};

export function ExternalCarriersPanel() {
  const { organization } = useOrganization();
  const { isLoaded, isOrgAdmin } = useOrgRole();
  const t = useTranslations('settings.byoc');
  if (!isLoaded) return <Skeleton className='h-32 w-full' />;
  if (!organization || !isOrgAdmin)
    return (
      <p className='text-muted-foreground py-8 text-sm'>
        {t('organizationOnly')}
      </p>
    );
  return <CarrierWorkspace key={organization.id} />;
}

function CarrierWorkspace() {
  const t = useTranslations('settings.byoc');
  const format = useFormatter();
  const data = useExternalCarriers();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [tab, setTab] = useState('extensions');
  const carrier = data.carriers.find((row) => row.id === selectedId);
  const numbers =
    carrier?.endpoints.flatMap((endpoint) =>
      endpoint.numbers.map((number) => ({
        ...number,
        endpointId: endpoint.id,
        extension: endpoint.extension
      }))
    ) ?? [];
  const base = carrier ? `/${carrier.id}` : '';
  const editingTitle =
    editor?.kind === 'carrier'
      ? t(editor.edit ? 'editCarrier' : 'addCarrier')
      : editor?.kind === 'endpoint'
        ? t(editor.endpoint ? 'editExtension' : 'addExtension')
        : t(
            editor?.kind === 'number' && editor.number
              ? 'editNumber'
              : 'addNumber'
          );
  const edit = (value: Editor) => {
    data.clearError();
    setRemoval(null);
    setEditor(value);
  };
  const back = () => {
    if (editor) setEditor(null);
    else {
      setSelectedId(null);
      setRemoval(null);
    }
    data.clearError();
  };
  const closeEditor = async (success: boolean) => {
    if (success) setEditor(null);
  };

  if (data.loading)
    return (
      <div className='space-y-3'>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className='h-20 w-full rounded-lg' />
        ))}
      </div>
    );
  if (data.loadError)
    return (
      <div role='alert' className='space-y-3 rounded-lg border p-4'>
        <p className='text-sm'>{data.loadError}</p>
        <Button variant='outline' onClick={() => void data.refresh()}>
          {t('retry')}
        </Button>
      </div>
    );

  return (
    <div className='space-y-5'>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {t('intro')}
      </p>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          {(carrier || editor) && (
            <Button
              variant='ghost'
              size='sm'
              className='text-muted-foreground mb-2 -ml-2'
              onClick={back}
              disabled={data.busy}
            >
              <ArrowLeft className='size-3.5' />
              {t(editor ? 'backToCarrier' : 'allCarriers')}
            </Button>
          )}
          <h3 className='text-sm font-semibold break-words'>
            {editor ? editingTitle : (carrier?.name ?? t('carriers'))}
          </h3>
          {!editor && carrier && (
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('counts', {
                extensions: carrier.endpoints.length,
                numbers: numbers.length
              })}
            </p>
          )}
        </div>
        {!editor && !carrier && (
          <Button size='sm' onClick={() => edit({ kind: 'carrier' })}>
            <Plus className='size-4' />
            {t('addCarrier')}
          </Button>
        )}
        {!editor && carrier && (
          <Actions label={t('carrierActions')} disabled={data.busy}>
            <DropdownMenuItem
              disabled={carrier.status === 'deleting'}
              onSelect={() => edit({ kind: 'carrier', edit: true })}
            >
              {t('editCarrier')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className='text-destructive'
              onSelect={() =>
                setRemoval({
                  kind: 'carrier',
                  id: carrier.id,
                  label: carrier.name
                })
              }
            >
              {t(
                carrier.status === 'deleting' ? 'retryDelete' : 'deleteCarrier'
              )}
            </DropdownMenuItem>
          </Actions>
        )}
      </div>

      {data.error && (
        <div
          role='alert'
          className='border-destructive/30 bg-destructive/5 rounded-lg border p-3 text-sm'
        >
          {data.error}
        </div>
      )}
      {carrier?.status === 'deleting' && (
        <p
          role='status'
          className='text-muted-foreground rounded-lg border p-3 text-sm'
        >
          {t('deletingHelp')}
        </p>
      )}

      {removal && (
        <div
          role='alert'
          className='border-destructive/30 space-y-3 rounded-lg border p-4'
        >
          <p className='text-sm font-medium'>
            {t('confirmDelete', { name: removal.label })}
          </p>
          <p className='text-muted-foreground text-xs'>
            {t(
              removal.kind === 'carrier'
                ? 'deleteCarrierHelp'
                : removal.kind === 'endpoint'
                  ? 'deleteExtensionHelp'
                  : 'deleteNumberHelp'
            )}
          </p>
          <div className='flex justify-end gap-2'>
            <Button
              variant='ghost'
              disabled={data.busy}
              onClick={() => setRemoval(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant='destructive'
              disabled={data.busy}
              onClick={async () => {
                const path =
                  removal.kind === 'carrier'
                    ? base
                    : `${base}/${removal.kind === 'endpoint' ? 'endpoints' : 'numbers'}/${removal.id}`;
                if (await data.mutate('delete', path)) {
                  setRemoval(null);
                  if (removal.kind === 'carrier') setSelectedId(null);
                }
              }}
            >
              {t(data.busy ? 'saving' : 'delete')}
            </Button>
          </div>
        </div>
      )}

      {editor?.kind === 'carrier' && (
        <CarrierForm
          key={editor.edit ? carrier?.id : 'new'}
          name={editor.edit ? carrier?.name : undefined}
          busy={data.busy}
          onCancel={() => setEditor(null)}
          onSave={async (name) =>
            closeEditor(
              await data.mutate(
                editor.edit ? 'patch' : 'post',
                editor.edit ? base : '',
                { name }
              )
            )
          }
        />
      )}
      {editor?.kind === 'endpoint' && carrier && (
        <EndpointForm
          key={editor.endpoint?.id ?? 'new'}
          endpoint={editor.endpoint}
          busy={data.busy}
          onCancel={() => setEditor(null)}
          onSave={async (input) =>
            closeEditor(
              await data.mutate(
                editor.endpoint ? 'patch' : 'post',
                `${base}/endpoints${editor.endpoint ? `/${editor.endpoint.id}` : ''}`,
                input
              )
            )
          }
        />
      )}
      {editor?.kind === 'number' && carrier && (
        <NumberForm
          key={editor.number?.id ?? 'new'}
          endpoints={carrier.endpoints}
          number={editor.number}
          endpointId={editor.endpointId}
          busy={data.busy}
          onCancel={() => setEditor(null)}
          onSave={async (input) =>
            closeEditor(
              await data.mutate(
                editor.number ? 'patch' : 'post',
                `${base}/numbers${editor.number ? `/${editor.number.id}` : ''}`,
                input
              )
            )
          }
        />
      )}

      {!editor && !carrier && (
        <div className='divide-y rounded-lg border'>
          {data.carriers.length === 0 ? (
            <div className='px-5 py-10 text-center'>
              <Radio className='text-muted-foreground mx-auto mb-3 size-5' />
              <p className='text-sm font-medium'>{t('emptyTitle')}</p>
              <p className='text-muted-foreground mx-auto mt-1 max-w-sm text-xs leading-relaxed'>
                {t('emptyHelp')}
              </p>
            </div>
          ) : (
            data.carriers.map((row) => (
              <button
                type='button'
                key={row.id}
                className='hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-3 px-4 py-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none'
                onClick={() => {
                  setSelectedId(row.id);
                  setTab('extensions');
                  data.clearError();
                }}
              >
                <Radio className='text-muted-foreground size-4 shrink-0' />
                <span className='min-w-0 flex-1'>
                  <span className='block text-sm font-medium break-words'>
                    {row.name}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {row.status === 'deleting'
                      ? t('retryDelete')
                      : t('counts', {
                          extensions: row.endpoints.length,
                          numbers: row.endpoints.reduce(
                            (count, endpoint) =>
                              count + endpoint.numbers.length,
                            0
                          )
                        })}
                  </span>
                </span>
                <ChevronRight className='text-muted-foreground size-4 shrink-0' />
              </button>
            ))
          )}
        </div>
      )}

      {!editor && carrier && carrier.status === 'active' && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label={t('carrierSections')}>
            <TabsTrigger value='extensions'>{t('extensions')}</TabsTrigger>
            <TabsTrigger value='numbers'>{t('numbers')}</TabsTrigger>
          </TabsList>
          <TabsContent value='extensions' className='mt-4 space-y-3'>
            <div className='flex items-center justify-between gap-4'>
              <p className='text-muted-foreground text-xs'>
                {t('extensionsHelp')}
              </p>
              <Button
                variant='outline'
                size='sm'
                disabled={data.busy}
                onClick={() => edit({ kind: 'endpoint' })}
              >
                <Plus className='size-3.5' />
                {t('addExtension')}
              </Button>
            </div>
            <div className='divide-y rounded-lg border'>
              {carrier.endpoints.length === 0 ? (
                <p className='text-muted-foreground px-4 py-8 text-center text-sm'>
                  {t('emptyExtensions')}
                </p>
              ) : (
                carrier.endpoints.map((endpoint) => (
                  <div key={endpoint.id} className='space-y-2 p-4'>
                    <div className='flex items-start gap-3'>
                      <div className='min-w-0 flex-1'>
                        <p className='text-sm font-medium'>
                          {t('extensionLabel', {
                            extension: endpoint.extension
                          })}
                        </p>
                        <p className='text-muted-foreground mt-1 text-xs break-all'>
                          {endpoint.proxy} · {endpoint.transport}
                        </p>
                      </div>
                      <Badge
                        variant='outline'
                        className={cn(
                          'shrink-0',
                          endpoint.registrationStatus === 'registered' &&
                            endpoint.syncStatus === 'synced' &&
                            'border-emerald-600/30 text-emerald-700 dark:text-emerald-400'
                        )}
                      >
                        {t(
                          endpoint.syncStatus === 'synced'
                            ? `registration.${endpoint.registrationStatus}`
                            : `sync.${endpoint.syncStatus}`
                        )}
                      </Badge>
                      <Actions
                        label={t('extensionActions', {
                          extension: endpoint.extension
                        })}
                        disabled={data.busy}
                      >
                        <DropdownMenuItem
                          disabled={endpoint.syncStatus === 'deleting'}
                          onSelect={() => edit({ kind: 'endpoint', endpoint })}
                        >
                          {t('editExtension')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={endpoint.numbers.length > 0}
                          onSelect={() =>
                            setRemoval({
                              kind: 'endpoint',
                              id: endpoint.id,
                              label: t('extensionLabel', {
                                extension: endpoint.extension
                              })
                            })
                          }
                          className='text-destructive'
                        >
                          {t('deleteExtension')}
                        </DropdownMenuItem>
                      </Actions>
                    </div>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <p className='text-muted-foreground text-xs'>
                        {endpoint.lastCheckedAt
                          ? t('lastChecked', {
                              date: format.dateTime(
                                new Date(endpoint.lastCheckedAt),
                                { dateStyle: 'short', timeStyle: 'short' }
                              )
                            })
                          : t('neverChecked')}
                      </p>
                      {endpoint.syncStatus !== 'deleting' && (
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={data.busy}
                          onClick={() =>
                            void data.mutate(
                              'post',
                              `${base}/endpoints/${endpoint.id}/${endpoint.syncStatus === 'synced' ? 'check-registration' : 'sync'}`
                            )
                          }
                        >
                          <RefreshCw
                            className={cn(
                              'size-3.5',
                              data.busy && 'motion-safe:animate-spin'
                            )}
                          />
                          {t(
                            endpoint.syncStatus === 'synced'
                              ? 'checkRegistration'
                              : 'retryConnection'
                          )}
                        </Button>
                      )}
                    </div>
                    {endpoint.lastRegisteredAt && (
                      <p className='text-muted-foreground text-xs'>
                        {t('lastRegistered', {
                          date: format.dateTime(
                            new Date(endpoint.lastRegisteredAt),
                            { dateStyle: 'short', timeStyle: 'short' }
                          )
                        })}
                      </p>
                    )}
                    {endpoint.syncStatus !== 'synced' && (
                      <p className='text-muted-foreground text-xs'>
                        {t('syncHelp')}
                      </p>
                    )}
                    {endpoint.registrationStatus === 'failed' && (
                      <p className='text-muted-foreground text-xs'>
                        {t('registrationFailedHelp')}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>
          <TabsContent value='numbers' className='mt-4 space-y-3'>
            <div className='flex items-center justify-between gap-4'>
              <p className='text-muted-foreground text-xs'>
                {t('numbersHelp')}
              </p>
              <Button
                variant='outline'
                size='sm'
                disabled={
                  data.busy ||
                  !carrier.endpoints.some(
                    (row) => row.syncStatus !== 'deleting'
                  )
                }
                onClick={() => edit({ kind: 'number' })}
              >
                <Plus className='size-3.5' />
                {t('addNumber')}
              </Button>
            </div>
            <div className='divide-y rounded-lg border'>
              {numbers.length === 0 ? (
                <p className='text-muted-foreground px-4 py-8 text-center text-sm'>
                  {t(
                    carrier.endpoints.length ? 'emptyNumbers' : 'needsExtension'
                  )}
                </p>
              ) : (
                numbers.map((number) => (
                  <div key={number.id} className='flex items-center gap-3 p-4'>
                    <div className='min-w-0 flex-1'>
                      <p className='font-mono text-sm'>{number.phoneNumber}</p>
                      <p className='text-muted-foreground mt-1 text-xs'>
                        {t('extensionLabel', { extension: number.extension })}
                      </p>
                    </div>
                    <Badge variant='outline'>
                      {t(number.active ? 'active' : 'inactive')}
                    </Badge>
                    <Actions
                      label={t('numberActions', { number: number.phoneNumber })}
                      disabled={data.busy}
                    >
                      <DropdownMenuItem
                        onSelect={() =>
                          edit({
                            kind: 'number',
                            number,
                            endpointId: number.endpointId
                          })
                        }
                      >
                        {t('editNumber')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className='text-destructive'
                        onSelect={() =>
                          setRemoval({
                            kind: 'number',
                            id: number.id,
                            label: number.phoneNumber
                          })
                        }
                      >
                        {t('deleteNumber')}
                      </DropdownMenuItem>
                    </Actions>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Actions({
  label,
  disabled,
  children
}: {
  label: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='size-9 shrink-0'
          aria-label={label}
          disabled={disabled}
        >
          <MoreHorizontal className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
