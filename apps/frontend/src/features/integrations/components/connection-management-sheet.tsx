'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@ringee/frontend-shared/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { Clock, ArrowDownToLine, Settings2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CrmConnectionSummary } from '../types/crm';
import { PROVIDER_META } from '../types/crm';
import { SyncHistoryTab } from './tabs/sync-history-tab';
import { InboundSyncTab } from './tabs/inbound-sync-tab';
import { FieldMappingsTab } from './tabs/field-mappings-tab';
import { TeamTab } from './tabs/team-tab';

interface Props {
  connection: CrmConnectionSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionManagementSheet({
  connection,
  open,
  onOpenChange
}: Props) {
  const t = useTranslations('crm');
  if (!connection) return null;

  const meta = PROVIDER_META[connection.provider];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex w-full flex-col p-0 sm:max-w-2xl'>
        <SheetHeader className='shrink-0 border-b px-6 pt-6 pb-4'>
          <div className='flex items-center gap-3'>
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border font-semibold ${meta.color}`}
            >
              {meta.name.slice(0, 1)}
            </div>
            <div className='min-w-0'>
              <SheetTitle className='flex items-center gap-2 text-base'>
                {meta.name}
                <Badge variant='outline' className='text-[10px] font-normal'>
                  {connection.scope === 'organization'
                    ? t('scope.organization')
                    : t('scope.personal')}
                </Badge>
              </SheetTitle>
              <SheetDescription className='truncate text-xs'>
                {connection.accountName ?? connection.accountId}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs
          defaultValue='syncs'
          className='flex flex-1 flex-col overflow-hidden'
        >
          <div className='shrink-0 border-b px-6'>
            <TabsList className='h-10 w-full justify-start rounded-none bg-transparent p-0'>
              <TabsTrigger
                value='syncs'
                className='data-[state=active]:border-primary relative gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none'
              >
                <Clock className='h-3.5 w-3.5' />
                {t('managementSheet.syncHistory')}
                {(connection.failed > 0 || connection.needsResolution > 0) && (
                  <Badge
                    variant='destructive'
                    className='ml-1 h-4 min-w-4 px-1 text-[10px]'
                  >
                    {connection.failed + connection.needsResolution}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value='import'
                className='data-[state=active]:border-primary relative gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none'
              >
                <ArrowDownToLine className='h-3.5 w-3.5' />
                {t('managementSheet.import')}
              </TabsTrigger>
              <TabsTrigger
                value='mappings'
                className='data-[state=active]:border-primary relative gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none'
              >
                <Settings2 className='h-3.5 w-3.5' />
                {t('managementSheet.fieldMappings')}
              </TabsTrigger>
              <TabsTrigger
                value='team'
                className='data-[state=active]:border-primary relative gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none'
              >
                <Users className='h-3.5 w-3.5' />
                {t('managementSheet.team')}
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className='flex-1'>
            <div className='p-6'>
              <TabsContent value='syncs' className='mt-0'>
                <SyncHistoryTab connectionId={connection.id} />
              </TabsContent>
              <TabsContent value='import' className='mt-0'>
                <InboundSyncTab connection={connection} />
              </TabsContent>
              <TabsContent value='mappings' className='mt-0'>
                <FieldMappingsTab connection={connection} />
              </TabsContent>
              <TabsContent value='team' className='mt-0'>
                <TeamTab
                  connectionId={connection.id}
                  provider={connection.provider}
                />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
