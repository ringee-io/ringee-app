'use client';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { Bot, PlugZap, Sparkles, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { CrmTab } from './tabs/crm-tab';
import { EnrichmentTab } from './tabs/enrichment-tab';
import { CustomIntegrationsTab } from './tabs/custom-integrations-tab';
import { ConnectorsTab } from './tabs/connectors-tab';
import { LeadSearchPanel } from './lead-search-panel';

export default function IntegrationsViewPage() {
  const t = useTranslations('crm');
  // CRM, Data Enrichment and Custom Integrations are admin-only (freelancers
  // count as admin). Members keep the Leads (prospecting) tab.
  const { canAccessAdminFeatures } = useOrgRole();

  return (
    <Tabs
      defaultValue={canAccessAdminFeatures ? 'crm' : 'leads'}
      className='w-full'
    >
      <TabsList>
        {canAccessAdminFeatures && (
          <TabsTrigger value='crm'>{t('tabs.crm')}</TabsTrigger>
        )}
        {canAccessAdminFeatures && (
          <TabsTrigger value='enrichment' className='gap-1.5'>
            <Sparkles className='h-3.5 w-3.5' /> {t('tabs.enrichment')}
          </TabsTrigger>
        )}
        <TabsTrigger value='leads' className='gap-1.5'>
          <Users className='h-3.5 w-3.5' /> {t('tabs.leads')}
        </TabsTrigger>
        {canAccessAdminFeatures && (
          <TabsTrigger value='custom' className='gap-1.5'>
            <PlugZap className='h-3.5 w-3.5' /> {t('tabs.custom')}
          </TabsTrigger>
        )}
        {/* {canAccessAdminFeatures && ( */}
        <TabsTrigger value='connectors' className='gap-1.5'>
          <Bot className='h-3.5 w-3.5' /> {t('tabs.connectors')}
        </TabsTrigger>
        {/* )} */}
      </TabsList>

      {canAccessAdminFeatures && (
        <TabsContent value='enrichment' className='mt-6'>
          <EnrichmentTab />
        </TabsContent>
      )}

      <TabsContent value='leads' className='mt-6'>
        <LeadSearchPanel />
      </TabsContent>

      {canAccessAdminFeatures && (
        <TabsContent value='custom' className='mt-6'>
          <CustomIntegrationsTab />
        </TabsContent>
      )}

      {/* {canAccessAdminFeatures && ( */}
      <TabsContent value='connectors' className='mt-6'>
        <ConnectorsTab />
      </TabsContent>
      {/* )} */}

      {canAccessAdminFeatures && (
        <TabsContent value='crm' className='mt-6'>
          <CrmTab />
        </TabsContent>
      )}
    </Tabs>
  );
}
