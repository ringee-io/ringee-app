import { AgentWorkspace } from '@/features/dialer/components/agent-workspace';

export const metadata = {
  title: 'Dialer — Agent Workspace | Ringee',
  description: 'Make outbound calls with the progressive dialer.'
};

interface Props {
  params: Promise<{ campaignId: string }>;
}

export default async function DialerPage(props: Props) {
  const params = await props.params;

  return <AgentWorkspace campaignId={params.campaignId} />;
}
