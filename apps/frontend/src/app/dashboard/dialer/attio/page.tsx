import { AttioDialer } from '@/features/integrations/components/attio-dialer';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('integrations.attioDialer');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

export default function AttioDialerPage() {
  return <AttioDialer />;
}
