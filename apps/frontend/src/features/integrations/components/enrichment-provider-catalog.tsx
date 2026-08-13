'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EnrichmentConnectDialog } from './enrichment-connect-dialog';
import {
  ENRICHMENT_PROVIDER_META,
  type EnrichmentConnectionSummary,
  type EnrichmentProviderType
} from '../types/enrichment';

interface Props {
  connections: EnrichmentConnectionSummary[];
  onChange: () => void;
}

export function EnrichmentProviderCatalog({ connections, onChange }: Props) {
  const t = useTranslations('integrations.enrichment.catalog');
  const providers: EnrichmentProviderType[] = ['apollo', 'prospeo'];

  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {providers.map((p) => {
        const meta = ENRICHMENT_PROVIDER_META[p];
        const connected = connections.some(
          (c) => c.provider === p && c.status !== 'disconnected'
        );
        return (
          <Card key={p} className={meta.available ? '' : 'opacity-60'}>
            <CardHeader>
              <CardTitle className='flex items-center justify-between text-base'>
                <span className='flex items-center gap-2'>
                  <span
                    className='inline-block h-2.5 w-2.5 rounded-full'
                    style={{ backgroundColor: meta.color }}
                  />
                  {meta.name}
                </span>
                {meta.leadSearch && (
                  <Badge variant='secondary' className='gap-1'>
                    <Sparkles className='h-3 w-3' />
                    {t('leadSearch')}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{meta.shortDescription}</CardDescription>
            </CardHeader>
            <CardContent className='flex items-center justify-between'>
              <a
                href={meta.docsUrl}
                target='_blank'
                rel='noreferrer'
                className='text-muted-foreground text-xs underline'
              >
                {t('apiDocs')}
              </a>
              {meta.available ? (
                <EnrichmentConnectDialog
                  provider={p}
                  alreadyConnected={connected}
                  onConnected={onChange}
                />
              ) : (
                <Badge variant='outline'>{t('comingSoon')}</Badge>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
