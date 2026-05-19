import { RingeeAiView } from '@/features/ai/components/ringee-ai-view';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ conversationId: string }> };

export default async function RingeeAiConversationPage({ params }: PageProps) {
  const { conversationId } = await params;
  return <RingeeAiView conversationId={conversationId} />;
}
