import { AgentWorkspace } from '@/features/dialer/components/agent-workspace';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('dialer.workspace');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

interface Props {
  params: Promise<{ campaignId: string }>;
}

export default async function DialerPage(props: Props) {
  const params = await props.params;

  return <AgentWorkspace campaignId={params.campaignId} />;
}
